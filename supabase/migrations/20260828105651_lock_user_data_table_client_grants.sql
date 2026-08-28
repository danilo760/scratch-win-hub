revoke all privileges on table public.plays from anon, authenticated;
revoke all privileges on table public.redemptions from anon, authenticated;
revoke all privileges on table public.daily_scratch_claims from anon, authenticated;
revoke all privileges on table public.mystery_openings from anon, authenticated;
revoke all privileges on table public.xp_transactions from anon, authenticated;
revoke all privileges on table public.user_achievements from anon, authenticated;

grant select on table public.plays to authenticated;
grant select on table public.redemptions to authenticated;
grant select on table public.daily_scratch_claims to authenticated;
grant select on table public.mystery_openings to authenticated;
grant select on table public.xp_transactions to authenticated;
grant select on table public.user_achievements to authenticated;
