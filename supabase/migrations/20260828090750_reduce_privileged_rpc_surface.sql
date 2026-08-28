-- is_admin only evaluates the current authenticated user's own profile, so it
-- does not need elevated privileges. Keeping it invoker reduces privileged API surface.
alter function public.is_admin(uuid) security invoker;
revoke all on function public.is_admin(uuid) from public, anon;
grant execute on function public.is_admin(uuid) to authenticated, service_role;

-- The public client now uses claim_daily_scratch_v2(client_request_id), where
-- the server chooses the configured card. Keep v1 only for internal compatibility.
revoke execute on function public.claim_daily_scratch_v1(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_daily_scratch_v1(uuid, uuid) to service_role;

grant execute on function public.claim_daily_scratch_v2(uuid) to authenticated, service_role;