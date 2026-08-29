begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(1);

insert into auth.users(
  id,
  aud,
  role,
  email,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
(
  '71717171-7171-4171-8171-717171717171',
  'authenticated',
  'authenticated',
  'mystery-pinned-regular@example.invalid',
  '{}',
  '{"display_name":"Mystery Pinned Regular"}',
  now(),
  now()
),
(
  '72727272-7272-4272-8272-727272727272',
  'authenticated',
  'authenticated',
  'mystery-pinned-admin@example.invalid',
  '{}',
  '{"display_name":"Mystery Pinned Admin"}',
  now(),
  now()
);

update public.profiles
set balance = 100
where id = '71717171-7171-4171-8171-717171717171';

update public.profiles
set admin_role = 'admin_master'
where id = '72727272-7272-4272-8272-727272727272';

insert into public.scratchcards(
  id,
  title,
  price,
  active,
  is_daily_eligible
)
values(
  '73737373-7373-4373-8373-737373737373',
  'Mystery Pinned Card',
  1,
  true,
  false
);

insert into public.scratch_math_versions(
  id,
  scratchcard_id,
  rarity_id,
  version_name,
  status
)
select
  '74747474-7474-4474-8474-747474747474',
  '73737373-7373-4373-8373-737373737373',
  id,
  'Mystery Pinned V1',
  'DRAFT'
from public.scratch_rarities
where slug = 'bronze';

insert into public.scratch_outcomes(
  id,
  math_version_id,
  name,
  prize,
  points,
  weight
)
values(
  '75757575-7575-4575-8575-757575757575',
  '74747474-7474-4474-8474-747474747474',
  'Pinned V1 Outcome',
  0,
  1,
  1
);

select set_config(
  'request.jwt.claims',
  '{"sub":"72727272-7272-4272-8272-727272727272","role":"authenticated"}',
  true
);
set local role authenticated;

select public.publish_math_version_v1('74747474-7474-4474-8474-747474747474');

create temporary table mystery_pinned_ids(
  pool_id uuid,
  opening jsonb,
  v2_id uuid
) on commit drop;

do $$
declare
  v_pool uuid;
begin
  v_pool := public.admin_create_mystery_draft_v1('MYSTERY PINNED POOL');
  perform public.admin_add_mystery_entry_v1(
    v_pool,
    '73737373-7373-4373-8373-737373737373',
    1
  );
  perform public.admin_publish_mystery_v1(v_pool);
  insert into mystery_pinned_ids(pool_id) values(v_pool);
end $$;

reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"71717171-7171-4171-8171-717171717171","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_opening jsonb;
begin
  v_opening := public.open_mystery_scratch_v1(
    '76767676-7676-4676-8676-767676767676'
  );

  if v_opening->>'scratchcard_id' <> '73737373-7373-4373-8373-737373737373'
     or v_opening->>'math_version_id' <> '74747474-7474-4474-8474-747474747474' then
    raise exception 'Mystery opening did not pin V1: %', v_opening;
  end if;

  update mystery_pinned_ids set opening = v_opening;
end $$;

reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"72727272-7272-4272-8272-727272727272","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v2 uuid;
begin
  v2 := public.create_math_draft_v1(
    '73737373-7373-4373-8373-737373737373',
    'Mystery Pinned V2',
    'bronze'
  );

  perform public.add_math_outcome_v1(
    v2,
    'V2 Only Outcome',
    0,
    99,
    1
  );
  perform public.publish_math_version_v1(v2);
  update mystery_pinned_ids set v2_id = v2;
end $$;

reset role;

do $$
declare
  v2 uuid;
begin
  select v2_id
  into v2
  from mystery_pinned_ids
  limit 1;

  if not exists(
    select 1
    from public.scratch_math_versions
    where id = '74747474-7474-4474-8474-747474747474'
      and status = 'RETIRED'
  ) then
    raise exception 'Pinned V1 should be RETIRED after V2 publication';
  end if;

  if not exists(
    select 1
    from public.scratch_math_versions
    where id = v2
      and status = 'PUBLISHED'
  ) then
    raise exception 'V2 should be PUBLISHED before settlement';
  end if;
end $$;

select set_config(
  'request.jwt.claims',
  '{"sub":"71717171-7171-4171-8171-717171717171","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_opening jsonb;
  v_first jsonb;
  v_retry jsonb;
  v_play_id uuid;
begin
  select opening
  into v_opening
  from mystery_pinned_ids
  limit 1;

  v_first := public.play_mystery_scratch_v1(
    '76767676-7676-4676-8676-767676767676'
  );
  v_retry := public.play_mystery_scratch_v1(
    '76767676-7676-4676-8676-767676767676'
  );
  v_play_id := (v_first->>'id')::uuid;

  if v_first->>'math_version_id' <> v_opening->>'math_version_id'
     or v_first->>'math_version_id' <> '74747474-7474-4474-8474-747474747474'
     or v_first->>'points_earned' <> '1'
     or v_first->>'idempotent' <> 'false'
     or v_retry->>'id' <> v_first->>'id'
     or v_retry->>'idempotent' <> 'true' then
    raise exception 'Pinned Mystery settlement invalid: opening %, first %, retry %',
      v_opening,
      v_first,
      v_retry;
  end if;

  if (
    select count(*)
    from public.plays
    where user_id = '71717171-7171-4171-8171-717171717171'
      and client_request_id = '76767676-7676-4676-8676-767676767676'
  ) <> 1 then
    raise exception 'Mystery retry created duplicate plays';
  end if;

  if not exists(
    select 1
    from public.plays
    where id = v_play_id
      and card_id = '73737373-7373-4373-8373-737373737373'
      and math_version_id = '74747474-7474-4474-8474-747474747474'
      and source = 'mystery'
  ) then
    raise exception 'Persisted Mystery play does not match pinned opening';
  end if;

  if (
    select count(*)
    from public.credit_ledger
    where reference_type = 'play'
      and reference_id = v_play_id
      and transaction_type = 'SCRATCH_COST'
  ) <> 1 then
    raise exception 'Mystery play cost ledger is not idempotent';
  end if;

  if (
    select count(*)
    from public.points_ledger
    where reference_type = 'play'
      and reference_id = v_play_id
      and transaction_type = 'SCRATCH_REWARD'
      and amount = 1
  ) <> 1 then
    raise exception 'Mystery points ledger does not match pinned V1 outcome';
  end if;

  if (select balance from public.profiles where id = auth.uid()) <> 99 then
    raise exception 'Mystery settlement charged an unexpected balance';
  end if;

  if (select points from public.profiles where id = auth.uid()) <> 1 then
    raise exception 'Mystery settlement credited unexpected points';
  end if;
end $$;

reset role;

do $$
begin
  if has_function_privilege(
    'anon',
    'public.play_mystery_scratch_v1(uuid)',
    'EXECUTE'
  ) then
    raise exception 'anon must not execute play_mystery_scratch_v1';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.play_mystery_scratch_v1(uuid)',
    'EXECUTE'
  ) then
    raise exception 'authenticated must execute play_mystery_scratch_v1';
  end if;
end $$;

select extensions.pass(
  'Mystery settlement preserves the persisted math version across V1 retirement, is idempotent, writes ledgers once, and is restricted to authenticated users'
);
select * from extensions.finish();
rollback;
