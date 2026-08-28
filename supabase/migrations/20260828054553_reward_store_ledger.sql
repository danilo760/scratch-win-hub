alter table public.store_items add column if not exists image_url text;
alter table public.store_items add column if not exists stock_total integer;
alter table public.store_items add column if not exists stock_available integer;
alter table public.store_items add column if not exists per_user_limit integer;
alter table public.store_items add column if not exists category text;
alter table public.store_items add column if not exists starts_at timestamptz;
alter table public.store_items add column if not exists ends_at timestamptz;
alter table public.store_items add column if not exists display_order integer not null default 0;
update public.store_items set stock_total=coalesce(stock_total,stock),stock_available=coalesce(stock_available,stock),per_user_limit=coalesce(per_user_limit,1),category=coalesce(category,'geral') where stock_total is null or stock_available is null or per_user_limit is null or category is null;
alter table public.store_items alter column stock_total set not null;
alter table public.store_items alter column stock_available set not null;
alter table public.store_items alter column per_user_limit set not null;
alter table public.store_items add constraint store_stock_nonnegative check (stock_total >= 0 and stock_available >= 0 and stock_available <= stock_total) not valid;
alter table public.store_items validate constraint store_stock_nonnegative;
alter table public.redemptions add column if not exists client_request_id uuid;
alter table public.redemptions add column if not exists status text not null default 'SOLICITADO';
alter table public.redemptions add column if not exists protocol text;
alter table public.redemptions add column if not exists fulfillment_code text;
alter table public.redemptions add column if not exists updated_at timestamptz not null default now();
alter table public.redemptions add constraint redemption_status_valid check (status in ('SOLICITADO','APROVADO','PREPARANDO','DISPONIVEL','ENTREGUE','CANCELADO')) not valid;
alter table public.redemptions validate constraint redemption_status_valid;
create unique index if not exists redemptions_user_request_unique on public.redemptions(user_id,client_request_id) where client_request_id is not null;
create unique index if not exists redemptions_protocol_unique on public.redemptions(protocol) where protocol is not null;
create table if not exists public.points_ledger (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), amount integer not null,
 balance_before integer not null, balance_after integer not null, transaction_type text not null check(transaction_type in ('SCRATCH_COST','SCRATCH_REWARD','DAILY_REWARD','REDEMPTION','REDEMPTION_REFUND','ADMIN_ADJUSTMENT')),
 reference_type text not null, reference_id uuid not null, created_at timestamptz not null default now(), metadata jsonb not null default '{}'::jsonb,
 unique(reference_type,reference_id,transaction_type)
);
create index if not exists points_ledger_user_idx on public.points_ledger(user_id,created_at desc);
alter table public.points_ledger enable row level security;
create policy "read own points ledger" on public.points_ledger for select to authenticated using (user_id=(select auth.uid()));
create or replace function public.redeem_reward_v1(p_item_id uuid,p_client_request_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_user uuid:=auth.uid(); v_item store_items%rowtype; v_redemption redemptions%rowtype; v_points integer; v_count integer; v_before integer;
begin
 if v_user is null or p_client_request_id is null then raise exception 'Requisição inválida'; end if;
 select * into v_redemption from redemptions where user_id=v_user and client_request_id=p_client_request_id;
 if found then return jsonb_build_object('id',v_redemption.id,'protocol',v_redemption.protocol,'status',v_redemption.status,'idempotent',true); end if;
 select * into v_item from store_items where id=p_item_id and active=true and (starts_at is null or starts_at<=now()) and (ends_at is null or ends_at>now()) for update;
 if not found then raise exception 'Item indisponível'; end if;
 if v_item.stock_available <= 0 then raise exception 'ESGOTADO'; end if;
 select points into v_points from profiles where id=v_user for update; v_before:=v_points;
 if v_points < v_item.points_cost then raise exception 'Pontos insuficientes'; end if;
 select count(*) into v_count from redemptions where user_id=v_user and item_id=p_item_id and status <> 'CANCELADO';
 if v_count >= v_item.per_user_limit then raise exception 'Limite por usuário atingido'; end if;
 update store_items set stock_available=stock_available-1, stock=stock_available-1 where id=v_item.id and stock_available>0;
 if not found then raise exception 'ESGOTADO'; end if;
 update profiles set points=points-v_item.points_cost where id=v_user returning points into v_points;
 insert into redemptions(user_id,item_id,points_spent,client_request_id,status,protocol) values(v_user,p_item_id,v_item.points_cost,p_client_request_id,'SOLICITADO','RWD-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))) returning * into v_redemption;
 insert into points_ledger(user_id,amount,balance_before,balance_after,transaction_type,reference_type,reference_id,metadata) values(v_user,-v_item.points_cost,v_before,v_points,'REDEMPTION','redemption',v_redemption.id,jsonb_build_object('item_id',v_item.id));
 return jsonb_build_object('id',v_redemption.id,'protocol',v_redemption.protocol,'status',v_redemption.status,'new_points',v_points,'idempotent',false);
end; $$;
create or replace function public.admin_update_redemption_v1(p_redemption_id uuid,p_status text,p_fulfillment_code text default null) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_admin uuid:=auth.uid(); v_red redemptions%rowtype; v_before integer; v_after integer;
begin
 if v_admin is null or not is_admin(v_admin) then raise exception 'Sem permissão'; end if;
 if p_status not in ('APROVADO','PREPARANDO','DISPONIVEL','ENTREGUE','CANCELADO') then raise exception 'Status inválido'; end if;
 select * into v_red from redemptions where id=p_redemption_id for update; if not found then raise exception 'Resgate não encontrado'; end if;
 if v_red.status='CANCELADO' then return jsonb_build_object('id',v_red.id,'status',v_red.status,'idempotent',true); end if;
 if p_status='CANCELADO' then
   select points into v_before from profiles where id=v_red.user_id for update;
   update profiles set points=points+v_red.points_spent where id=v_red.user_id returning points into v_after;
   insert into points_ledger(user_id,amount,balance_before,balance_after,transaction_type,reference_type,reference_id,metadata) values(v_red.user_id,v_red.points_spent,v_before,v_after,'REDEMPTION_REFUND','redemption',v_red.id,'{}') on conflict(reference_type,reference_id,transaction_type) do nothing;
   if found then update store_items set stock_available=stock_available+1,stock=stock_available+1 where id=v_red.item_id; end if;
 end if;
 update redemptions set status=p_status,fulfillment_code=coalesce(p_fulfillment_code,fulfillment_code),updated_at=now() where id=v_red.id returning * into v_red;
 return jsonb_build_object('id',v_red.id,'status',v_red.status,'protocol',v_red.protocol);
end; $$;
revoke all on function public.redeem_reward_v1(uuid,uuid) from public,anon;
grant execute on function public.redeem_reward_v1(uuid,uuid) to authenticated;
revoke all on function public.admin_update_redemption_v1(uuid,text,text) from public,anon;
grant execute on function public.admin_update_redemption_v1(uuid,text,text) to authenticated;
