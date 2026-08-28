begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(1);

do $$
begin
  if has_table_privilege('anon','public.mystery_versions','SELECT')
     or has_table_privilege('anon','public.mystery_versions','INSERT')
     or has_table_privilege('anon','public.mystery_versions','UPDATE')
     or has_table_privilege('anon','public.mystery_versions','DELETE')
     or has_table_privilege('anon','public.mystery_versions','TRUNCATE')
     or has_table_privilege('anon','public.mystery_version_entries','SELECT')
     or has_table_privilege('anon','public.mystery_version_entries','INSERT')
     or has_table_privilege('anon','public.mystery_version_entries','UPDATE')
     or has_table_privilege('anon','public.mystery_version_entries','DELETE')
     or has_table_privilege('anon','public.mystery_version_entries','TRUNCATE') then
    raise exception 'anon retained direct mystery table privileges';
  end if;

  if not has_table_privilege('authenticated','public.mystery_versions','SELECT')
     or has_table_privilege('authenticated','public.mystery_versions','INSERT')
     or has_table_privilege('authenticated','public.mystery_versions','UPDATE')
     or has_table_privilege('authenticated','public.mystery_versions','DELETE')
     or has_table_privilege('authenticated','public.mystery_versions','TRUNCATE') then
    raise exception 'authenticated mystery_versions privileges are not read-only';
  end if;

  if not has_table_privilege('authenticated','public.mystery_version_entries','SELECT')
     or has_table_privilege('authenticated','public.mystery_version_entries','INSERT')
     or has_table_privilege('authenticated','public.mystery_version_entries','UPDATE')
     or has_table_privilege('authenticated','public.mystery_version_entries','DELETE')
     or has_table_privilege('authenticated','public.mystery_version_entries','TRUNCATE') then
    raise exception 'authenticated mystery_version_entries privileges are not read-only';
  end if;

  if has_function_privilege('anon','public.claim_daily_scratch_v2(uuid)','EXECUTE')
     or has_function_privilege('anon','public.open_mystery_scratch_v1(uuid)','EXECUTE')
     or has_function_privilege('anon','public.get_special_scratch_status_v1()','EXECUTE') then
    raise exception 'anon can execute authenticated special scratch RPCs';
  end if;

  if not has_function_privilege('authenticated','public.claim_daily_scratch_v2(uuid)','EXECUTE')
     or not has_function_privilege('authenticated','public.open_mystery_scratch_v1(uuid)','EXECUTE')
     or not has_function_privilege('authenticated','public.get_special_scratch_status_v1()','EXECUTE') then
    raise exception 'authenticated special scratch RPC execute grant is missing';
  end if;

  if has_function_privilege('authenticated','public.claim_daily_scratch_v1(uuid,uuid)','EXECUTE') then
    raise exception 'legacy daily v1 is directly executable by authenticated';
  end if;
end $$;

select extensions.pass('special scratch tables and RPCs expose only the intended client surface');
select * from extensions.finish();
rollback;
