begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(18);

create or replace function pg_temp.assert_client_grants(p_table text)
returns setof text
language plpgsql
as $$
begin
  return next extensions.ok(
    not has_table_privilege('anon', format('public.%I', p_table), 'SELECT')
    and not has_table_privilege('anon', format('public.%I', p_table), 'INSERT')
    and not has_table_privilege('anon', format('public.%I', p_table), 'UPDATE')
    and not has_table_privilege('anon', format('public.%I', p_table), 'DELETE')
    and not has_table_privilege('anon', format('public.%I', p_table), 'TRUNCATE'),
    format('anon has no direct privileges on %s', p_table)
  );

  return next extensions.ok(
    has_table_privilege('authenticated', format('public.%I', p_table), 'SELECT')
    and not has_table_privilege('authenticated', format('public.%I', p_table), 'INSERT')
    and not has_table_privilege('authenticated', format('public.%I', p_table), 'UPDATE')
    and not has_table_privilege('authenticated', format('public.%I', p_table), 'DELETE')
    and not has_table_privilege('authenticated', format('public.%I', p_table), 'TRUNCATE'),
    format('authenticated has read-only direct access to %s', p_table)
  );
end;
$$;

select * from pg_temp.assert_client_grants('profiles');
select * from pg_temp.assert_client_grants('plays');
select * from pg_temp.assert_client_grants('credit_ledger');
select * from pg_temp.assert_client_grants('points_ledger');
select * from pg_temp.assert_client_grants('redemptions');
select * from pg_temp.assert_client_grants('daily_scratch_claims');
select * from pg_temp.assert_client_grants('mystery_openings');
select * from pg_temp.assert_client_grants('xp_transactions');
select * from pg_temp.assert_client_grants('user_achievements');

select * from extensions.finish();
rollback;
