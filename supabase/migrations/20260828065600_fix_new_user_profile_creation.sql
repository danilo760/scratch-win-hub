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

  -- Deterministic and collision-safe because it encodes the full auth user UUID.
  v_public_slug := 'user-' || replace(new.id::text, '-', '');

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
