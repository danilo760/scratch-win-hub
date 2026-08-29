begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(8);

create or replace function pg_temp.assert_no_client_mutation_grants(p_table text)
returns setof text
language plpgsql
as $$
begin
  return next extensions.ok(
    not has_table_privilege('anon', format('public.%I', p_table), 'INSERT')
    and not has_table_privilege('anon', format('public.%I', p_table), 'UPDATE')
    and not has_table_privilege('anon', format('public.%I', p_table), 'DELETE')
    and not has_table_privilege('anon', format('public.%I', p_table), 'TRUNCATE')
    and not has_table_privilege('anon', format('public.%I', p_table), 'REFERENCES')
    and not has_table_privilege('anon', format('public.%I', p_table), 'TRIGGER')
    and not has_table_privilege('authenticated', format('public.%I', p_table), 'INSERT')
    and not has_table_privilege('authenticated', format('public.%I', p_table), 'UPDATE')
    and not has_table_privilege('authenticated', format('public.%I', p_table), 'DELETE')
    and not has_table_privilege('authenticated', format('public.%I', p_table), 'TRUNCATE')
    and not has_table_privilege('authenticated', format('public.%I', p_table), 'REFERENCES')
    and not has_table_privilege('authenticated', format('public.%I', p_table), 'TRIGGER'),
    format('clients have no direct mutation grants on %s', p_table)
  );

  return next extensions.ok(
    has_table_privilege('authenticated', format('public.%I', p_table), 'SELECT'),
    format('authenticated retains required read access on %s', p_table)
  );
end;
$$;

select * from pg_temp.assert_no_client_mutation_grants('achievements');
select * from pg_temp.assert_no_client_mutation_grants('admin_audit_logs');
select * from pg_temp.assert_no_client_mutation_grants('audit_logs');
select * from pg_temp.assert_no_client_mutation_grants('scratchcards');

select * from extensions.finish();
rollback;
