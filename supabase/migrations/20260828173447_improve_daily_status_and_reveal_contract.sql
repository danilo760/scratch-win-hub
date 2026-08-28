create or replace function public.get_special_scratch_status_v1()
returns jsonb
language sql
stable
set search_path to 'public'
as $$
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
  daily_claim as (
    select exists (
      select 1
      from public.daily_scratch_claims dsc
      where dsc.user_id = auth.uid()
        and dsc.claim_date = (now() at time zone 'America/Sao_Paulo')::date
        and dsc.scratch_play_id is not null
    ) as claimed
  ),
  mystery as (
    select mv.id, mv.name
    from public.mystery_versions mv
    where mv.status = 'PUBLISHED'
      and exists (
        select 1
        from public.mystery_version_entries me
        where me.mystery_version_id = mv.id
      )
      and not exists (
        select 1
        from public.mystery_version_entries me
        left join public.scratchcards c on c.id = me.scratchcard_id
        where me.mystery_version_id = mv.id
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
      )
    order by mv.published_at desc nulls last, mv.created_at desc, mv.id desc
    limit 1
  )
  select jsonb_build_object(
    'daily_configured', exists(select 1 from daily),
    'daily_claimed_today', coalesce((select claimed from daily_claim), false),
    'daily_available', exists(select 1 from daily) and not coalesce((select claimed from daily_claim), false),
    'daily_card_id', (select id from daily),
    'daily_title', (select title from daily),
    'mystery_available', exists(select 1 from mystery),
    'mystery_version_id', (select id from mystery),
    'mystery_name', (select name from mystery)
  );
$$;

create or replace function public.claim_daily_scratch_v2(p_client_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user uuid := auth.uid();
  v_date date := (now() at time zone 'America/Sao_Paulo')::date;
  v_card_id uuid;
  v_result jsonb;
  v_play_id uuid;
  v_result_card_id uuid;
  v_result_card_title text;
  v_rarity_slug text;
begin
  if v_user is null or p_client_request_id is null then
    raise exception 'Requisição inválida';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('daily:' || v_user::text || ':' || v_date::text, 0)
  );

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

  v_result := public.claim_daily_scratch_v1(v_card_id, p_client_request_id);
  v_play_id := nullif(v_result->>'id','')::uuid;

  select p.card_id, c.title, r.slug
  into v_result_card_id, v_result_card_title, v_rarity_slug
  from public.plays p
  join public.scratchcards c on c.id = p.card_id
  left join public.scratch_math_versions mv on mv.id = p.math_version_id
  left join public.scratch_rarities r on r.id = mv.rarity_id
  where p.id = v_play_id
    and p.user_id = v_user;

  if v_result_card_id is null then
    raise exception 'Resultado diário persistido não encontrado';
  end if;

  return v_result || jsonb_build_object(
    'card_id', v_result_card_id,
    'card_title', v_result_card_title,
    'rarity_slug', v_rarity_slug
  );
end;
$$;
