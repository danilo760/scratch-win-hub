CREATE OR REPLACE FUNCTION public.play_scratchcard_v1(p_card_id uuid, p_client_request_id uuid, p_source text DEFAULT 'web'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user uuid := auth.uid();
  v_card scratchcards%rowtype;
  v_version scratch_math_versions%rowtype;
  v_outcome scratch_outcomes%rowtype;
  v_total numeric;
  v_pick numeric;
  v_cursor numeric := 0;
  v_play plays%rowtype;
  v_balance_before numeric(12,2);
  v_balance_after numeric(12,2);
  v_points_before integer;
  v_points_after integer;
  v_result_type text;
  v_rarity_slug text;
begin
  if v_user is null or p_client_request_id is null then
    raise exception 'Usuário e requisição são obrigatórios';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_user::text || ':' || p_client_request_id::text, 0)
  );

  select * into v_play
  from plays
  where user_id = v_user and client_request_id = p_client_request_id
  limit 1;

  if found then
    if v_play.card_id is distinct from p_card_id then
      raise exception 'Identificador de requisição já utilizado em outra raspadinha';
    end if;

    if v_play.balance_after is null or v_play.points_after is null then
      select balance, points
      into v_balance_after, v_points_after
      from profiles
      where id = v_user;
    else
      v_balance_after := v_play.balance_after;
      v_points_after := v_play.points_after;
    end if;

    select r.slug into v_rarity_slug
    from scratch_math_versions mv
    join scratch_rarities r on r.id = mv.rarity_id
    where mv.id = v_play.math_version_id;

    v_result_type := case
      when v_play.prize > 0 and v_play.points_earned > 0 then 'combined'
      when v_play.prize > 0 then 'credits'
      when v_play.points_earned > 0 then 'points'
      else 'none'
    end;

    return jsonb_build_object(
      'id', v_play.id,
      'prize', v_play.prize,
      'points_earned', v_play.points_earned,
      'new_balance', v_balance_after,
      'new_points', v_points_after,
      'math_version_id', v_play.math_version_id,
      'rarity_slug', v_rarity_slug,
      'result_type', v_result_type,
      'idempotent', true
    );
  end if;

  select * into v_card
  from scratchcards
  where id = p_card_id and active = true
  for update;
  if not found then raise exception 'Raspadinha indisponível'; end if;

  select * into v_version
  from scratch_math_versions
  where scratchcard_id = p_card_id and status = 'PUBLISHED'
  order by published_at desc nulls last, created_at desc, id desc
  limit 1;
  if not found then raise exception 'Raspadinha sem versão matemática publicada'; end if;

  select r.slug into v_rarity_slug
  from scratch_rarities r
  where r.id = v_version.rarity_id;
  if v_rarity_slug is null then raise exception 'Versão matemática sem raridade válida'; end if;

  select coalesce(sum(weight),0) into v_total
  from scratch_outcomes
  where math_version_id = v_version.id;
  if v_total <= 0 then raise exception 'Versão matemática inválida'; end if;

  select balance, points
  into v_balance_before, v_points_before
  from profiles
  where id = v_user
  for update;
  if coalesce(v_balance_before,0) < v_card.price then raise exception 'Saldo insuficiente'; end if;

  v_pick := random() * v_total;
  for v_outcome in
    select * from scratch_outcomes
    where math_version_id = v_version.id
    order by id
  loop
    v_cursor := v_cursor + v_outcome.weight;
    if v_pick < v_cursor then exit; end if;
  end loop;

  if v_outcome.id is null then
    raise exception 'Falha ao selecionar resultado';
  end if;

  update profiles
  set balance = balance - v_card.price + v_outcome.prize,
      points = points + v_outcome.points
  where id = v_user
  returning balance, points into v_balance_after, v_points_after;

  insert into plays(
    user_id, card_id, price, prize, points_earned,
    math_version_id, client_request_id, outcome_id, source,
    balance_after, points_after
  )
  values(
    v_user, p_card_id, v_card.price, v_outcome.prize, v_outcome.points,
    v_version.id, p_client_request_id, v_outcome.id, left(coalesce(p_source,'web'),32),
    v_balance_after, v_points_after
  )
  returning * into v_play;

  insert into credit_ledger(
    user_id, amount, balance_before, balance_after,
    transaction_type, reference_type, reference_id, metadata
  )
  values(
    v_user, -v_card.price, v_balance_before, v_balance_before - v_card.price,
    'SCRATCH_COST', 'play', v_play.id, jsonb_build_object('card_id', v_card.id)
  );

  if v_play.prize > 0 then
    insert into credit_ledger(
      user_id, amount, balance_before, balance_after,
      transaction_type, reference_type, reference_id, metadata
    )
    values(
      v_user, v_play.prize, v_balance_before - v_card.price, v_balance_after,
      'SCRATCH_REWARD', 'play', v_play.id, jsonb_build_object('outcome_id', v_play.outcome_id)
    );
  end if;

  if v_play.points_earned > 0 then
    insert into points_ledger(
      user_id, amount, balance_before, balance_after,
      transaction_type, reference_type, reference_id, metadata
    )
    values(
      v_user, v_play.points_earned, v_points_before, v_points_after,
      'SCRATCH_REWARD', 'play', v_play.id, jsonb_build_object('outcome_id', v_play.outcome_id)
    );
  end if;

  v_result_type := case
    when v_play.prize > 0 and v_play.points_earned > 0 then 'combined'
    when v_play.prize > 0 then 'credits'
    when v_play.points_earned > 0 then 'points'
    else 'none'
  end;

  return jsonb_build_object(
    'id', v_play.id,
    'prize', v_play.prize,
    'points_earned', v_play.points_earned,
    'new_balance', v_balance_after,
    'new_points', v_points_after,
    'math_version_id', v_play.math_version_id,
    'rarity_slug', v_rarity_slug,
    'result_type', v_result_type,
    'idempotent', false
  );
end;
$function$;
