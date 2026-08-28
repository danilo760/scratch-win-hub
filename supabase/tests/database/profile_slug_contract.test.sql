begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(4);

insert into auth.users (
  id,
  aud,
  role,
  email,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values (
  '91919191-9191-4191-8191-919191919191',
  'authenticated',
  'authenticated',
  'profile-slug-contract@example.invalid',
  '{}',
  '{"display_name":"Profile Contract"}',
  now(),
  now()
);

select extensions.is(
  (select length(public_slug)::int from public.profiles where id='91919191-9191-4191-8191-919191919191'),
  32,
  'generated public slug fits the 32 character profile contract'
);

select extensions.ok(
  (select public_slug ~ '^[a-z0-9-]{3,32}$' from public.profiles where id='91919191-9191-4191-8191-919191919191'),
  'generated public slug matches the editable slug format'
);

select extensions.ok(
  exists (
    select 1
    from pg_constraint
    where conname='profiles_public_slug_format_check'
      and conrelid='public.profiles'::regclass
      and convalidated
  ),
  'profile slug format is enforced by a validated database check constraint'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"91919191-9191-4191-8191-919191919191","role":"authenticated"}',
  true
);
set local role authenticated;
do $$
declare
  v_slug text;
begin
  select public_slug into v_slug
  from public.profiles
  where id='91919191-9191-4191-8191-919191919191';

  perform public.update_profile_preferences(
    'Profile Contract',
    v_slug,
    '',
    true,
    true,
    true
  );
end;
$$;
reset role;

select extensions.pass('a freshly generated slug can be saved through update_profile_preferences unchanged');
select * from extensions.finish();
rollback;
