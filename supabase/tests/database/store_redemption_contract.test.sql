begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(1);

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
('81111111-1111-4111-8111-111111111111','authenticated','authenticated','store-contract-a@example.invalid','{}','{"display_name":"Store A"}',now(),now()),
('82222222-2222-4222-8222-222222222222','authenticated','authenticated','store-contract-b@example.invalid','{}','{"display_name":"Store B"}',now(),now()),
('83333333-3333-4333-8333-333333333333','authenticated','authenticated','store-contract-admin@example.invalid','{}','{"display_name":"Store Admin"}',now(),now());

update public.profiles set points=100 where id in ('81111111-1111-4111-8111-111111111111','82222222-2222-4222-8222-222222222222');
update public.profiles set is_admin=true where id='83333333-3333-4333-8333-333333333333';

insert into public.store_items(id,title,description,points_cost,stock,stock_total,stock_available,per_user_limit,active,display_order)
values
('84444444-4444-4444-8444-444444444441','STORE CONTRACT PRIMARY','fixture',10,2,2,2,1,true,0),
('84444444-4444-4444-8444-444444444442','STORE CONTRACT OTHER','fixture',15,1,1,1,2,true,1),
('84444444-4444-4444-8444-444444444443','STORE CONTRACT FUTURE','fixture',5,1,1,1,1,true,2);
update public.store_items set starts_at=now()+interval '1 day' where id='84444444-4444-4444-8444-444444444443';

create temporary table store_contract_results(k text primary key, v jsonb) on commit drop;
grant select, insert, update, delete on table store_contract_results to authenticated;

select set_config('request.jwt.claims','{"sub":"81111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
set local role authenticated;
do $$
begin
  if exists(select 1 from public.store_items where id='84444444-4444-4444-8444-444444444443') then
    raise exception 'future item leaked through RLS';
  end if;
  begin
    insert into public.store_items(title,points_cost,stock,stock_total,stock_available,per_user_limit) values('FORBIDDEN',1,1,1,1,1);
    raise exception 'direct store mutation unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
end $$;
insert into store_contract_results values ('a_first',public.redeem_reward_v1('84444444-4444-4444-8444-444444444441','85555555-5555-4555-8555-555555555551'));
insert into store_contract_results values ('a_retry',public.redeem_reward_v1('84444444-4444-4444-8444-444444444441','85555555-5555-4555-8555-555555555551'));
do $$
begin
  begin
    perform public.redeem_reward_v1('84444444-4444-4444-8444-444444444442','85555555-5555-4555-8555-555555555551');
    raise exception 'request mismatch unexpectedly succeeded';
  exception when others then
    if sqlerrm not ilike '%client_request_id já utilizado para outro item%' then raise; end if;
  end;
  begin
    perform public.redeem_reward_v1('84444444-4444-4444-8444-444444444441','85555555-5555-4555-8555-555555555552');
    raise exception 'per-user limit unexpectedly succeeded';
  exception when others then
    if sqlerrm not ilike '%Limite por usuário atingido%' then raise; end if;
  end;
end $$;
reset role;

select set_config('request.jwt.claims','{"sub":"82222222-2222-4222-8222-222222222222","role":"authenticated"}',true);
set local role authenticated;
insert into store_contract_results values ('b_first',public.redeem_reward_v1('84444444-4444-4444-8444-444444444441','85555555-5555-4555-8555-555555555553'));
reset role;

update public.store_items set title='STORE CONTRACT RENAMED' where id='84444444-4444-4444-8444-444444444441';
do $$
begin
  if exists(select 1 from public.redemptions where item_id='84444444-4444-4444-8444-444444444441' and item_title_snapshot <> 'STORE CONTRACT PRIMARY') then
    raise exception 'item snapshot changed after rename';
  end if;
  begin
    delete from public.store_items where id='84444444-4444-4444-8444-444444444441';
    raise exception 'item delete unexpectedly succeeded';
  exception when foreign_key_violation then null; end;
end $$;

select set_config('request.jwt.claims','{"sub":"83333333-3333-4333-8333-333333333333","role":"authenticated"}',true);
set local role authenticated;
insert into store_contract_results values ('approve',public.admin_update_redemption_v1((select (v->>'id')::uuid from store_contract_results where k='a_first'),'APROVADO',null));
insert into store_contract_results values ('preparing',public.admin_update_redemption_v1((select (v->>'id')::uuid from store_contract_results where k='a_first'),'PREPARANDO',null));
insert into store_contract_results values ('available',public.admin_update_redemption_v1((select (v->>'id')::uuid from store_contract_results where k='a_first'),'DISPONIVEL','CODE-ONE'));
insert into store_contract_results values ('code_update',public.admin_update_redemption_v1((select (v->>'id')::uuid from store_contract_results where k='a_first'),'DISPONIVEL','CODE-TWO'));
insert into store_contract_results values ('cancel',public.admin_update_redemption_v1((select (v->>'id')::uuid from store_contract_results where k='a_first'),'CANCELADO',null));
insert into store_contract_results values ('cancel_retry',public.admin_update_redemption_v1((select (v->>'id')::uuid from store_contract_results where k='a_first'),'CANCELADO',null));
do $$
begin
  begin
    perform public.admin_update_redemption_v1((select (v->>'id')::uuid from store_contract_results where k='a_first'),'APROVADO',null);
    raise exception 'terminal transition unexpectedly succeeded';
  exception when others then
    if sqlerrm not ilike '%Transição de status inválida%' then raise; end if;
  end;
end $$;
reset role;

do $$
declare
  a_id uuid := (select (v->>'id')::uuid from store_contract_results where k='a_first');
  b_id uuid := (select (v->>'id')::uuid from store_contract_results where k='b_first');
begin
  if (select (v->>'id') from store_contract_results where k='a_first') is distinct from (select (v->>'id') from store_contract_results where k='a_retry') then raise exception 'retry returned a different redemption'; end if;
  if not coalesce((select (v->>'idempotent')::boolean from store_contract_results where k='a_retry'),false) then raise exception 'retry not idempotent'; end if;
  if (select count(*) from public.redemptions where id in (a_id,b_id)) <> 2 then raise exception 'redemption count mismatch'; end if;
  if (select count(*) from public.points_ledger where transaction_type='REDEMPTION' and reference_id in (a_id,b_id)) <> 2 then raise exception 'debit ledger mismatch'; end if;
  if (select count(*) from public.points_ledger where transaction_type='REDEMPTION_REFUND' and reference_id=a_id) <> 1 then raise exception 'refund ledger mismatch'; end if;
  if (select points from public.profiles where id='81111111-1111-4111-8111-111111111111') <> 100 then raise exception 'refund points mismatch'; end if;
  if (select points from public.profiles where id='82222222-2222-4222-8222-222222222222') <> 90 then raise exception 'peer points mismatch'; end if;
  if (select stock_available from public.store_items where id='84444444-4444-4444-8444-444444444441') <> 1 then raise exception 'stock refund mismatch'; end if;
  if (select fulfillment_code from public.redemptions where id=a_id) <> 'CODE-TWO' then raise exception 'fulfillment code update mismatch'; end if;
  if not coalesce((select (v->>'idempotent')::boolean from store_contract_results where k='cancel_retry'),false) then raise exception 'cancel retry not idempotent'; end if;
end $$;

select extensions.pass('store redemption contract is atomic, auditable and idempotent');
select * from extensions.finish();
rollback;
