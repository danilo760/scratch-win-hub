-- Optimize ownership checks and remove direct admin table mutation paths now that
-- administration is performed exclusively through audited RPCs.

drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
on public.profiles
for select
to authenticated
using ((select auth.uid()) = id);

drop policy if exists "Users can view own plays" on public.plays;
create policy "Users can view own plays"
on public.plays
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can view own redemptions" on public.redemptions;
drop policy if exists "admins read redemption data" on public.redemptions;
create policy "Users can view own redemptions"
on public.redemptions
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Anyone authenticated can view active scratchcards" on public.scratchcards;
drop policy if exists "Admins manage scratchcards insert" on public.scratchcards;
drop policy if exists "Admins manage scratchcards update" on public.scratchcards;
drop policy if exists "Admins manage scratchcards delete" on public.scratchcards;
create policy "Authenticated users can view active scratchcards"
on public.scratchcards
for select
to authenticated
using (active = true);

drop policy if exists "Anyone authenticated can view active store items" on public.store_items;
drop policy if exists "Admins manage store items insert" on public.store_items;
drop policy if exists "Admins manage store items update" on public.store_items;
drop policy if exists "Admins manage store items delete" on public.store_items;
create policy "Authenticated users can view active store items"
on public.store_items
for select
to authenticated
using (active = true);

-- Cover operational foreign keys used by history, admin/audit and mystery/math joins.
create index if not exists idx_admin_audit_logs_actor_id
  on public.admin_audit_logs(actor_id);
create index if not exists idx_audit_logs_admin_id
  on public.audit_logs(admin_id);
create index if not exists idx_daily_scratch_claims_scratch_play_id
  on public.daily_scratch_claims(scratch_play_id);
create index if not exists idx_mystery_openings_math_version_id
  on public.mystery_openings(math_version_id);
create index if not exists idx_mystery_openings_mystery_version_id
  on public.mystery_openings(mystery_version_id);
create index if not exists idx_mystery_openings_scratchcard_id
  on public.mystery_openings(scratchcard_id);
create index if not exists idx_mystery_version_entries_scratchcard_id
  on public.mystery_version_entries(scratchcard_id);
create index if not exists idx_mystery_versions_published_by
  on public.mystery_versions(published_by);
create index if not exists idx_plays_math_version_id
  on public.plays(math_version_id);
create index if not exists idx_plays_outcome_id
  on public.plays(outcome_id);
create index if not exists idx_scratch_math_versions_published_by
  on public.scratch_math_versions(published_by);
create index if not exists idx_scratch_math_versions_rarity_id
  on public.scratch_math_versions(rarity_id);
create index if not exists idx_user_achievements_achievement_id
  on public.user_achievements(achievement_id);