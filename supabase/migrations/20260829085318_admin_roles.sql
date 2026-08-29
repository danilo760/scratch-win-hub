-- Administrative roles: preserve existing administrators while adding one
-- tightly controlled master role for access-management operations.
alter table public.profiles
  add column if not exists admin_role text not null default 'user'
  check (admin_role in ('user', 'admin', 'admin_master'));

update public.profiles
set admin_role = case when is_admin then 'admin' else 'user' end
where admin_role = 'user';

create or replace function public.is_admin(_user_id uuid)
returns boolean
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  return auth.uid() is not null
    and auth.uid() = _user_id
    and exists (
      select 1 from public.profiles
      where id = _user_id and admin_role in ('admin', 'admin_master')
    );
end;
$$;

create or replace function public.is_admin_master(_user_id uuid)
returns boolean
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  return auth.uid() is not null
    and auth.uid() = _user_id
    and exists (
      select 1 from public.profiles
      where id = _user_id and admin_role = 'admin_master'
    );
end;
$$;

create or replace function public.admin_set_user_role_v1(
  p_user_id uuid,
  p_role text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_previous text;
  v_masters integer;
begin
  if v_actor is null or not public.is_admin_master(v_actor) then
    raise exception 'Sem permissão de admin master';
  end if;
  if p_role not in ('user', 'admin', 'admin_master') then
    raise exception 'Papel administrativo inválido';
  end if;
  select admin_role into v_previous from public.profiles where id = p_user_id for update;
  if not found then raise exception 'Usuário não encontrado'; end if;
  if v_previous = 'admin_master' and p_role <> 'admin_master' then
    select count(*) into v_masters from public.profiles where admin_role = 'admin_master';
    if v_masters <= 1 then raise exception 'Não é permitido remover o último admin master'; end if;
  end if;
  update public.profiles
  set admin_role = p_role, is_admin = (p_role in ('admin', 'admin_master'))
  where id = p_user_id;
  insert into public.admin_audit_logs(actor_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'user.role_changed',
    'profile',
    p_user_id,
    jsonb_build_object('previous_role', v_previous, 'new_role', p_role)
  );
  return jsonb_build_object('user_id', p_user_id, 'admin_role', p_role);
end;
$$;

revoke all on function public.is_admin(uuid) from public, anon;
grant execute on function public.is_admin(uuid) to authenticated, service_role;
revoke all on function public.is_admin_master(uuid) from public, anon;
grant execute on function public.is_admin_master(uuid) to authenticated, service_role;
revoke all on function public.admin_set_user_role_v1(uuid, text) from public, anon;
grant execute on function public.admin_set_user_role_v1(uuid, text) to authenticated;
