create unique index if not exists scratchcards_single_daily_eligible
on public.scratchcards (is_daily_eligible)
where is_daily_eligible = true;

create or replace function public.get_special_scratch_status_v1()
returns jsonb
language sql
stable
security invoker
set search_path = 'public'
as $function$
  with daily as (
    select c.id, c.title
    from public.scratchcards c
    where c.active = true
      and c.is_daily_eligible = true
      and exists (
        select 1
        from public.scratch_math_versions mv
        where mv.scratchcard_id = c.id
          and mv.status = 'PUBLISHED'
      )
    order by c.updated_at desc, c.id desc
    limit 1
  ),
  mystery as (
    select mv.id, mv.name
    from public.mystery_versions mv
    where mv.status = 'PUBLISHED'
      and exists (
        select 1
        from public.mystery_version_entries me
        join public.scratchcards c on c.id = me.scratchcard_id and c.active = true
        where me.mystery_version_id = mv.id
          and me.weight > 0
          and exists (
            select 1
            from public.scratch_math_versions smv
            where smv.scratchcard_id = c.id
              and smv.status = 'PUBLISHED'
          )
      )
    order by mv.published_at desc nulls last, mv.created_at desc, mv.id desc
    limit 1
  )
  select jsonb_build_object(
    'daily_available', exists(select 1 from daily),
    'daily_card_id', (select id from daily),
    'daily_title', (select title from daily),
    'mystery_available', exists(select 1 from mystery),
    'mystery_version_id', (select id from mystery),
    'mystery_name', (select name from mystery)
  );
$function$;

create or replace function public.claim_daily_scratch_v2(p_client_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_card_id uuid;
begin
  if v_user is null or p_client_request_id is null then
    raise exception 'Requisição inválida';
  end if;

  select c.id into v_card_id
  from public.scratchcards c
  where c.active = true
    and c.is_daily_eligible = true
    and exists (
      select 1
      from public.scratch_math_versions mv
      where mv.scratchcard_id = c.id
        and mv.status = 'PUBLISHED'
    )
  order by c.updated_at desc, c.id desc
  limit 1;

  if v_card_id is null then
    raise exception 'Raspadinha diária indisponível';
  end if;

  return public.claim_daily_scratch_v1(v_card_id, p_client_request_id);
end;
$function$;

revoke all on function public.get_special_scratch_status_v1() from public, anon;
revoke all on function public.claim_daily_scratch_v2(uuid) from public, anon;
grant execute on function public.get_special_scratch_status_v1() to authenticated;
grant execute on function public.claim_daily_scratch_v2(uuid) to authenticated;
