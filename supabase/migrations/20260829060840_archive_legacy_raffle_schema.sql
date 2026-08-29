set lock_timeout = '5s';
set statement_timeout = '30s';

create schema if not exists legacy_archive authorization postgres;

revoke all on schema legacy_archive from public, anon, authenticated, service_role;

-- The raffle module is no longer part of the active product. Preserve its
-- historical rows, but remove the callable write path before moving the data
-- out of the exposed public schema.
drop function if exists public.buy_raffle_tickets(uuid, integer);

do $$
begin
  if to_regclass('public.raffle_tickets') is not null then
    alter table public.raffle_tickets set schema legacy_archive;
  end if;

  if to_regclass('public.raffles') is not null then
    alter table public.raffles set schema legacy_archive;
  end if;
end;
$$;

revoke all on table legacy_archive.raffles from public, anon, authenticated, service_role;
revoke all on table legacy_archive.raffle_tickets from public, anon, authenticated, service_role;

alter table legacy_archive.raffles enable row level security;
alter table legacy_archive.raffle_tickets enable row level security;

comment on schema legacy_archive is
  'Private archive for retired product data. Not exposed to anon/authenticated/service_role.';
comment on table legacy_archive.raffles is
  'Retired raffle campaigns preserved for historical/audit reference only.';
comment on table legacy_archive.raffle_tickets is
  'Retired raffle tickets preserved for historical/audit reference only.';
