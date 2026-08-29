begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(4);

create or replace function pg_temp.assert_no_client_mutation_grants(p_table text)
returns text
language plpgsql
as $$
begin
  return extensions.ok(
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
end;
$$;

select pg_temp.assert_no_client_mutation_grants('achievements');
select pg_temp.assert_no_client_mutation_grants('admin_audit_logs');
select pg_temp.assert_no_client_mutation_grants('audit_logs');
select pg_temp.assert_no_client_mutation_grants('scratchcards');

select * from extensions.finish();
rollback;
