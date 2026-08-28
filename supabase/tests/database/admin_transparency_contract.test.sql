begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(7);

select extensions.ok(
  has_function_privilege('anon','public.get_transparency_v1()','EXECUTE'),
  'anon can execute the safe public transparency RPC'
);

select extensions.ok(
  not has_function_privilege('anon','public.get_admin_dashboard_v1()','EXECUTE'),
  'anon cannot execute the admin dashboard RPC'
);

select extensions.ok(
  has_function_privilege('authenticated','public.get_admin_dashboard_v1()','EXECUTE'),
  'authenticated role can reach the dashboard RPC before application-level admin authorization'
);

set local role anon;
select extensions.ok(
  not jsonb_path_exists(public.get_transparency_v1(), '$.campaigns[*].scratchcard_id'),
  'public transparency does not expose internal scratchcard ids'
);
select extensions.ok(
  not jsonb_path_exists(public.get_transparency_v1(), '$.campaigns[*].outcomes[*].weight'),
  'public transparency does not expose raw outcome weights'
);
select extensions.ok(
  position('user_id' in public.get_transparency_v1()::text) = 0
  and position('ledger' in public.get_transparency_v1()::text) = 0,
  'public transparency does not expose user or ledger data'
);
reset role;

insert into auth.users (id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('91111111-1111-4111-8111-111111111111','authenticated','authenticated','admin-dashboard-contract@example.invalid','{}','{"display_name":"Dashboard Admin"}',now(),now());
update public.profiles set is_admin=true where id='91111111-1111-4111-8111-111111111111';
select set_config('request.jwt.claims','{"sub":"91111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
set local role authenticated;
select extensions.ok(
  public.get_admin_dashboard_v1()->>'timezone' = 'America/Sao_Paulo'
  and public.get_admin_dashboard_v1() ? 'local_date',
  'admin dashboard uses the explicit Sao Paulo operational day contract'
);
reset role;

select * from extensions.finish();
rollback;
