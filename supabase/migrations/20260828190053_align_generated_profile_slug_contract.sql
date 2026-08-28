create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_display_name text;
  v_public_slug text;
begin
  v_display_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Jogador'
  );

  -- Keep generated slugs inside the same 3..32 character contract enforced by
  -- update_profile_preferences. 27 UUID hex characters retain 108 bits of entropy.
  v_public_slug := 'user-' || left(replace(new.id::text, '-', ''), 27);

  insert into public.profiles (
    id,
    email,
    balance,
    points,
    display_name,
    public_slug
  )
  values (
    new.id,
    new.email,
    10.00,
    0,
    v_display_name,
    v_public_slug
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_public_slug_format_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_public_slug_format_check
      check (public_slug ~ '^[a-z0-9-]{3,32}$') not valid;
  end if;
end;
$$;

alter table public.profiles validate constraint profiles_public_slug_format_check;
