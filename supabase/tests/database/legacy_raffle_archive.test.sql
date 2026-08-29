begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(1);

do $$
declare
  v_public_fn regprocedure;
  v_raffles_rls boolean;
  v_tickets_rls boolean;
begin
  if to_regclass('public.raffles') is not null then
    raise exception 'public.raffles must not remain in the exposed public schema';
  end if;

  if to_regclass('public.raffle_tickets') is not null then
    raise exception 'public.raffle_tickets must not remain in the exposed public schema';
  end if;

  if to_regclass('legacy_archive.raffles') is null
     or to_regclass('legacy_archive.raffle_tickets') is null then
    raise exception 'legacy raffle tables were not preserved in legacy_archive';
  end if;

  if (select count(*) from legacy_archive.raffles) <> 2 then
    raise exception 'expected the two seeded legacy raffle campaigns to be preserved';
  end if;

  if (select count(*) from legacy_archive.raffle_tickets) <> 0 then
    raise exception 'unexpected legacy raffle tickets in clean migration state';
  end if;

  select to_regprocedure('public.buy_raffle_tickets(uuid,integer)') into v_public_fn;
  if v_public_fn is not null then
    raise exception 'retired buy_raffle_tickets RPC must not remain callable';
  end if;

  if has_schema_privilege('anon', 'legacy_archive', 'USAGE')
     or has_schema_privilege('authenticated', 'legacy_archive', 'USAGE')
     or has_schema_privilege('service_role', 'legacy_archive', 'USAGE') then
    raise exception 'API roles must not have USAGE on legacy_archive';
  end if;

  if has_table_privilege('anon', 'legacy_archive.raffles', 'SELECT')
     or has_table_privilege('authenticated', 'legacy_archive.raffles', 'SELECT')
     or has_table_privilege('service_role', 'legacy_archive.raffles', 'SELECT')
     or has_table_privilege('anon', 'legacy_archive.raffle_tickets', 'SELECT')
     or has_table_privilege('authenticated', 'legacy_archive.raffle_tickets', 'SELECT')
     or has_table_privilege('service_role', 'legacy_archive.raffle_tickets', 'SELECT') then
    raise exception 'API roles must not have direct read privileges on archived raffle tables';
  end if;

  select relrowsecurity into v_raffles_rls
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='legacy_archive' and c.relname='raffles';

  select relrowsecurity into v_tickets_rls
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='legacy_archive' and c.relname='raffle_tickets';

  if v_raffles_rls is not true or v_tickets_rls is not true then
    raise exception 'RLS must remain enabled on archived raffle tables';
  end if;

  if not exists (
    select 1
    from pg_constraint con
    join pg_class c on c.oid=con.conrelid
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='legacy_archive'
      and c.relname='raffle_tickets'
      and con.contype='f'
      and con.confrelid='legacy_archive.raffles'::regclass
  ) then
    raise exception 'raffle_tickets -> raffles foreign key was not preserved';
  end if;
end $$;

select extensions.pass(
  'Legacy raffle data is preserved in a private archive, removed from public Data API paths, and its retired purchase RPC is gone'
);
select * from extensions.finish();
rollback;
