create or replace function public.prevent_published_mystery_mutation()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  v_version uuid;
begin
  if tg_table_name = 'mystery_versions' then
    if tg_op = 'DELETE' then
      if old.status in ('PUBLISHED','RETIRED') then
        raise exception 'Versão misteriosa publicada ou aposentada é imutável';
      end if;
      return old;
    end if;

    if tg_op = 'UPDATE' then
      if old.status = 'PUBLISHED' then
        if new.status <> 'RETIRED'
           or new.id is distinct from old.id
           or new.name is distinct from old.name
           or new.published_at is distinct from old.published_at
           or new.published_by is distinct from old.published_by
           or new.created_at is distinct from old.created_at then
          raise exception 'Versão misteriosa publicada só pode ser aposentada sem alterar seu conteúdo';
        end if;
        return new;
      end if;

      if old.status = 'RETIRED' then
        raise exception 'Versão misteriosa aposentada é imutável';
      end if;

      return new;
    end if;
  end if;

  if tg_table_name = 'mystery_version_entries' then
    if tg_op = 'DELETE' then
      v_version := old.mystery_version_id;
      if exists (
        select 1 from public.mystery_versions
        where id = v_version and status in ('PUBLISHED','RETIRED')
      ) then
        raise exception 'Participantes de versão misteriosa publicada ou aposentada são imutáveis';
      end if;
      return old;
    end if;

    if tg_op = 'INSERT' then
      v_version := new.mystery_version_id;
      if exists (
        select 1 from public.mystery_versions
        where id = v_version and status in ('PUBLISHED','RETIRED')
      ) then
        raise exception 'Participantes de versão misteriosa publicada ou aposentada são imutáveis';
      end if;
      return new;
    end if;

    if tg_op = 'UPDATE' then
      if exists (
        select 1 from public.mystery_versions
        where id in (old.mystery_version_id, new.mystery_version_id)
          and status in ('PUBLISHED','RETIRED')
      ) then
        raise exception 'Participantes de versão misteriosa publicada ou aposentada são imutáveis';
      end if;
      return new;
    end if;
  end if;

  raise exception 'Tabela/operação inesperada no guard de Misteriosa: %.%', tg_table_name, tg_op;
end;
$$;

create unique index if not exists uq_mystery_versions_single_published
on public.mystery_versions(status)
where status = 'PUBLISHED';

create or replace function public.admin_publish_mystery_v1(p_mystery_version_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_admin uuid := auth.uid();
  v_count integer;
  v_total numeric;
begin
  if v_admin is null or not public.is_admin(v_admin) then
    raise exception 'Sem permissão';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('mystery:publish', 0));

  if not exists (
    select 1 from public.mystery_versions
    where id = p_mystery_version_id and status = 'DRAFT'
    for update
  ) then
    raise exception 'Somente pool DRAFT pode ser publicado';
  end if;

  select count(*), coalesce(sum(weight),0)
  into v_count, v_total
  from public.mystery_version_entries
  where mystery_version_id = p_mystery_version_id;

  if v_count < 1 or v_total <= 0 then
    raise exception 'Pool sem entradas válidas';
  end if;

  if exists (
    select 1
    from public.mystery_version_entries me
    left join public.scratchcards c on c.id = me.scratchcard_id
    where me.mystery_version_id = p_mystery_version_id
      and (
        me.weight <= 0
        or c.id is null
        or c.active is not true
        or not exists (
          select 1 from public.scratch_math_versions mv
          where mv.scratchcard_id = me.scratchcard_id
            and mv.status = 'PUBLISHED'
        )
      )
  ) then
    raise exception 'Todas as entradas precisam apontar para raspadinhas ativas com matemática publicada';
  end if;

  update public.mystery_versions
  set status = 'RETIRED'
  where status = 'PUBLISHED'
    and id <> p_mystery_version_id;

  update public.mystery_versions
  set status = 'PUBLISHED',
      published_at = now(),
      published_by = v_admin
  where id = p_mystery_version_id;

  return jsonb_build_object(
    'id', p_mystery_version_id,
    'status', 'PUBLISHED',
    'entry_count', v_count,
    'total_weight', v_total
  );
end;
$$;

create or replace function public.claim_daily_scratch_v1(p_card_id uuid, p_client_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
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
  order by published_at desc nulls last, created_at desc, id desc
  limit 1;
  if not found then raise exception 'Raspadinha diária sem matemática publicada'; end if;

  select coalesce(sum(weight),0) into v_total
  from scratch_outcomes where math_version_id = v_version.id;
  if v_total <= 0 then raise exception 'Matemática inválida'; end if;

  v_pick := random() * v_total;
  for v_outcome in
    select * from scratch_outcomes where math_version_id = v_version.id order by id
  loop
    v_cursor := v_cursor + v_outcome.weight;
    if v_pick < v_cursor then exit; end if;
  end loop;
  if v_outcome.id is null then raise exception 'Matemática inválida'; end if;

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
$$;

create or replace function public.open_mystery_scratch_v1(p_client_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
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
  if v_user is null or p_client_request_id is null then
    raise exception 'Requisição inválida';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('mystery:' || v_user::text || ':' || p_client_request_id::text, 0)
  );

  select * into v_open
  from public.mystery_openings
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
  from public.mystery_versions
  where status = 'PUBLISHED'
  order by published_at desc nulls last, created_at desc, id desc
  limit 1
  for update;
  if not found then raise exception 'Pool misterioso indisponível'; end if;

  if not exists (
    select 1 from public.mystery_version_entries
    where mystery_version_id = v_version.id
  ) or exists (
    select 1
    from public.mystery_version_entries me
    left join public.scratchcards c on c.id = me.scratchcard_id
    where me.mystery_version_id = v_version.id
      and (
        me.weight <= 0
        or c.id is null
        or c.active is not true
        or not exists (
          select 1
          from public.scratch_math_versions smv
          where smv.scratchcard_id = me.scratchcard_id
            and smv.status = 'PUBLISHED'
        )
      )
  ) then
    raise exception 'Pool misterioso indisponível';
  end if;

  select coalesce(sum(weight),0) into v_total
  from public.mystery_version_entries
  where mystery_version_id = v_version.id;
  if v_total <= 0 then raise exception 'Pool misterioso inválido'; end if;

  v_pick := random() * v_total;
  for v_entry in
    select * from public.mystery_version_entries
    where mystery_version_id = v_version.id
    order by id
  loop
    v_cursor := v_cursor + v_entry.weight;
    if v_pick < v_cursor then exit; end if;
  end loop;
  if v_entry.id is null then raise exception 'Pool misterioso inválido'; end if;

  select id into v_math
  from public.scratch_math_versions
  where scratchcard_id = v_entry.scratchcard_id and status = 'PUBLISHED'
  order by published_at desc nulls last, created_at desc, id desc
  limit 1;
  if v_math is null then raise exception 'Cartela selecionada sem matemática publicada'; end if;

  insert into public.mystery_openings(
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
$$;

revoke all on table public.mystery_versions from anon;
revoke all on table public.mystery_version_entries from anon;
revoke insert, update, delete, truncate, references, trigger on table public.mystery_versions from authenticated;
revoke insert, update, delete, truncate, references, trigger on table public.mystery_version_entries from authenticated;
grant select on table public.mystery_versions to authenticated;
grant select on table public.mystery_version_entries to authenticated;

drop policy if exists "read published mystery versions" on public.mystery_versions;
create policy "authenticated read published mystery versions"
on public.mystery_versions
for select
to authenticated
using (status = 'PUBLISHED');

drop policy if exists "read published mystery entries" on public.mystery_version_entries;
create policy "authenticated read published mystery entries"
on public.mystery_version_entries
for select
to authenticated
using (
  exists (
    select 1 from public.mystery_versions v
    where v.id = mystery_version_entries.mystery_version_id
      and v.status = 'PUBLISHED'
  )
);
