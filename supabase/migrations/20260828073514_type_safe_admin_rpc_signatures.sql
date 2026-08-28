drop function if exists public.admin_upsert_scratchcard_v1(uuid,text,numeric,boolean,boolean);

create function public.admin_upsert_scratchcard_v1(
  p_title text,
  p_price numeric,
  p_active boolean,
  p_is_daily_eligible boolean default false,
  p_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path='public'
as $function$
declare
  v_admin uuid:=auth.uid();
  v_id uuid;
begin
  if v_admin is null or not public.is_admin(v_admin) then raise exception 'Sem permissão'; end if;
  if nullif(trim(p_title),'') is null or p_price is null or p_price < 0 then raise exception 'Dados inválidos'; end if;

  if coalesce(p_is_daily_eligible,false) then
    update public.scratchcards set is_daily_eligible=false,updated_at=now()
    where is_daily_eligible=true and (p_id is null or id<>p_id);
  end if;

  if p_id is null then
    insert into public.scratchcards(title,price,active,is_daily_eligible)
    values(left(trim(p_title),120),p_price,coalesce(p_active,true),coalesce(p_is_daily_eligible,false))
    returning id into v_id;
  else
    update public.scratchcards
    set title=left(trim(p_title),120),price=p_price,active=coalesce(p_active,false),
        is_daily_eligible=coalesce(p_is_daily_eligible,false),updated_at=now()
    where id=p_id
    returning id into v_id;
    if v_id is null then raise exception 'Raspadinha inexistente'; end if;
  end if;

  insert into public.audit_logs(admin_id,action,entity_type,entity_id,after_data,metadata)
  values(v_admin,'scratchcard.saved','scratchcard',v_id,
    jsonb_build_object('title',trim(p_title),'price',p_price,'active',p_active,'is_daily_eligible',p_is_daily_eligible),'{}'::jsonb);
  return v_id;
end;
$function$;

create or replace function public.admin_clear_daily_scratch_v1()
returns void
language plpgsql
security definer
set search_path='public'
as $function$
declare v_admin uuid:=auth.uid();
begin
  if v_admin is null or not public.is_admin(v_admin) then raise exception 'Sem permissão'; end if;
  update public.scratchcards set is_daily_eligible=false,updated_at=now() where is_daily_eligible=true;
  insert into public.audit_logs(admin_id,action,entity_type,entity_id,after_data,metadata)
  values(v_admin,'daily_scratch.cleared','scratchcard',v_admin,jsonb_build_object('scratchcard_id',null),'{}'::jsonb);
end;
$function$;

drop function if exists public.admin_upsert_store_item_v1(uuid,text,text,integer,integer,integer,integer,text,timestamptz,timestamptz,integer,text,boolean);

create function public.admin_upsert_store_item_v1(
  p_title text,
  p_points_cost integer,
  p_stock_total integer,
  p_stock_available integer,
  p_per_user_limit integer,
  p_active boolean,
  p_id uuid default null,
  p_description text default null,
  p_category text default null,
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null,
  p_display_order integer default 0,
  p_image_url text default null
)
returns uuid
language plpgsql
security definer
set search_path='public'
as $function$
declare v_admin uuid:=auth.uid(); v_id uuid;
begin
  if v_admin is null or not public.is_admin(v_admin) then raise exception 'Sem permissão'; end if;
  if nullif(trim(p_title),'') is null or p_points_cost is null or p_points_cost<0
     or p_stock_total is null or p_stock_total<0 or p_stock_available is null or p_stock_available<0
     or p_stock_available>p_stock_total or p_per_user_limit is null or p_per_user_limit<1 then
    raise exception 'Dados da loja inválidos';
  end if;
  if p_starts_at is not null and p_ends_at is not null and p_ends_at<=p_starts_at then
    raise exception 'Período de disponibilidade inválido';
  end if;

  if p_id is null then
    insert into public.store_items(
      title,description,points_cost,stock,stock_total,stock_available,per_user_limit,
      category,starts_at,ends_at,display_order,image_url,active
    ) values(
      left(trim(p_title),160),nullif(trim(coalesce(p_description,'')),''),p_points_cost,p_stock_available,
      p_stock_total,p_stock_available,p_per_user_limit,nullif(trim(coalesce(p_category,'')),''),
      p_starts_at,p_ends_at,coalesce(p_display_order,0),nullif(trim(coalesce(p_image_url,'')),''),coalesce(p_active,true)
    ) returning id into v_id;
  else
    update public.store_items set
      title=left(trim(p_title),160),description=nullif(trim(coalesce(p_description,'')),''),
      points_cost=p_points_cost,stock=p_stock_available,stock_total=p_stock_total,stock_available=p_stock_available,
      per_user_limit=p_per_user_limit,category=nullif(trim(coalesce(p_category,'')),''),
      starts_at=p_starts_at,ends_at=p_ends_at,display_order=coalesce(p_display_order,0),
      image_url=nullif(trim(coalesce(p_image_url,'')),''),active=coalesce(p_active,false),updated_at=now()
    where id=p_id returning id into v_id;
    if v_id is null then raise exception 'Item inexistente'; end if;
  end if;

  insert into public.audit_logs(admin_id,action,entity_type,entity_id,after_data,metadata)
  values(v_admin,'store_item.saved','store_item',v_id,
    jsonb_build_object('title',trim(p_title),'points_cost',p_points_cost,'stock_total',p_stock_total,
      'stock_available',p_stock_available,'per_user_limit',p_per_user_limit,'active',p_active),'{}'::jsonb);
  return v_id;
end;
$function$;

revoke all on function public.admin_upsert_scratchcard_v1(text,numeric,boolean,boolean,uuid) from public,anon;
revoke all on function public.admin_clear_daily_scratch_v1() from public,anon;
revoke all on function public.admin_upsert_store_item_v1(text,integer,integer,integer,integer,boolean,uuid,text,text,timestamptz,timestamptz,integer,text) from public,anon;

grant execute on function public.admin_upsert_scratchcard_v1(text,numeric,boolean,boolean,uuid) to authenticated;
grant execute on function public.admin_clear_daily_scratch_v1() to authenticated;
grant execute on function public.admin_upsert_store_item_v1(text,integer,integer,integer,integer,boolean,uuid,text,text,timestamptz,timestamptz,integer,text) to authenticated;
