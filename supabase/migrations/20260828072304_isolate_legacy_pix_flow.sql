drop policy if exists "users create pix requests" on public.credit_transactions;

revoke all on table public.credit_transactions from anon, authenticated;
grant select on table public.credit_transactions to authenticated;

comment on table public.credit_transactions is
'Legacy PIX request history. Public deposit creation is disabled; preserve records for audit/history until a future reconciled payment flow is approved.';
