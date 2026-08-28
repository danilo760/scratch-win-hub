begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(2);

select extensions.ok(
  not has_table_privilege('anon','public.profiles','SELECT')
  and not has_table_privilege('anon','public.profiles','INSERT')
  and not has_table_privilege('anon','public.profiles','UPDATE')
  and not has_table_privilege('anon','public.profiles','DELETE')
  and not has_table_privilege('anon','public.profiles','TRUNCATE'),
  'anon has no direct privileges on profiles'
);

select extensions.ok(
  has_table_privilege('authenticated','public.profiles','SELECT')
  and not has_table_privilege('authenticated','public.profiles','INSERT')
  and not has_table_privilege('authenticated','public.profiles','UPDATE')
  and not has_table_privilege('authenticated','public.profiles','DELETE')
  and not has_table_privilege('authenticated','public.profiles','TRUNCATE'),
  'authenticated has read-only direct access to profiles'
);

select * from extensions.finish();
rollback;
