create or replace function public.admin_upsert_scratchcard_v1(
  p_title text,
  p_price numeric,
  p_active boolean,
  p_is_daily_eligible boolean default false,
  p_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_admin uuid := auth.uid();
  v_id uuid;
begin
  if v_admin is null or not public.is_admin(v_admin) then
    raise exception 'Sem permissão';
  end if;
  if nullif(trim(p_title),'') is null or p_price is null or p_price < 0 then
    raise exception 'Dados inválidos';
  end if;

  if coalesce(p_is_daily_eligible,false) then
    if p_id is null then
      raise exception 'Publique uma versão matemática antes de configurar a raspadinha diária';
    end if;
    if coalesce(p_active,false) is not true then
      raise exception 'Raspadinha diária precisa estar ativa';
    end if;
    if not exists (
      select 1
      from public.scratch_math_versions mv
      where mv.scratchcard_id = p_id
        and mv.status = 'PUBLISHED'
    ) then
      raise exception 'Raspadinha diária precisa possuir matemática publicada';
    end if;

    update public.scratchcards
    set is_daily_eligible=false, updated_at=now()
    where is_daily_eligible=true and id<>p_id;
  end if;

  if p_id is null then
    insert into public.scratchcards(title,price,active,is_daily_eligible)
    values(left(trim(p_title),120),p_price,coalesce(p_active,true),false)
    returning id into v_id;
  else
    update public.scratchcards
    set title=left(trim(p_title),120),
        price=p_price,
        active=coalesce(p_active,false),
        is_daily_eligible=coalesce(p_is_daily_eligible,false),
        updated_at=now()
    where id=p_id
    returning id into v_id;
    if v_id is null then raise exception 'Raspadinha inexistente'; end if;
  end if;

  insert into public.audit_logs(admin_id,action,entity_type,entity_id,after_data,metadata)
  values(
    v_admin,'scratchcard.saved','scratchcard',v_id,
    jsonb_build_object(
      'title',trim(p_title),
      'price',p_price,
      'active',p_active,
      'is_daily_eligible',case when p_id is null then false else p_is_daily_eligible end
    ),
    '{}'::jsonb
  );
  return v_id;
end;
$function$;