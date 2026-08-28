alter table public.redemptions
  add column if not exists item_title_snapshot text,
  add column if not exists item_image_url_snapshot text;

update public.redemptions r
set item_title_snapshot = coalesce(r.item_title_snapshot, s.title),
    item_image_url_snapshot = coalesce(r.item_image_url_snapshot, s.image_url)
from public.store_items s
where s.id = r.item_id
  and r.item_title_snapshot is null;

alter table public.redemptions
  alter column item_title_snapshot set not null;

alter table public.redemptions
  drop constraint if exists redemptions_item_id_fkey;

alter table public.redemptions
  add constraint redemptions_item_id_fkey
  foreign key (item_id) references public.store_items(id) on delete restrict;

alter table public.store_items
  drop constraint if exists store_points_cost_nonnegative,
  drop constraint if exists store_per_user_limit_positive,
  drop constraint if exists store_window_valid,
  drop constraint if exists store_stock_alias_matches;

alter table public.store_items
  add constraint store_points_cost_nonnegative check (points_cost >= 0),
  add constraint store_per_user_limit_positive check (per_user_limit >= 1),
  add constraint store_window_valid check (starts_at is null or ends_at is null or starts_at < ends_at),
  add constraint store_stock_alias_matches check (stock = stock_available);

create index if not exists idx_redemptions_user_created_at
  on public.redemptions(user_id, created_at desc);

create index if not exists idx_redemptions_user_item_active
  on public.redemptions(user_id, item_id)
  where status <> 'CANCELADO';

revoke all privileges on table public.store_items from anon;
revoke insert, update, delete, truncate, references, trigger on table public.store_items from authenticated;
grant select on table public.store_items to authenticated;

drop policy if exists "Authenticated users can view active store items" on public.store_items;
drop policy if exists "Authenticated users can view redeemable store items" on public.store_items;
create policy "Authenticated users can view redeemable store items"
on public.store_items
for select
to authenticated
using (
  active = true
  and (starts_at is null or starts_at <= now())
  and (ends_at is null or ends_at > now())
);

create or replace function public.redeem_reward_v1(p_item_id uuid, p_client_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_user uuid := auth.uid();
  v_item public.store_items%rowtype;
  v_redemption public.redemptions%rowtype;
  v_points integer;
  v_count integer;
  v_before integer;
begin
  if v_user is null or p_item_id is null or p_client_request_id is null then
    raise exception 'Requisição inválida';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('redeem:' || v_user::text || ':' || p_client_request_id::text, 0)
  );

  select * into v_redemption
  from public.redemptions
  where user_id = v_user and client_request_id = p_client_request_id;

  if found then
    if v_redemption.item_id <> p_item_id then
      raise exception 'client_request_id já utilizado para outro item';
    end if;

    if v_redemption.points_after is null then
      select points into v_points from public.profiles where id = v_user;
    else
      v_points := v_redemption.points_after;
    end if;

    return jsonb_build_object(
      'id', v_redemption.id,
      'protocol', v_redemption.protocol,
      'status', v_redemption.status,
      'item_id', v_redemption.item_id,
      'item_title', v_redemption.item_title_snapshot,
      'points_spent', v_redemption.points_spent,
      'new_points', v_points,
      'idempotent', true
    );
  end if;

  select * into v_item
  from public.store_items
  where id = p_item_id
    and active = true
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at > now())
  for update;

  if not found then raise exception 'Item indisponível'; end if;
  if v_item.stock_available <= 0 then raise exception 'ESGOTADO'; end if;

  select points into v_points
  from public.profiles
  where id = v_user
  for update;

  if not found then raise exception 'Perfil inexistente'; end if;

  v_before := v_points;
  if v_points < v_item.points_cost then raise exception 'Pontos insuficientes'; end if;

  select count(*) into v_count
  from public.redemptions
  where user_id = v_user
    and item_id = p_item_id
    and status <> 'CANCELADO';

  if v_count >= v_item.per_user_limit then raise exception 'Limite por usuário atingido'; end if;

  update public.store_items
  set stock_available = stock_available - 1,
      stock = stock_available - 1,
      updated_at = now()
  where id = v_item.id and stock_available > 0;

  if not found then raise exception 'ESGOTADO'; end if;

  update public.profiles
  set points = points - v_item.points_cost
  where id = v_user
  returning points into v_points;

  insert into public.redemptions(
    user_id, item_id, item_title_snapshot, item_image_url_snapshot,
    points_spent, client_request_id, status, protocol, points_after
  )
  values(
    v_user, v_item.id, v_item.title, v_item.image_url,
    v_item.points_cost, p_client_request_id, 'SOLICITADO',
    'RWD-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)),
    v_points
  )
  returning * into v_redemption;

  insert into public.points_ledger(
    user_id, amount, balance_before, balance_after,
    transaction_type, reference_type, reference_id, metadata
  )
  values(
    v_user, -v_item.points_cost, v_before, v_points,
    'REDEMPTION', 'redemption', v_redemption.id,
    jsonb_build_object('item_id', v_item.id, 'item_title', v_item.title)
  );

  return jsonb_build_object(
    'id', v_redemption.id,
    'protocol', v_redemption.protocol,
    'status', v_redemption.status,
    'item_id', v_redemption.item_id,
    'item_title', v_redemption.item_title_snapshot,
    'points_spent', v_redemption.points_spent,
    'new_points', v_points,
    'idempotent', false
  );
end;
$$;

create or replace function public.admin_update_redemption_v1(
  p_redemption_id uuid,
  p_status text,
  p_fulfillment_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_admin uuid := auth.uid();
  v_red public.redemptions%rowtype;
  v_before integer;
  v_after integer;
  v_previous text;
  v_code text := nullif(left(trim(coalesce(p_fulfillment_code,'')),200),'');
begin
  if v_admin is null or not public.is_admin(v_admin) then raise exception 'Sem permissão'; end if;
  if p_redemption_id is null or p_status is null or p_status not in ('APROVADO','PREPARANDO','DISPONIVEL','ENTREGUE','CANCELADO') then
    raise exception 'Status inválido';
  end if;

  select * into v_red
  from public.redemptions
  where id = p_redemption_id
  for update;

  if not found then raise exception 'Resgate não encontrado'; end if;

  if p_status = v_red.status then
    if p_status <> 'CANCELADO' and v_code is not null and v_code is distinct from v_red.fulfillment_code then
      update public.redemptions
      set fulfillment_code = v_code, updated_at = now()
      where id = v_red.id
      returning * into v_red;

      insert into public.audit_logs(admin_id,action,entity_type,entity_id,before_data,after_data,metadata)
      values(
        v_admin,'redemption.fulfillment_code_updated','redemption',v_red.id,
        jsonb_build_object('status',v_red.status),
        jsonb_build_object('status',v_red.status,'fulfillment_code_set',true),
        jsonb_build_object('protocol',v_red.protocol)
      );

      return jsonb_build_object('id',v_red.id,'status',v_red.status,'protocol',v_red.protocol,'idempotent',false);
    end if;

    return jsonb_build_object('id',v_red.id,'status',v_red.status,'protocol',v_red.protocol,'idempotent',true);
  end if;

  if (v_red.status='SOLICITADO' and p_status not in ('APROVADO','CANCELADO'))
     or (v_red.status='APROVADO' and p_status not in ('PREPARANDO','CANCELADO'))
     or (v_red.status='PREPARANDO' and p_status not in ('DISPONIVEL','CANCELADO'))
     or (v_red.status='DISPONIVEL' and p_status not in ('ENTREGUE','CANCELADO'))
     or v_red.status in ('ENTREGUE','CANCELADO') then
    raise exception 'Transição de status inválida';
  end if;

  v_previous := v_red.status;

  if p_status = 'CANCELADO' then
    if exists(
      select 1 from public.points_ledger
      where reference_type='redemption'
        and reference_id=v_red.id
        and transaction_type='REDEMPTION_REFUND'
    ) then
      raise exception 'Estado de reembolso inconsistente';
    end if;

    select points into v_before
    from public.profiles
    where id=v_red.user_id
    for update;

    if not found then raise exception 'Perfil do resgate inexistente'; end if;

    update public.profiles
    set points = points + v_red.points_spent
    where id = v_red.user_id
    returning points into v_after;

    insert into public.points_ledger(
      user_id,amount,balance_before,balance_after,
      transaction_type,reference_type,reference_id,metadata
    )
    values(
      v_red.user_id,v_red.points_spent,v_before,v_after,
      'REDEMPTION_REFUND','redemption',v_red.id,'{}'::jsonb
    );

    update public.store_items
    set stock_available = least(stock_total, stock_available + 1),
        stock = least(stock_total, stock_available + 1),
        updated_at = now()
    where id = v_red.item_id;

    if not found then raise exception 'Item do resgate inexistente'; end if;
  end if;

  update public.redemptions
  set status = p_status,
      fulfillment_code = case
        when p_status='CANCELADO' then fulfillment_code
        else coalesce(v_code, fulfillment_code)
      end,
      updated_at = now()
  where id = v_red.id
  returning * into v_red;

  insert into public.audit_logs(admin_id,action,entity_type,entity_id,before_data,after_data,metadata)
  values(
    v_admin,'redemption.status_changed','redemption',v_red.id,
    jsonb_build_object('status',v_previous),
    jsonb_build_object('status',v_red.status,'fulfillment_code_set',v_red.fulfillment_code is not null),
    jsonb_build_object('protocol',v_red.protocol)
  );

  insert into public.admin_audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(v_admin,'redemption.status_changed','redemption',v_red.id,jsonb_build_object('status',p_status));

  return jsonb_build_object(
    'id',v_red.id,'status',v_red.status,'protocol',v_red.protocol,
    'fulfillment_code',v_red.fulfillment_code,'idempotent',false
  );
end;
$$;

create or replace function public.get_admin_operations_v1()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
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
        'user_email',p.email,'user_name',p.display_name,'item_id',rd.item_id,
        'item_title',coalesce(rd.item_title_snapshot,s.title),
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
$$;