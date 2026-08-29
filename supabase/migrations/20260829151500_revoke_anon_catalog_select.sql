-- Public catalog/profile surfaces are exposed through dedicated RPCs.
-- Anonymous clients do not need direct table reads on authenticated catalog tables.
revoke select on table public.scratchcards from anon;
revoke select on table public.achievements from anon;
