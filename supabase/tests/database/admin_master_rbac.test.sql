begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(1);

insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
('a1000000-0000-4000-8000-000000000001','authenticated','authenticated','rbac-user@example.invalid','{}','{"display_name":"RBAC User"}',now(),now()),
('a2000000-0000-4000-8000-000000000002','authenticated','authenticated','rbac-admin@example.invalid','{}','{"display_name":"RBAC Admin"}',now(),now()),
('a3000000-0000-4000-8000-000000000003','authenticated','authenticated','rbac-master@example.invalid','{}','{"display_name":"RBAC Master"}',now(),now());

-- Legacy boolean promotion remains compatible and maps to the normal admin role.
update public.profiles set is_admin=true where id='a2000000-0000-4000-8000-000000000002';
update public.profiles set admin_role='admin_master' where id='a3000000-0000-4000-8000-000000000003';

insert into public.scratchcards(id,title,price,active)
values ('a4000000-0000-4000-8000-000000000004','RBAC fixture',1,true);

-- Normal admin: operational functions work, privileged configuration does not.
select set_config('request.jwt.claims','{"sub":"a2000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
set local role authenticated;
do $$
declare v_store uuid;
begin
  if not public.is_admin(auth.uid()) then raise exception 'normal admin not recognized'; end if;
  if public.is_admin_master(auth.uid()) then raise exception 'normal admin recognized as master'; end if;

  v_store := public.admin_upsert_store_item_v1(
    'RBAC Store', 10, 2, 2, 1, true, null, 'fixture', 'test', null, null, 0, null
  );
  if v_store is null then raise exception 'normal admin could not perform operational store action'; end if;

  begin
    perform public.create_math_draft_v1('a4000000-0000-4000-8000-000000000004','ADMIN FORBIDDEN','bronze');
    raise exception 'normal admin changed math';
  exception when others then
    if sqlerrm='normal admin changed math' then raise; end if;
    if position('admin master' in sqlerrm)=0 then raise exception 'unexpected math denial: %',sqlerrm; end if;
  end;

  begin
    perform public.admin_set_user_role_v1('a1000000-0000-4000-8000-000000000001','admin');
    raise exception 'normal admin changed role';
  exception when others then
    if sqlerrm='normal admin changed role' then raise; end if;
    if position('admin master' in sqlerrm)=0 then raise exception 'unexpected role denial: %',sqlerrm; end if;
  end;

  begin
    perform public.admin_master_adjust_user_v1('a1000000-0000-4000-8000-000000000001',1,5,'forbidden');
    raise exception 'normal admin adjusted wallet';
  exception when others then
    if sqlerrm='normal admin adjusted wallet' then raise; end if;
    if position('admin master' in sqlerrm)=0 then raise exception 'unexpected wallet denial: %',sqlerrm; end if;
  end;
end $$;
reset role;

-- Master: all privileged configuration is available and audited.
select set_config('request.jwt.claims','{"sub":"a3000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
set local role authenticated;
do $$
declare
  v_math uuid;
  v_wallet jsonb;
  v_role jsonb;
  v_role_count integer;
  v_balance numeric;
  v_points integer;
begin
  if not public.is_admin(auth.uid()) or not public.is_admin_master(auth.uid()) then
    raise exception 'master role not recognized';
  end if;

  v_math := public.create_math_draft_v1(
    'a4000000-0000-4000-8000-000000000004','MASTER DRAFT','bronze'
  );
  if v_math is null then raise exception 'master could not create math draft'; end if;

  v_role := public.admin_set_user_role_v1('a1000000-0000-4000-8000-000000000001','admin');
  if v_role->>'admin_role' <> 'admin' then raise exception 'master role change failed: %',v_role; end if;

  v_wallet := public.admin_master_adjust_user_v1(
    'a1000000-0000-4000-8000-000000000001', 2.50, 15, 'RBAC test adjustment'
  );
  select balance,points into v_balance,v_points
  from public.profiles where id='a1000000-0000-4000-8000-000000000001';
  if v_balance <> 12.50 or v_points <> 15 then
    raise exception 'wallet adjustment failed: %, %',v_balance,v_points;
  end if;
  if not exists(
    select 1 from public.credit_ledger
    where user_id='a1000000-0000-4000-8000-000000000001'
      and transaction_type='ADMIN_ADJUSTMENT'
      and amount=2.50
  ) then raise exception 'credit adjustment was not ledgered'; end if;
  if not exists(
    select 1 from public.points_ledger
    where user_id='a1000000-0000-4000-8000-000000000001'
      and transaction_type='ADMIN_ADJUSTMENT'
      and amount=15
  ) then raise exception 'points adjustment was not ledgered'; end if;

  select count(*) into v_role_count from public.get_admin_user_management_v1();
  if v_role_count < 3 then raise exception 'master user management snapshot incomplete'; end if;

  begin
    perform public.admin_set_user_role_v1('a3000000-0000-4000-8000-000000000003','admin');
    raise exception 'last master was demoted';
  exception when others then
    if sqlerrm='last master was demoted' then raise; end if;
    if position('último admin master' in sqlerrm)=0 then raise exception 'unexpected last-master denial: %',sqlerrm; end if;
  end;
end $$;
reset role;

select extensions.pass('RBAC separates normal admin from admin_master while preserving operational admin work, master configuration, audited wallet adjustments and last-master protection');
select * from extensions.finish();
rollback;
