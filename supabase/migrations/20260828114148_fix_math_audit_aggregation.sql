create or replace function public.get_math_audit_v1(p_math_version_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_admin uuid := auth.uid();
  v_result jsonb;
begin
  if v_admin is null or not public.is_admin(v_admin) then
    raise exception 'Sem permissão';
  end if;

  if not exists(select 1 from public.scratch_math_versions where id = p_math_version_id) then
    raise exception 'Versão inexistente';
  end if;

  with play_total as (
    select count(*)::bigint as total_plays
    from public.plays
    where math_version_id = p_math_version_id
  ),
  observed as (
    select outcome_id, count(*)::bigint as observed_count
    from public.plays
    where math_version_id = p_math_version_id
    group by outcome_id
  ),
  outcome_stats as (
    select
      o.id,
      o.name,
      o.prize,
      o.points,
      o.weight,
      sum(o.weight) over () as total_weight,
      coalesce(obs.observed_count, 0)::bigint as observed_count
    from public.scratch_outcomes o
    left join observed obs on obs.outcome_id = o.id
    where o.math_version_id = p_math_version_id
  )
  select jsonb_build_object(
    'version_id', p_math_version_id,
    'total_plays', pt.total_plays,
    'outcomes', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'outcome_id', s.id,
          'name', s.name,
          'prize', s.prize,
          'points', s.points,
          'weight', s.weight,
          'expected_percent', round(100 * s.weight / nullif(s.total_weight, 0), 4),
          'observed_count', s.observed_count,
          'observed_percent', case
            when pt.total_plays > 0 then round(100 * s.observed_count::numeric / pt.total_plays, 4)
            else 0
          end
        )
        order by s.id
      )
      from outcome_stats s
    ), '[]'::jsonb)
  )
  into v_result
  from play_total pt;

  return v_result;
end;
$function$;
