create or replace function public.play_mystery_scratch_v1(p_client_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_open public.mystery_openings%rowtype;
  v_card public.scratchcards%rowtype;
  v_version public.scratch_math_versions%rowtype;
  v_outcome public.scratch_outcomes%rowtype;
  v_play public.plays%rowtype;
  v_total numeric;
  v_pick numeric;
  v_cursor numeric := 0;
  v_balance_before numeric(12,2);
  v_balance_after numeric(12,2);
  v_points_before integer;
  v_points_after integer;
  v_rarity_slug text;
  v_result_type text;
  v_card_title text;
begin
  if v_user is null or p_client_request_id is null then
    raise exception 'Usuário e requisição são obrigatórios';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'mystery:' || v_user::text || ':' || p_client_request_id::text,
      0
    )
  );

  select * into v_open
  from public.mystery_openings
  where user_id = v_user
    and client_request_id = p_client_request_id
  for update;

  if not found then
    perform public.open_mystery_scratch_v1(p_client_request_id);

    select * into v_open
    from public.mystery_openings
    where user_id = v_user
      and client_request_id = p_client_request_id
    for update;
  end if;

  if v_open.id is null or v_open.math_version_id is null then
    raise exception 'Abertura misteriosa inválida';
  end if;

  select * into v_play
  from public.plays
  where user_id = v_user
    and client_request_id = p_client_request_id
  limit 1;

  if found then
    if v_play.card_id is distinct from v_open.scratchcard_id
       or v_play.math_version_id is distinct from v_open.math_version_id
       or v_play.source <> 'mystery' then
      raise exception 'Identificador de requisição já utilizado em outra operação';
    end if;

    select c.title, r.slug
    into v_card_title, v_rarity_slug
    from public.scratchcards c
    join public.scratch_math_versions mv on mv.id = v_play.math_version_id
    left join public.scratch_rarities r on r.id = mv.rarity_id
    where c.id = v_play.card_id;

    if v_play.balance_after is null or v_play.points_after is null then
      select balance, points
      into v_balance_after, v_points_after
      from public.profiles
      where id = v_user;
    else
      v_balance_after := v_play.balance_after;
      v_points_after := v_play.points_after;
    end if;

    v_result_type := case
      when v_play.prize > 0 and v_play.points_earned > 0 then 'combined'
      when v_play.prize > 0 then 'credits'
      when v_play.points_earned > 0 then 'points'
      else 'none'
    end;

    return pg_catalog.jsonb_build_object(
      'id', v_play.id,
      'mystery_opening_id', v_open.id,
      'mystery_version_id', v_open.mystery_version_id,
      'scratchcard_id', v_play.card_id,
      'card_title', v_card_title,
      'math_version_id', v_play.math_version_id,
      'prize', v_play.prize,
      'points_earned', v_play.points_earned,
      'new_balance', v_balance_after,
      'new_points', v_points_after,
      'rarity_slug', v_rarity_slug,
      'result_type', v_result_type,
      'idempotent', true
    );
  end if;

  select * into v_card
  from public.scratchcards
  where id = v_open.scratchcard_id
  for update;

  if not found then
    raise exception 'Raspadinha selecionada não existe mais';
  end if;

  select * into v_version
  from public.scratch_math_versions
  where id = v_open.math_version_id
  for share;

  if not found
     or v_version.scratchcard_id is distinct from v_open.scratchcard_id
     or v_version.status not in ('PUBLISHED', 'RETIRED') then
    raise exception 'Versão matemática persistida inválida';
  end if;

  select r.slug
  into v_rarity_slug
  from public.scratch_rarities r
  where r.id = v_version.rarity_id;

  if v_rarity_slug is null then
    raise exception 'Versão matemática sem raridade válida';
  end if;

  select coalesce(pg_catalog.sum(weight), 0)
  into v_total
  from public.scratch_outcomes
  where math_version_id = v_version.id;

  if v_total <= 0 or exists (
    select 1
    from public.scratch_outcomes
    where math_version_id = v_version.id
      and (weight <= 0 or prize < 0 or points < 0)
  ) then
    raise exception 'Versão matemática persistida inválida';
  end if;

  select balance, points
  into v_balance_before, v_points_before
  from public.profiles
  where id = v_user
  for update;

  if not found then
    raise exception 'Perfil inexistente';
  end if;

  if coalesce(v_balance_before, 0) < v_card.price then
    raise exception 'Saldo insuficiente';
  end if;

  v_pick := pg_catalog.random() * v_total;

  for v_outcome in
    select *
    from public.scratch_outcomes
    where math_version_id = v_version.id
    order by id
  loop
    v_cursor := v_cursor + v_outcome.weight;
    if v_pick < v_cursor then
      exit;
    end if;
  end loop;

  if v_outcome.id is null then
    raise exception 'Falha ao selecionar resultado';
  end if;

  update public.profiles
  set balance = balance - v_card.price + v_outcome.prize,
      points = points + v_outcome.points
  where id = v_user
  returning balance, points into v_balance_after, v_points_after;

  insert into public.plays(
    user_id,
    card_id,
    price,
    prize,
    points_earned,
    math_version_id,
    client_request_id,
    outcome_id,
    source,
    balance_after,
    points_after
  )
  values(
    v_user,
    v_open.scratchcard_id,
    v_card.price,
    v_outcome.prize,
    v_outcome.points,
    v_open.math_version_id,
    p_client_request_id,
    v_outcome.id,
    'mystery',
    v_balance_after,
    v_points_after
  )
  returning * into v_play;

  insert into public.credit_ledger(
    user_id,
    amount,
    balance_before,
    balance_after,
    transaction_type,
    reference_type,
    reference_id,
    metadata
  )
  values(
    v_user,
    -v_card.price,
    v_balance_before,
    v_balance_before - v_card.price,
    'SCRATCH_COST',
    'play',
    v_play.id,
    pg_catalog.jsonb_build_object(
      'card_id', v_card.id,
      'mystery_opening_id', v_open.id,
      'mystery_version_id', v_open.mystery_version_id,
      'math_version_id', v_open.math_version_id
    )
  );

  if v_play.prize > 0 then
    insert into public.credit_ledger(
      user_id,
      amount,
      balance_before,
      balance_after,
      transaction_type,
      reference_type,
      reference_id,
      metadata
    )
    values(
      v_user,
      v_play.prize,
      v_balance_before - v_card.price,
      v_balance_after,
      'SCRATCH_REWARD',
      'play',
      v_play.id,
      pg_catalog.jsonb_build_object(
        'outcome_id', v_play.outcome_id,
        'mystery_opening_id', v_open.id,
        'mystery_version_id', v_open.mystery_version_id,
        'math_version_id', v_open.math_version_id
      )
    );
  end if;

  if v_play.points_earned > 0 then
    insert into public.points_ledger(
      user_id,
      amount,
      balance_before,
      balance_after,
      transaction_type,
      reference_type,
      reference_id,
      metadata
    )
    values(
      v_user,
      v_play.points_earned,
      v_points_before,
      v_points_after,
      'SCRATCH_REWARD',
      'play',
      v_play.id,
      pg_catalog.jsonb_build_object(
        'outcome_id', v_play.outcome_id,
        'mystery_opening_id', v_open.id,
        'mystery_version_id', v_open.mystery_version_id,
        'math_version_id', v_open.math_version_id
      )
    );
  end if;

  v_result_type := case
    when v_play.prize > 0 and v_play.points_earned > 0 then 'combined'
    when v_play.prize > 0 then 'credits'
    when v_play.points_earned > 0 then 'points'
    else 'none'
  end;

  return pg_catalog.jsonb_build_object(
    'id', v_play.id,
    'mystery_opening_id', v_open.id,
    'mystery_version_id', v_open.mystery_version_id,
    'scratchcard_id', v_play.card_id,
    'card_title', v_card.title,
    'math_version_id', v_play.math_version_id,
    'prize', v_play.prize,
    'points_earned', v_play.points_earned,
    'new_balance', v_balance_after,
    'new_points', v_points_after,
    'rarity_slug', v_rarity_slug,
    'result_type', v_result_type,
    'idempotent', false
  );
end;
$$;

revoke execute on function public.play_mystery_scratch_v1(uuid) from public, anon;
grant execute on function public.play_mystery_scratch_v1(uuid) to authenticated;
