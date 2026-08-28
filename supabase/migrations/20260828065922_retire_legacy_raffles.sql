update public.raffles
set status = 'closed',
    closed_at = coalesce(closed_at, now())
where status = 'active';

revoke all on table public.raffles from anon, authenticated;
grant select on table public.raffles to authenticated;

revoke all on table public.raffle_tickets from anon, authenticated;
grant select on table public.raffle_tickets to authenticated;

drop policy if exists "active raffles are public" on public.raffles;
drop policy if exists "raffles_admin_insert" on public.raffles;
drop policy if exists "legacy raffles admin read" on public.raffles;
create policy "legacy raffles admin read"
on public.raffles
for select
to authenticated
using (public.is_admin((select auth.uid())));

revoke all on function public.buy_raffle_tickets(uuid, integer) from public, anon, authenticated;
grant execute on function public.buy_raffle_tickets(uuid, integer) to service_role;
