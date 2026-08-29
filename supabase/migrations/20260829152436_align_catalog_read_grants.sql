-- Public catalog/profile surfaces are exposed through dedicated RPCs.
-- Anonymous clients do not need direct scratchcard table reads.
revoke select on table public.scratchcards from anon;

-- Achievement definitions are consumed through protected/public RPCs, not direct client reads.
-- Keep production aligned with the migration-rebuilt schema, where authenticated has no table SELECT.
revoke select on table public.achievements from anon, authenticated;
