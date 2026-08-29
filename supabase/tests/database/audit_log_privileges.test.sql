begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(1);

do $$
begin
  if has_table_privilege('anon', 'public.audit_logs', 'SELECT') then
    raise exception 'anon can still select public.audit_logs';
  end if;

  if has_table_privilege('anon', 'public.admin_audit_logs', 'SELECT') then
    raise exception 'anon can still select public.admin_audit_logs';
  end if;

  if has_table_privilege('authenticated', 'public.audit_logs', 'SELECT') then
    raise exception 'authenticated can still select public.audit_logs directly';
  end if;

  if has_table_privilege('authenticated', 'public.admin_audit_logs', 'SELECT') then
    raise exception 'authenticated can still select public.admin_audit_logs directly';
  end if;

  if not has_function_privilege('authenticated', 'public.get_admin_operations_v1()', 'EXECUTE') then
    raise exception 'authenticated lost execute on get_admin_operations_v1';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'audit_logs'
      and cmd = 'SELECT'
      and 'authenticated' = any(roles)
  ) then
    raise exception 'authenticated audit_logs policy missing';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'admin_audit_logs'
      and cmd = 'SELECT'
      and 'authenticated' = any(roles)
  ) then
    raise exception 'authenticated admin_audit_logs policy missing';
  end if;
end $$;

select extensions.pass('client roles cannot read audit tables directly and the protected admin RPC remains executable');
select * from extensions.finish();
rollback;
