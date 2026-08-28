drop policy if exists "Users can update own profile" on public.profiles;
revoke update on public.profiles from authenticated;
create or replace function public.update_profile_preferences(p_display_name text,p_public_slug text,p_avatar_url text,p_profile_public boolean,p_show_achievements boolean,p_show_statistics boolean) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_user uuid:=auth.uid(); v_slug text:=lower(trim(p_public_slug));
begin
 if v_user is null then raise exception 'Não autenticado'; end if;
 if char_length(trim(p_display_name)) not between 2 and 40 then raise exception 'Nome público deve ter entre 2 e 40 caracteres'; end if;
 if v_slug !~ '^[a-z0-9-]{3,32}$' then raise exception 'Slug inválido'; end if;
 if exists(select 1 from profiles where public_slug=v_slug and id<>v_user) then raise exception 'Este link público já está em uso'; end if;
 update profiles set display_name=trim(p_display_name),public_slug=v_slug,avatar_url=nullif(trim(coalesce(p_avatar_url,'')),''),profile_public=p_profile_public,show_achievements=p_show_achievements,show_statistics=p_show_statistics where id=v_user;
 return jsonb_build_object('public_slug',v_slug);
end; $$;
revoke all on function public.update_profile_preferences(text,text,text,boolean,boolean,boolean) from public,anon;
grant execute on function public.update_profile_preferences(text,text,text,boolean,boolean,boolean) to authenticated;
