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
  v_balance numeric(12,2);
  v_max_price numeric(12,2);
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

  select p.balance
  into v_balance
  from public.profiles p
  where p.id = v_user;
  if not found then raise exception 'Perfil inexistente'; end if;

  select max(c.price)
  into v_max_price
  from public.mystery_version_entries me
  join public.scratchcards c on c.id = me.scratchcard_id
  where me.mystery_version_id = v_version.id;

  if v_max_price is null or v_max_price < 0 then
    raise exception 'Pool misterioso inválido';
  end if;

  if coalesce(v_balance, 0) < v_max_price then
    raise exception 'Saldo insuficiente para abrir a Misteriosa';
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
$function$;
