-- Defense in depth: these tables are read through RLS or mutated only by protected RPCs.
-- Keep direct client access read-only and remove table-level mutation capabilities.

revoke insert, update, delete, truncate, references, trigger
on table public.achievements
from anon, authenticated;

revoke insert, update, delete, truncate, references, trigger
on table public.admin_audit_logs
from anon, authenticated;

revoke insert, update, delete, truncate, references, trigger
on table public.audit_logs
from anon, authenticated;

revoke insert, update, delete, truncate, references, trigger
on table public.scratchcards
from anon, authenticated;
