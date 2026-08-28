create unique index if not exists scratch_math_versions_one_published_per_card
on public.scratch_math_versions(scratchcard_id)
where status = 'PUBLISHED';

create or replace function public.publish_math_version_v1(p_math_version_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_admin uuid := auth.uid();
  v_version public.scratch_math_versions%rowtype;
  v_count integer;
  v_total numeric;
  v_expected_prize numeric;
  v_expected_points numeric;
begin
  if v_admin is null or not public.is_admin(v_admin) then raise exception 'Sem permissão'; end if;

  select * into v_version
  from public.scratch_math_versions
  where id = p_math_version_id
  for update;
  if not found then raise exception 'Versão inexistente'; end if;
  if v_version.status <> 'DRAFT' then raise exception 'Somente versão DRAFT pode ser publicada'; end if;
  if v_version.rarity_id is null then raise exception 'Raridade obrigatória'; end if;

  perform pg_advisory_xact_lock(hashtextextended('publish-math:' || v_version.scratchcard_id::text, 0));

  select count(*), coalesce(sum(weight),0),
         coalesce(sum(prize*weight)/nullif(sum(weight),0),0),
         coalesce(sum(points*weight)/nullif(sum(weight),0),0)
  into v_count, v_total, v_expected_prize, v_expected_points
  from public.scratch_outcomes
  where math_version_id = p_math_version_id;

  if v_count < 1 or v_total <= 0 then raise exception 'Versão sem matemática válida'; end if;
  if exists(
    select 1 from public.scratch_outcomes
    where math_version_id = p_math_version_id
      and (weight <= 0 or prize < 0 or points < 0)
  ) then
    raise exception 'Outcomes inválidos';
  end if;

  update public.scratch_math_versions
  set status = 'RETIRED'
  where scratchcard_id = v_version.scratchcard_id
    and status = 'PUBLISHED'
    and id <> p_math_version_id;

  update public.scratch_math_versions
  set status = 'PUBLISHED', published_by = v_admin
  where id = p_math_version_id;

  return jsonb_build_object(
    'id', p_math_version_id,
    'status', 'PUBLISHED',
    'outcome_count', v_count,
    'total_weight', v_total,
    'expected_prize', v_expected_prize,
    'expected_points', v_expected_points
  );
end;
$function$;

create or replace function public.simulate_math_v1(p_math_version_id uuid, p_simulations integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_admin uuid := auth.uid();
  v_total numeric;
begin
  if v_admin is null or not public.is_admin(v_admin) then raise exception 'Sem permissão'; end if;
  if p_simulations not in (1000,10000,100000,1000000) then raise exception 'Quantidade inválida'; end if;

  select sum(weight) into v_total
  from public.scratch_outcomes
  where math_version_id = p_math_version_id;

  if coalesce(v_total,0) <= 0 then raise exception 'Versão matemática inválida'; end if;

  return jsonb_build_object(
    'simulations', p_simulations,
    'outcomes', (
      with samples as (
        select random() * v_total as pick
        from generate_series(1, p_simulations)
      ),
      buckets as (
        select
          o.id,
          o.name,
          o.weight,
          sum(o.weight) over(order by o.id) as upper_edge,
          coalesce(sum(o.weight) over(order by o.id rows between unbounded preceding and 1 preceding),0) as lower_edge
        from public.scratch_outcomes o
        where o.math_version_id = p_math_version_id
      )
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'outcome_id', b.id,
            'name', b.name,
            'count', x.count,
            'percent', round(100 * x.count::numeric / p_simulations, 4)
          )
          order by b.id
        ),
        '[]'::jsonb
      )
      from buckets b
      join lateral (
        select count(*)::int as count
        from samples s
        where s.pick >= b.lower_edge and s.pick < b.upper_edge
      ) x on true
    )
  );
end;
$function$;
