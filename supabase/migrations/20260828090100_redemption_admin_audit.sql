create table if not exists public.admin_audit_logs (
 id uuid primary key default gen_random_uuid(), actor_id uuid references auth.users(id), action text not null, entity_type text not null, entity_id uuid not null, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
alter table public.admin_audit_logs enable row level security;
create policy "admins read redemption data" on public.redemptions for select to authenticated using (is_admin((select auth.uid())));
create policy "admins read redemption audit" on public.admin_audit_logs for select to authenticated using (is_admin((select auth.uid())));
create or replace function public.admin_update_redemption_v1(p_redemption_id uuid,p_status text,p_fulfillment_code text default null) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_admin uuid:=auth.uid(); v_red redemptions%rowtype; v_before integer; v_after integer;
begin
 if v_admin is null or not is_admin(v_admin) then raise exception 'Sem permissão'; end if;
 if p_status not in ('APROVADO','PREPARANDO','DISPONIVEL','ENTREGUE','CANCELADO') then raise exception 'Status inválido'; end if;
 select * into v_red from redemptions where id=p_redemption_id for update; if not found then raise exception 'Resgate não encontrado'; end if;
 if v_red.status='CANCELADO' then return jsonb_build_object('id',v_red.id,'status',v_red.status,'idempotent',true); end if;
 if p_status='CANCELADO' then select points into v_before from profiles where id=v_red.user_id for update; update profiles set points=points+v_red.points_spent where id=v_red.user_id returning points into v_after; insert into points_ledger(user_id,amount,balance_before,balance_after,transaction_type,reference_type,reference_id,metadata) values(v_red.user_id,v_red.points_spent,v_before,v_after,'REDEMPTION_REFUND','redemption',v_red.id,'{}') on conflict(reference_type,reference_id,transaction_type) do nothing; if found then update store_items set stock_available=stock_available+1,stock=stock_available+1 where id=v_red.item_id; end if; end if;
 update redemptions set status=p_status,fulfillment_code=coalesce(p_fulfillment_code,fulfillment_code),updated_at=now() where id=v_red.id returning * into v_red;
 insert into admin_audit_logs(actor_id,action,entity_type,entity_id,metadata) values(v_admin,'redemption.status_changed','redemption',v_red.id,jsonb_build_object('status',p_status));
 return jsonb_build_object('id',v_red.id,'status',v_red.status,'protocol',v_red.protocol);
end; $$;
