create or replace function public.get_admin_math_config_v1()
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_admin uuid := auth.uid();
begin
  if v_admin is null or not public.is_admin(v_admin) then
    raise exception 'Sem permissão';
  end if;

  return jsonb_build_object(
    'cards', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id,
        'title', c.title,
        'price', c.price,
        'active', c.active
      ) order by c.title), '[]'::jsonb)
      from public.scratchcards c
    ),
    'rarities', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', r.id,
        'slug', r.slug,
        'name', r.name,
        'description', r.description,
        'theme', r.theme
      ) order by case r.slug when 'bronze' then 1 when 'prata' then 2 when 'ouro' then 3 when 'diamante' then 4 else 99 end, r.slug), '[]'::jsonb)
      from public.scratch_rarities r
    ),
    'versions', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', v.id,
        'scratchcard_id', v.scratchcard_id,
        'version_name', v.version_name,
        'status', v.status,
        'rarity_id', v.rarity_id,
        'rarity_slug', r.slug,
        'rarity_name', r.name,
        'published_at', v.published_at,
        'created_at', v.created_at,
        'outcomes', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id', o.id,
            'name', o.name,
            'prize', o.prize,
            'points', o.points,
            'weight', o.weight
          ) order by o.created_at, o.id), '[]'::jsonb)
          from public.scratch_outcomes o
          where o.math_version_id = v.id
        )
      ) order by v.created_at desc, v.id desc), '[]'::jsonb)
      from public.scratch_math_versions v
      left join public.scratch_rarities r on r.id = v.rarity_id
    )
  );
end;
$function$;

create or replace function public.create_math_draft_v1(
  p_card_id uuid,
  p_version_name text,
  p_rarity_slug text
)
returns uuid
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_admin uuid := auth.uid();
  v_rarity_id uuid;
  v_id uuid;
begin
  if v_admin is null or not public.is_admin(v_admin) then raise exception 'Sem permissão'; end if;
  if p_card_id is null or nullif(trim(p_version_name), '') is null then raise exception 'Dados obrigatórios ausentes'; end if;
  if not exists(select 1 from public.scratchcards where id = p_card_id) then raise exception 'Raspadinha inexistente'; end if;

  select id into v_rarity_id from public.scratch_rarities where slug = lower(trim(p_rarity_slug));
  if v_rarity_id is null then raise exception 'Raridade inválida'; end if;

  insert into public.scratch_math_versions(scratchcard_id, rarity_id, version_name, status, config)
  values(p_card_id, v_rarity_id, left(trim(p_version_name), 100), 'DRAFT', '{}'::jsonb)
  returning id into v_id;

  return v_id;
end;
$function$;

create or replace function public.add_math_outcome_v1(
  p_math_version_id uuid,
  p_name text,
  p_prize numeric,
  p_points integer,
  p_weight numeric
)
returns uuid
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_admin uuid := auth.uid();
  v_id uuid;
begin
  if v_admin is null or not public.is_admin(v_admin) then raise exception 'Sem permissão'; end if;
  if not exists(select 1 from public.scratch_math_versions where id=p_math_version_id and status='DRAFT') then
    raise exception 'Somente versões DRAFT podem receber resultados';
  end if;
  if nullif(trim(p_name),'') is null or p_prize is null or p_prize < 0 or p_points is null or p_points < 0 or p_weight is null or p_weight <= 0 then
    raise exception 'Resultado inválido';
  end if;

  insert into public.scratch_outcomes(math_version_id,name,prize,points,weight)
  values(p_math_version_id,left(trim(p_name),120),p_prize,p_points,p_weight)
  returning id into v_id;
  return v_id;
end;
$function$;

create or replace function public.update_math_outcome_v1(
  p_outcome_id uuid,
  p_name text,
  p_prize numeric,
  p_points integer,
  p_weight numeric
)
returns void
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_admin uuid := auth.uid();
  v_version_id uuid;
begin
  if v_admin is null or not public.is_admin(v_admin) then raise exception 'Sem permissão'; end if;
  select o.math_version_id into v_version_id
  from public.scratch_outcomes o
  join public.scratch_math_versions v on v.id=o.math_version_id
  where o.id=p_outcome_id and v.status='DRAFT';
  if v_version_id is null then raise exception 'Resultado não editável'; end if;
  if nullif(trim(p_name),'') is null or p_prize is null or p_prize < 0 or p_points is null or p_points < 0 or p_weight is null or p_weight <= 0 then
    raise exception 'Resultado inválido';
  end if;

  update public.scratch_outcomes
  set name=left(trim(p_name),120), prize=p_prize, points=p_points, weight=p_weight
  where id=p_outcome_id and math_version_id=v_version_id;
end;
$function$;

create or replace function public.delete_math_outcome_v1(p_outcome_id uuid)
returns void
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_admin uuid := auth.uid();
  v_version_id uuid;
begin
  if v_admin is null or not public.is_admin(v_admin) then raise exception 'Sem permissão'; end if;
  select o.math_version_id into v_version_id
  from public.scratch_outcomes o
  join public.scratch_math_versions v on v.id=o.math_version_id
  where o.id=p_outcome_id and v.status='DRAFT';
  if v_version_id is null then raise exception 'Resultado não removível'; end if;
  delete from public.scratch_outcomes where id=p_outcome_id and math_version_id=v_version_id;
end;
$function$;

create or replace function public.publish_math_version_v1(p_math_version_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
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
  where id=p_math_version_id
  for update;
  if not found then raise exception 'Versão inexistente'; end if;
  if v_version.status <> 'DRAFT' then raise exception 'Somente versão DRAFT pode ser publicada'; end if;
  if v_version.rarity_id is null then raise exception 'Raridade obrigatória'; end if;

  select count(*), coalesce(sum(weight),0),
         coalesce(sum(prize*weight)/nullif(sum(weight),0),0),
         coalesce(sum(points*weight)/nullif(sum(weight),0),0)
  into v_count,v_total,v_expected_prize,v_expected_points
  from public.scratch_outcomes
  where math_version_id=p_math_version_id;

  if v_count < 1 or v_total <= 0 then raise exception 'Versão sem matemática válida'; end if;
  if exists(select 1 from public.scratch_outcomes where math_version_id=p_math_version_id and (weight<=0 or prize<0 or points<0)) then
    raise exception 'Outcomes inválidos';
  end if;

  update public.scratch_math_versions
  set status='PUBLISHED', published_by=v_admin
  where id=p_math_version_id;

  return jsonb_build_object(
    'id',p_math_version_id,
    'status','PUBLISHED',
    'outcome_count',v_count,
    'total_weight',v_total,
    'expected_prize',v_expected_prize,
    'expected_points',v_expected_points
  );
end;
$function$;

revoke all on function public.get_admin_math_config_v1() from public, anon;
revoke all on function public.create_math_draft_v1(uuid,text,text) from public, anon;
revoke all on function public.add_math_outcome_v1(uuid,text,numeric,integer,numeric) from public, anon;
revoke all on function public.update_math_outcome_v1(uuid,text,numeric,integer,numeric) from public, anon;
revoke all on function public.delete_math_outcome_v1(uuid) from public, anon;
revoke all on function public.publish_math_version_v1(uuid) from public, anon;

grant execute on function public.get_admin_math_config_v1() to authenticated;
grant execute on function public.create_math_draft_v1(uuid,text,text) to authenticated;
grant execute on function public.add_math_outcome_v1(uuid,text,numeric,integer,numeric) to authenticated;
grant execute on function public.update_math_outcome_v1(uuid,text,numeric,integer,numeric) to authenticated;
grant execute on function public.delete_math_outcome_v1(uuid) to authenticated;
grant execute on function public.publish_math_version_v1(uuid) to authenticated;
