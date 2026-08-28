revoke all privileges on table public.scratch_rarities from anon, authenticated;
revoke all privileges on table public.scratch_math_versions from anon, authenticated;
revoke all privileges on table public.scratch_outcomes from anon, authenticated;

grant select on table public.scratch_rarities to authenticated;
grant select on table public.scratch_math_versions to authenticated;
grant select on table public.scratch_outcomes to authenticated;
