-- Audit history is exposed to administrators through protected SECURITY DEFINER RPCs.
-- Client roles do not need direct table reads; keep the table surface closed.
revoke select on table public.audit_logs from anon, authenticated;
revoke select on table public.admin_audit_logs from anon, authenticated;
