create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

create or replace function private.get_transparency_payload_v1()
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

revoke all on function private.get_transparency_payload_v1() from public;
grant execute on function private.get_transparency_payload_v1() to anon, authenticated, service_role;

create or replace function public.get_transparency_v1()
returns jsonb
language sql
stable
security invoker
set search_path to ''
as $$
  select private.get_transparency_payload_v1();
$$;

revoke all on function public.get_transparency_v1() from public;
grant execute on function public.get_transparency_v1() to anon, authenticated, service_role;
