begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(1);

do $$
declare
  legacy_oid oid;
begin
  select p.oid into legacy_oid
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='redeem_item'
    and pg_get_function_identity_arguments(p.oid)='item_id_param uuid';

  if legacy_oid is null then raise exception 'legacy redeem_item function not found'; end if;
  if has_function_privilege('anon',legacy_oid,'EXECUTE') then raise exception 'anon can execute legacy redeem_item'; end if;
  if has_function_privilege('authenticated',legacy_oid,'EXECUTE') then raise exception 'authenticated can execute legacy redeem_item'; end if;
  if has_function_privilege('service_role',legacy_oid,'EXECUTE') then raise exception 'service_role can execute legacy redeem_item'; end if;

  if not has_table_privilege('authenticated','public.store_items','SELECT') then raise exception 'authenticated cannot read store_items'; end if;
  if has_table_privilege('authenticated','public.store_items','INSERT')
     or has_table_privilege('authenticated','public.store_items','UPDATE')
     or has_table_privilege('authenticated','public.store_items','DELETE')
     or has_table_privilege('authenticated','public.store_items','TRUNCATE') then
    raise exception 'authenticated has direct store mutation privileges';
  end if;
end $$;

select extensions.pass('store and legacy redemption privilege surface is locked down');
select * from extensions.finish();
rollback;
