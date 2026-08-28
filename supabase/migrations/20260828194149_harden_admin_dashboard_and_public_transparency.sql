create or replace function public.get_admin_dashboard_v1()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_admin uuid := auth.uid();
  v_local_day date := (now() at time zone 'America/Sao_Paulo')::date;
  v_day_start timestamptz := (v_local_day::timestamp at time zone 'America/Sao_Paulo');
  v_day_end timestamptz := ((v_local_day + 1)::timestamp at time zone 'America/Sao_Paulo');
begin
  if v_admin is null or not public.is_admin(v_admin) then
    raise exception 'Sem permissão';
  end if;

  return jsonb_build_object(
    'timezone', 'America/Sao_Paulo',
    'local_date', v_local_day,
    'cards', jsonb_build_object(
      'plays_today', (select count(*) from public.plays where created_at >= v_day_start and created_at < v_day_end),
      'winning_results', (select count(*) from public.plays where created_at >= v_day_start and created_at < v_day_end and (prize > 0 or points_earned > 0)),
      'points_distributed', (select coalesce(sum(points_earned), 0) from public.plays where created_at >= v_day_start and created_at < v_day_end),
      'points_used', (select coalesce(abs(sum(amount)), 0) from public.points_ledger where created_at >= v_day_start and created_at < v_day_end and transaction_type = 'REDEMPTION'),
      'pending_redemptions', (select count(*) from public.redemptions where status not in ('ENTREGUE','CANCELADO')),
      'low_stock', (select count(*) from public.store_items where active = true and stock_available between 1 and 3),
      'active_users', (select count(distinct user_id) from public.plays where created_at >= v_day_start and created_at < v_day_end),
      'daily_claims', (select count(*) from public.daily_scratch_claims where claim_date = v_local_day)
    ),
    'plays_by_day', (
      select coalesce(jsonb_agg(row_to_json(x) order by x.day), '[]'::jsonb)
      from (
        select (created_at at time zone 'America/Sao_Paulo')::date as day, count(*)::int as count
        from public.plays
        where created_at >= now() - interval '30 days'
        group by 1
      ) x
    ),
    'plays_by_rarity', (
      select coalesce(jsonb_agg(row_to_json(x) order by x.rarity), '[]'::jsonb)
      from (
        select coalesce(r.name, 'Não versionada') as rarity, count(*)::int as count
        from public.plays p
        left join public.scratch_math_versions v on v.id = p.math_version_id
        left join public.scratch_rarities r on r.id = v.rarity_id
        group by 1
      ) x
    ),
    'outcomes_today', (
      select coalesce(jsonb_agg(row_to_json(x) order by x.count desc, x.outcome), '[]'::jsonb)
      from (
        select coalesce(o.name, case when p.prize > 0 or p.points_earned > 0 then 'Premiado' else 'Sem prêmio' end) as outcome,
               count(*)::int as count
        from public.plays p
        left join public.scratch_outcomes o on o.id = p.outcome_id
        where p.created_at >= v_day_start and p.created_at < v_day_end
        group by 1
      ) x
    ),
    'points_by_day', (
      select coalesce(jsonb_agg(row_to_json(x) order by x.day), '[]'::jsonb)
      from (
        select (created_at at time zone 'America/Sao_Paulo')::date as day,
               coalesce(sum(case when amount > 0 then amount else 0 end),0)::numeric as issued,
               coalesce(abs(sum(case when amount < 0 then amount else 0 end)),0)::numeric as consumed
        from public.points_ledger
        where created_at >= now() - interval '30 days'
        group by 1
      ) x
    ),
    'redemptions_by_status', (
      select coalesce(jsonb_agg(row_to_json(x) order by x.status), '[]'::jsonb)
      from (
        select status, count(*)::int as count
        from public.redemptions
        group by status
      ) x
    ),
    'active_users_by_day', (
      select coalesce(jsonb_agg(row_to_json(x) order by x.day), '[]'::jsonb)
      from (
        select (created_at at time zone 'America/Sao_Paulo')::date as day, count(distinct user_id)::int as count
        from public.plays
        where created_at >= now() - interval '30 days'
        group by 1
      ) x
    )
  );
end;
$$;

revoke all on function public.get_admin_dashboard_v1() from public, anon;
grant execute on function public.get_admin_dashboard_v1() to authenticated, service_role;

create or replace function public.get_transparency_v1()
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
  select jsonb_build_object(
    'generated_at', now(),
    'timezone', 'America/Sao_Paulo',
    'campaigns', coalesce(jsonb_agg(campaign order by campaign->>'title'), '[]'::jsonb)
  )
  from (
    select jsonb_build_object(
      'scratchcard_id', c.id,
      'title', c.title,
      'price', c.price,
      'version_name', v.version_name,
      'published_at', v.published_at,
      'rarity', jsonb_build_object('slug', r.slug, 'name', r.name),
      'outcomes', (
        select coalesce(jsonb_agg(
          jsonb_build_object(
            'name', o.name,
            'prize', o.prize,
            'points', o.points,
            'expected_percent', round(100 * o.weight / nullif(t.total_weight, 0), 4)
          ) order by o.created_at, o.id
        ), '[]'::jsonb)
        from public.scratch_outcomes o
        cross join lateral (
          select sum(weight)::numeric as total_weight
          from public.scratch_outcomes
          where math_version_id = v.id
        ) t
        where o.math_version_id = v.id
      )
    ) as campaign
    from public.scratchcards c
    join lateral (
      select mv.id, mv.version_name, mv.rarity_id, mv.published_at
      from public.scratch_math_versions mv
      where mv.scratchcard_id = c.id and mv.status = 'PUBLISHED'
      order by mv.published_at desc nulls last, mv.created_at desc, mv.id desc
      limit 1
    ) v on true
    left join public.scratch_rarities r on r.id = v.rarity_id
    where c.active = true
  ) published;
$$;

revoke all on function public.get_transparency_v1() from public;
grant execute on function public.get_transparency_v1() to anon, authenticated, service_role;
