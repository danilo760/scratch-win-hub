revoke all privileges on table public.credit_ledger from anon, authenticated;
revoke all privileges on table public.points_ledger from anon, authenticated;

grant select on table public.credit_ledger to authenticated;
grant select on table public.points_ledger to authenticated;
