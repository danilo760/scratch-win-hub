create or replace function public.get_admin_operations_v1()
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_admin uuid := auth.uid();
begin
  if v_admin is null or not public.is_admin(v_admin) then raise exception 'Sem permissão'; end if;

  return jsonb_build_object(
    'scratchcards', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',c.id,'title',c.title,'price',c.price,'active',c.active,
        'is_daily_eligible',c.is_daily_eligible,'created_at',c.created_at,'updated_at',c.updated_at,
        'published_version_id',v.id,'published_version_name',v.version_name,
        'rarity_slug',r.slug,'rarity_name',r.name
      ) order by c.created_at desc),'[]'::jsonb)
      from public.scratchcards c
      left join lateral (
        select mv.id,mv.version_name,mv.rarity_id
        from public.scratch_math_versions mv
        where mv.scratchcard_id=c.id and mv.status='PUBLISHED'
        order by mv.published_at desc nulls last,mv.created_at desc,mv.id desc limit 1
      ) v on true
      left join public.scratch_rarities r on r.id=v.rarity_id
    ),
    'store_items', (
      select coalesce(jsonb_agg(to_jsonb(s) order by s.display_order,s.created_at),'[]'::jsonb)
      from public.store_items s
    ),
    'redemptions', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',rd.id,'protocol',rd.protocol,'user_id',rd.user_id,
        'user_email',p.email,'user_name',p.display_name,'item_id',rd.item_id,'item_title',s.title,
        'points_spent',rd.points_spent,'status',rd.status,'fulfillment_code',rd.fulfillment_code,
        'created_at',rd.created_at,'updated_at',rd.updated_at
      ) order by rd.created_at desc),'[]'::jsonb)
      from public.redemptions rd
      left join public.profiles p on p.id=rd.user_id
      left join public.store_items s on s.id=rd.item_id
    ),
    'achievements', (
      select coalesce(jsonb_agg(to_jsonb(a) order by a.sort_order,a.name),'[]'::jsonb)
      from public.achievements a
    ),
    'users', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',p.id,'email',p.email,'display_name',p.display_name,'public_slug',p.public_slug,
        'balance',p.balance,'points',p.points,'xp',p.xp,'level',p.level,'is_admin',p.is_admin,
        'created_at',p.created_at
      ) order by p.created_at desc),'[]'::jsonb)
      from public.profiles p
    ),
    'credit_ledger', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb)
      from (select * from public.credit_ledger order by created_at desc limit 200) x
    ),
    'points_ledger', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb)
      from (select * from public.points_ledger order by created_at desc limit 200) x
    ),
    'audit_logs', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb)
      from (select * from public.audit_logs order by created_at desc limit 200) x
    ),
    'mystery_versions', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',mv.id,'name',mv.name,'status',mv.status,'published_at',mv.published_at,'created_at',mv.created_at,
        'entries',(
          select coalesce(jsonb_agg(jsonb_build_object(
            'id',me.id,'scratchcard_id',me.scratchcard_id,'scratchcard_title',c.title,'weight',me.weight
          ) order by me.id),'[]'::jsonb)
          from public.mystery_version_entries me
          join public.scratchcards c on c.id=me.scratchcard_id
          where me.mystery_version_id=mv.id
        )
      ) order by mv.created_at desc),'[]'::jsonb)
      from public.mystery_versions mv
    )
  );
end;
$function$;

create or replace function public.admin_upsert_scratchcard_v1(
  p_id uuid,
  p_title text,
  p_price numeric,
  p_active boolean,
  p_is_daily_eligible boolean default false
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

create or replace function public.admin_set_daily_scratch_v1(p_card_id uuid)
returns void
language plpgsql
security definer
set search_path='public'
as $function$
declare v_admin uuid:=auth.uid();
begin
  if v_admin is null or not public.is_admin(v_admin) then raise exception 'Sem permissão'; end if;
  if p_card_id is not null and not exists(
    select 1 from public.scratchcards c
    where c.id=p_card_id and c.active=true
      and exists(select 1 from public.scratch_math_versions mv where mv.scratchcard_id=c.id and mv.status='PUBLISHED')
  ) then raise exception 'Raspadinha diária precisa estar ativa e possuir matemática publicada'; end if;

  update public.scratchcards set is_daily_eligible=false,updated_at=now() where is_daily_eligible=true;
  if p_card_id is not null then
    update public.scratchcards set is_daily_eligible=true,updated_at=now() where id=p_card_id;
  end if;

  insert into public.audit_logs(admin_id,action,entity_type,entity_id,after_data,metadata)
  values(v_admin,'daily_scratch.configured','scratchcard',coalesce(p_card_id,gen_random_uuid()),
    jsonb_build_object('scratchcard_id',p_card_id),'{}'::jsonb);
end;
$function$;

create or replace function public.admin_upsert_store_item_v1(
  p_id uuid,
  p_title text,
  p_description text,
  p_points_cost integer,
  p_stock_total integer,
  p_stock_available integer,
  p_per_user_limit integer,
  p_category text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_display_order integer,
  p_image_url text,
  p_active boolean
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

create or replace function public.admin_create_mystery_draft_v1(p_name text)
returns uuid
language plpgsql
security definer
set search_path='public'
as $function$
declare v_admin uuid:=auth.uid(); v_id uuid;
begin
  if v_admin is null or not public.is_admin(v_admin) then raise exception 'Sem permissão'; end if;
  if nullif(trim(p_name),'') is null then raise exception 'Nome obrigatório'; end if;
  insert into public.mystery_versions(name,status) values(left(trim(p_name),120),'DRAFT') returning id into v_id;
  return v_id;
end;
$function$;

create or replace function public.admin_add_mystery_entry_v1(
  p_mystery_version_id uuid,p_scratchcard_id uuid,p_weight numeric
)
returns uuid
language plpgsql
security definer
set search_path='public'
as $function$
declare v_admin uuid:=auth.uid(); v_id uuid;
begin
  if v_admin is null or not public.is_admin(v_admin) then raise exception 'Sem permissão'; end if;
  if p_weight is null or p_weight<=0 then raise exception 'Peso inválido'; end if;
  if not exists(select 1 from public.mystery_versions where id=p_mystery_version_id and status='DRAFT') then
    raise exception 'Somente pool DRAFT pode ser editado';
  end if;
  if not exists(select 1 from public.scratchcards where id=p_scratchcard_id and active=true) then raise exception 'Raspadinha inválida'; end if;
  insert into public.mystery_version_entries(mystery_version_id,scratchcard_id,weight)
  values(p_mystery_version_id,p_scratchcard_id,p_weight) returning id into v_id;
  return v_id;
end;
$function$;

create or replace function public.admin_update_mystery_entry_v1(p_entry_id uuid,p_weight numeric)
returns void
language plpgsql
security definer
set search_path='public'
as $function$
declare v_admin uuid:=auth.uid();
begin
  if v_admin is null or not public.is_admin(v_admin) then raise exception 'Sem permissão'; end if;
  if p_weight is null or p_weight<=0 then raise exception 'Peso inválido'; end if;
  update public.mystery_version_entries me set weight=p_weight
  where me.id=p_entry_id and exists(
    select 1 from public.mystery_versions mv where mv.id=me.mystery_version_id and mv.status='DRAFT'
  );
  if not found then raise exception 'Entrada não editável'; end if;
end;
$function$;

create or replace function public.admin_delete_mystery_entry_v1(p_entry_id uuid)
returns void
language plpgsql
security definer
set search_path='public'
as $function$
declare v_admin uuid:=auth.uid();
begin
  if v_admin is null or not public.is_admin(v_admin) then raise exception 'Sem permissão'; end if;
  delete from public.mystery_version_entries me
  where me.id=p_entry_id and exists(
    select 1 from public.mystery_versions mv where mv.id=me.mystery_version_id and mv.status='DRAFT'
  );
  if not found then raise exception 'Entrada não removível'; end if;
end;
$function$;

create or replace function public.admin_publish_mystery_v1(p_mystery_version_id uuid)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $function$
declare v_admin uuid:=auth.uid(); v_count integer; v_total numeric;
begin
  if v_admin is null or not public.is_admin(v_admin) then raise exception 'Sem permissão'; end if;
  if not exists(select 1 from public.mystery_versions where id=p_mystery_version_id and status='DRAFT') then
    raise exception 'Somente pool DRAFT pode ser publicado';
  end if;
  select count(*),coalesce(sum(weight),0) into v_count,v_total
  from public.mystery_version_entries where mystery_version_id=p_mystery_version_id;
  if v_count<1 or v_total<=0 then raise exception 'Pool sem entradas válidas'; end if;
  if exists(
    select 1 from public.mystery_version_entries me
    join public.scratchcards c on c.id=me.scratchcard_id
    where me.mystery_version_id=p_mystery_version_id and (
      me.weight<=0 or c.active=false or not exists(
        select 1 from public.scratch_math_versions mv where mv.scratchcard_id=c.id and mv.status='PUBLISHED'
      )
    )
  ) then raise exception 'Todas as entradas precisam apontar para raspadinhas ativas com matemática publicada'; end if;

  update public.mystery_versions set status='PUBLISHED',published_at=now(),published_by=v_admin
  where id=p_mystery_version_id;
  return jsonb_build_object('id',p_mystery_version_id,'status','PUBLISHED','entry_count',v_count,'total_weight',v_total);
end;
$function$;

revoke all on function public.get_admin_operations_v1() from public,anon;
revoke all on function public.admin_upsert_scratchcard_v1(uuid,text,numeric,boolean,boolean) from public,anon;
revoke all on function public.admin_set_daily_scratch_v1(uuid) from public,anon;
revoke all on function public.admin_upsert_store_item_v1(uuid,text,text,integer,integer,integer,integer,text,timestamptz,timestamptz,integer,text,boolean) from public,anon;
revoke all on function public.admin_create_mystery_draft_v1(text) from public,anon;
revoke all on function public.admin_add_mystery_entry_v1(uuid,uuid,numeric) from public,anon;
revoke all on function public.admin_update_mystery_entry_v1(uuid,numeric) from public,anon;
revoke all on function public.admin_delete_mystery_entry_v1(uuid) from public,anon;
revoke all on function public.admin_publish_mystery_v1(uuid) from public,anon;

grant execute on function public.get_admin_operations_v1() to authenticated;
grant execute on function public.admin_upsert_scratchcard_v1(uuid,text,numeric,boolean,boolean) to authenticated;
grant execute on function public.admin_set_daily_scratch_v1(uuid) to authenticated;
grant execute on function public.admin_upsert_store_item_v1(uuid,text,text,integer,integer,integer,integer,text,timestamptz,timestamptz,integer,text,boolean) to authenticated;
grant execute on function public.admin_create_mystery_draft_v1(text) to authenticated;
grant execute on function public.admin_add_mystery_entry_v1(uuid,uuid,numeric) to authenticated;
grant execute on function public.admin_update_mystery_entry_v1(uuid,numeric) to authenticated;
grant execute on function public.admin_delete_mystery_entry_v1(uuid) to authenticated;
grant execute on function public.admin_publish_mystery_v1(uuid) to authenticated;
