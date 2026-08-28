alter table public.plays
  add column if not exists balance_after numeric(12,2),
  add column if not exists points_after integer;

alter table public.redemptions
  add column if not exists points_after integer;

update public.plays p
set balance_after = (
  select cl.balance_after
  from public.credit_ledger cl
  where cl.reference_type = 'play' and cl.reference_id = p.id
  order by cl.created_at desc, cl.id desc
  limit 1
)
where p.balance_after is null
  and exists (
    select 1 from public.credit_ledger cl
    where cl.reference_type = 'play' and cl.reference_id = p.id
  );

update public.plays p
set points_after = (
  select pl.balance_after
  from public.points_ledger pl
  where pl.reference_type = 'play' and pl.reference_id = p.id
  order by pl.created_at desc, pl.id desc
  limit 1
)
where p.points_after is null
  and exists (
    select 1 from public.points_ledger pl
    where pl.reference_type = 'play' and pl.reference_id = p.id
  );

update public.redemptions r
set points_after = (
  select pl.balance_after
  from public.points_ledger pl
  where pl.reference_type = 'redemption' and pl.reference_id = r.id
  order by pl.created_at desc, pl.id desc
  limit 1
)
where r.points_after is null
  and exists (
    select 1 from public.points_ledger pl
    where pl.reference_type = 'redemption' and pl.reference_id = r.id
  );

create or replace function public.play_scratchcard_v1(
  p_card_id uuid,
  p_client_request_id uuid,
  p_source text default 'web'::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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
begin
  if v_user is null or p_client_request_id is null then
    raise exception 'Usuário e requisição são obrigatórios';
  end if;

  select * into v_play
  from plays
  where user_id = v_user and client_request_id = p_client_request_id
  limit 1;

  if found then
    if v_play.balance_after is null or v_play.points_after is null then
      select balance, points
      into v_balance_after, v_points_after
      from profiles
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

    return jsonb_build_object(
      'id', v_play.id,
      'prize', v_play.prize,
      'points_earned', v_play.points_earned,
      'new_balance', v_balance_after,
      'new_points', v_points_after,
      'math_version_id', v_play.math_version_id,
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
  order by published_at desc
  limit 1;
  if not found then raise exception 'Raspadinha sem versão matemática publicada'; end if;

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

  v_pick := floor(random() * v_total) + 1;
  for v_outcome in
    select * from scratch_outcomes where math_version_id = v_version.id order by id
  loop
    v_cursor := v_cursor + v_outcome.weight;
    if v_pick <= v_cursor then exit; end if;
  end loop;

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

  if v_outcome.prize > 0 then
    insert into credit_ledger(
      user_id, amount, balance_before, balance_after,
      transaction_type, reference_type, reference_id, metadata
    )
    values(
      v_user, v_outcome.prize, v_balance_before - v_card.price, v_balance_after,
      'SCRATCH_REWARD', 'play', v_play.id, jsonb_build_object('outcome_id', v_outcome.id)
    );
  end if;

  if v_outcome.points > 0 then
    insert into points_ledger(
      user_id, amount, balance_before, balance_after,
      transaction_type, reference_type, reference_id, metadata
    )
    values(
      v_user, v_outcome.points, v_points_before, v_points_after,
      'SCRATCH_REWARD', 'play', v_play.id, jsonb_build_object('outcome_id', v_outcome.id)
    );
  end if;

  v_result_type := case
    when v_outcome.prize > 0 and v_outcome.points > 0 then 'combined'
    when v_outcome.prize > 0 then 'credits'
    when v_outcome.points > 0 then 'points'
    else 'none'
  end;

  return jsonb_build_object(
    'id', v_play.id,
    'prize', v_outcome.prize,
    'points_earned', v_outcome.points,
    'new_balance', v_balance_after,
    'new_points', v_points_after,
    'math_version_id', v_version.id,
    'result_type', v_result_type,
    'idempotent', false
  );
end;
$function$;

create or replace function public.claim_daily_scratch_v1(
  p_card_id uuid,
  p_client_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_date date := (now() at time zone 'America/Sao_Paulo')::date;
  v_claim daily_scratch_claims%rowtype;
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
begin
  if v_user is null or p_client_request_id is null then raise exception 'Requisição inválida'; end if;
  if not exists(
    select 1 from scratchcards
    where id = p_card_id and active = true and is_daily_eligible = true
  ) then raise exception 'Raspadinha diária indisponível'; end if;

  insert into daily_scratch_claims(user_id, claim_date)
  values(v_user, v_date)
  on conflict(user_id, claim_date) do nothing
  returning * into v_claim;

  if not found then
    select * into v_claim
    from daily_scratch_claims
    where user_id = v_user and claim_date = v_date;

    if v_claim.scratch_play_id is not null then
      select * into v_play from plays where id = v_claim.scratch_play_id;
      if v_play.balance_after is null or v_play.points_after is null then
        select balance, points into v_balance_after, v_points_after
        from profiles where id = v_user;
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
      return jsonb_build_object(
        'id', v_play.id,
        'prize', v_play.prize,
        'points_earned', v_play.points_earned,
        'new_balance', v_balance_after,
        'new_points', v_points_after,
        'math_version_id', v_play.math_version_id,
        'result_type', v_result_type,
        'already_claimed', true,
        'idempotent', true
      );
    end if;

    raise exception 'Cortesia diária em processamento';
  end if;

  select * into v_version
  from scratch_math_versions
  where scratchcard_id = p_card_id and status = 'PUBLISHED'
  order by published_at desc
  limit 1;
  if not found then raise exception 'Raspadinha diária sem matemática publicada'; end if;

  select coalesce(sum(weight),0) into v_total
  from scratch_outcomes where math_version_id = v_version.id;
  if v_total <= 0 then raise exception 'Matemática inválida'; end if;

  v_pick := floor(random() * v_total) + 1;
  for v_outcome in
    select * from scratch_outcomes where math_version_id = v_version.id order by id
  loop
    v_cursor := v_cursor + v_outcome.weight;
    if v_pick <= v_cursor then exit; end if;
  end loop;

  select balance, points into v_balance_before, v_points_before
  from profiles where id = v_user for update;

  update profiles
  set balance = balance + v_outcome.prize,
      points = points + v_outcome.points
  where id = v_user
  returning balance, points into v_balance_after, v_points_after;

  insert into plays(
    user_id, card_id, price, prize, points_earned,
    math_version_id, client_request_id, outcome_id, source,
    balance_after, points_after
  )
  values(
    v_user, p_card_id, 0, v_outcome.prize, v_outcome.points,
    v_version.id, p_client_request_id, v_outcome.id, 'daily',
    v_balance_after, v_points_after
  )
  returning * into v_play;

  if v_outcome.prize > 0 then
    insert into credit_ledger(
      user_id, amount, balance_before, balance_after,
      transaction_type, reference_type, reference_id, metadata
    )
    values(
      v_user, v_outcome.prize, v_balance_before, v_balance_after,
      'DAILY_REWARD', 'play', v_play.id, jsonb_build_object('outcome_id', v_outcome.id)
    );
  end if;

  if v_outcome.points > 0 then
    insert into points_ledger(
      user_id, amount, balance_before, balance_after,
      transaction_type, reference_type, reference_id, metadata
    )
    values(
      v_user, v_outcome.points, v_points_before, v_points_after,
      'DAILY_REWARD', 'play', v_play.id, jsonb_build_object('outcome_id', v_outcome.id)
    );
  end if;

  update daily_scratch_claims set scratch_play_id = v_play.id where id = v_claim.id;

  v_result_type := case
    when v_outcome.prize > 0 and v_outcome.points > 0 then 'combined'
    when v_outcome.prize > 0 then 'credits'
    when v_outcome.points > 0 then 'points'
    else 'none'
  end;

  return jsonb_build_object(
    'id', v_play.id,
    'prize', v_play.prize,
    'points_earned', v_play.points_earned,
    'new_balance', v_balance_after,
    'new_points', v_points_after,
    'math_version_id', v_version.id,
    'result_type', v_result_type,
    'already_claimed', false,
    'idempotent', false
  );
end;
$function$;

create or replace function public.open_mystery_scratch_v1(p_client_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_version mystery_versions%rowtype;
  v_entry mystery_version_entries%rowtype;
  v_total numeric;
  v_pick numeric;
  v_cursor numeric := 0;
  v_math uuid;
  v_open mystery_openings%rowtype;
begin
  if v_user is null or p_client_request_id is null then raise exception 'Requisição inválida'; end if;

  select * into v_open
  from mystery_openings
  where user_id = v_user and client_request_id = p_client_request_id;

  if found then
    return jsonb_build_object(
      'id', v_open.id,
      'scratchcard_id', v_open.scratchcard_id,
      'math_version_id', v_open.math_version_id,
      'mystery_version_id', v_open.mystery_version_id,
      'idempotent', true
    );
  end if;

  select * into v_version
  from mystery_versions
  where status = 'PUBLISHED'
  order by published_at desc
  limit 1
  for update;
  if not found then raise exception 'Pool misterioso indisponível'; end if;

  select coalesce(sum(weight),0) into v_total
  from mystery_version_entries
  where mystery_version_id = v_version.id;
  if v_total <= 0 then raise exception 'Pool misterioso inválido'; end if;

  v_pick := floor(random() * v_total) + 1;
  for v_entry in
    select * from mystery_version_entries
    where mystery_version_id = v_version.id
    order by id
  loop
    v_cursor := v_cursor + v_entry.weight;
    if v_pick <= v_cursor then exit; end if;
  end loop;

  select id into v_math
  from scratch_math_versions
  where scratchcard_id = v_entry.scratchcard_id and status = 'PUBLISHED'
  order by published_at desc
  limit 1;
  if v_math is null then raise exception 'Cartela selecionada sem matemática publicada'; end if;

  insert into mystery_openings(
    user_id, client_request_id, mystery_version_id, scratchcard_id, math_version_id
  )
  values(
    v_user, p_client_request_id, v_version.id, v_entry.scratchcard_id, v_math
  )
  returning * into v_open;

  return jsonb_build_object(
    'id', v_open.id,
    'scratchcard_id', v_open.scratchcard_id,
    'math_version_id', v_open.math_version_id,
    'mystery_version_id', v_open.mystery_version_id,
    'idempotent', false
  );
end;
$function$;

create or replace function public.redeem_reward_v1(
  p_item_id uuid,
  p_client_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_item store_items%rowtype;
  v_redemption redemptions%rowtype;
  v_points integer;
  v_count integer;
  v_before integer;
begin
  if v_user is null or p_client_request_id is null then raise exception 'Requisição inválida'; end if;

  select * into v_redemption
  from redemptions
  where user_id = v_user and client_request_id = p_client_request_id;

  if found then
    if v_redemption.points_after is null then
      select points into v_points from profiles where id = v_user;
    else
      v_points := v_redemption.points_after;
    end if;
    return jsonb_build_object(
      'id', v_redemption.id,
      'protocol', v_redemption.protocol,
      'status', v_redemption.status,
      'new_points', v_points,
      'idempotent', true
    );
  end if;

  select * into v_item
  from store_items
  where id = p_item_id
    and active = true
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at > now())
  for update;
  if not found then raise exception 'Item indisponível'; end if;
  if v_item.stock_available <= 0 then raise exception 'ESGOTADO'; end if;

  select points into v_points from profiles where id = v_user for update;
  v_before := v_points;
  if v_points < v_item.points_cost then raise exception 'Pontos insuficientes'; end if;

  select count(*) into v_count
  from redemptions
  where user_id = v_user and item_id = p_item_id and status <> 'CANCELADO';
  if v_count >= v_item.per_user_limit then raise exception 'Limite por usuário atingido'; end if;

  update store_items
  set stock_available = stock_available - 1,
      stock = stock_available - 1
  where id = v_item.id and stock_available > 0;
  if not found then raise exception 'ESGOTADO'; end if;

  update profiles
  set points = points - v_item.points_cost
  where id = v_user
  returning points into v_points;

  insert into redemptions(
    user_id, item_id, points_spent, client_request_id,
    status, protocol, points_after
  )
  values(
    v_user, p_item_id, v_item.points_cost, p_client_request_id,
    'SOLICITADO', 'RWD-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)),
    v_points
  )
  returning * into v_redemption;

  insert into points_ledger(
    user_id, amount, balance_before, balance_after,
    transaction_type, reference_type, reference_id, metadata
  )
  values(
    v_user, -v_item.points_cost, v_before, v_points,
    'REDEMPTION', 'redemption', v_redemption.id, jsonb_build_object('item_id', v_item.id)
  );

  return jsonb_build_object(
    'id', v_redemption.id,
    'protocol', v_redemption.protocol,
    'status', v_redemption.status,
    'new_points', v_points,
    'idempotent', false
  );
end;
$function$;
