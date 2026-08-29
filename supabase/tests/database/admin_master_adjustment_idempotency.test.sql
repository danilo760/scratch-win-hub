begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(3);

insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
('b1000000-0000-4000-8000-000000000001','authenticated','authenticated','adjust-user@example.invalid','{}','{"display_name":"Adjust User"}',now(),now()),
('b2000000-0000-4000-8000-000000000002','authenticated','authenticated','adjust-admin@example.invalid','{}','{"display_name":"Adjust Admin"}',now(),now()),
('b3000000-0000-4000-8000-000000000003','authenticated','authenticated','adjust-master@example.invalid','{}','{"display_name":"Adjust Master"}',now(),now());

update public.profiles set admin_role='admin' where id='b2000000-0000-4000-8000-000000000002';
update public.profiles set admin_role='admin_master' where id='b3000000-0000-4000-8000-000000000003';

select set_config('request.jwt.claims','{"sub":"b2000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
set local role authenticated;
do $$
begin
  begin
    perform public.admin_master_adjust_user_v2(
      'b1000000-0000-4000-8000-000000000001',
      'b4000000-0000-4000-8000-000000000004',
      2.50,
      15,
      'forbidden'
    );
    raise exception 'normal admin adjusted wallet through v2';
  exception when others then
    if sqlerrm='normal admin adjusted wallet through v2' then raise; end if;
    if position('admin master' in sqlerrm)=0 then
      raise exception 'unexpected v2 permission denial: %', sqlerrm;
    end if;
  end;
end $$;
reset role;

select set_config('request.jwt.claims','{"sub":"b3000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
set local role authenticated;
do $$
declare
  v_first jsonb;
  v_retry jsonb;
begin
  v_first := public.admin_master_adjust_user_v2(
    'b1000000-0000-4000-8000-000000000001',
    'b5000000-0000-4000-8000-000000000005',
    2.50,
    15,
    'Idempotency contract'
  );

  v_retry := public.admin_master_adjust_user_v2(
    'b1000000-0000-4000-8000-000000000001',
    'b5000000-0000-4000-8000-000000000005',
    2.50,
    15,
    'Idempotency contract'
  );

  if v_first is distinct from v_retry then
    raise exception 'retry response changed: first %, retry %', v_first, v_retry;
  end if;

  begin
    perform public.admin_master_adjust_user_v2(
      'b1000000-0000-4000-8000-000000000001',
      'b5000000-0000-4000-8000-000000000005',
      5.00,
      15,
      'Idempotency contract'
    );
    raise exception 'request id accepted a different payload';
  exception when others then
    if sqlerrm='request id accepted a different payload' then raise; end if;
    if position('parâmetros diferentes' in sqlerrm)=0 then
      raise exception 'unexpected payload mismatch error: %', sqlerrm;
    end if;
  end;
end $$;
reset role;

do $$
declare
  v_balance numeric;
  v_points integer;
  v_request_count integer;
  v_credit_count integer;
  v_points_count integer;
  v_audit_count integer;
  v_admin_audit_count integer;
begin
  select balance, points into v_balance, v_points
  from public.profiles
  where id='b1000000-0000-4000-8000-000000000001';

  if v_balance <> 12.50 or v_points <> 15 then
    raise exception 'retry changed wallet more than once: balance %, points %', v_balance, v_points;
  end if;

  select count(*) into v_request_count
  from public.admin_adjustment_requests
  where actor_id='b3000000-0000-4000-8000-000000000003'
    and client_request_id='b5000000-0000-4000-8000-000000000005';

  select count(*) into v_credit_count
  from public.credit_ledger
  where user_id='b1000000-0000-4000-8000-000000000001'
    and transaction_type='ADMIN_ADJUSTMENT'
    and metadata->>'client_request_id'='b5000000-0000-4000-8000-000000000005';

  select count(*) into v_points_count
  from public.points_ledger
  where user_id='b1000000-0000-4000-8000-000000000001'
    and transaction_type='ADMIN_ADJUSTMENT'
    and metadata->>'client_request_id'='b5000000-0000-4000-8000-000000000005';

  select count(*) into v_audit_count
  from public.audit_logs
  where admin_id='b3000000-0000-4000-8000-000000000003'
    and action='user.wallet_adjusted'
    and metadata->>'client_request_id'='b5000000-0000-4000-8000-000000000005';

  select count(*) into v_admin_audit_count
  from public.admin_audit_logs
  where actor_id='b3000000-0000-4000-8000-000000000003'
    and action='user.wallet_adjusted'
    and metadata->>'client_request_id'='b5000000-0000-4000-8000-000000000005';

  if v_request_count <> 1 or v_credit_count <> 1 or v_points_count <> 1
     or v_audit_count <> 1 or v_admin_audit_count <> 1 then
    raise exception 'idempotency artifacts duplicated: request %, credit %, points %, audit %, admin audit %',
      v_request_count, v_credit_count, v_points_count, v_audit_count, v_admin_audit_count;
  end if;
end $$;

select extensions.ok(
  not has_function_privilege('authenticated', 'public.admin_master_adjust_user_v1(uuid,numeric,integer,text)', 'EXECUTE'),
  'legacy Admin Master wallet v1 is not executable by authenticated clients'
);
select extensions.ok(
  has_function_privilege('authenticated', 'public.admin_master_adjust_user_v2(uuid,uuid,numeric,integer,text)', 'EXECUTE'),
  'idempotent Admin Master wallet v2 remains executable by authenticated clients'
);
select extensions.pass('Admin Master wallet v2 is master-only, payload-bound and idempotent across retries');
select * from extensions.finish();
rollback;
