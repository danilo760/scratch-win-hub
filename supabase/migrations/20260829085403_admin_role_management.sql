-- Only admin masters may enumerate or change administrative roles. The UI is
-- a convenience layer; this function remains the authorization boundary.
create or replace function public.get_admin_roles_v1()
returns table (
  user_id uuid,
  admin_role text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null or not public.is_admin_master(v_actor) then
    raise exception 'Sem permissão de admin master';
  end if;

  return query
  select p.id, p.admin_role
  from public.profiles p
  order by p.created_at desc;
end;
$$;

revoke all on function public.get_admin_roles_v1() from public, anon;
grant execute on function public.get_admin_roles_v1() to authenticated;
