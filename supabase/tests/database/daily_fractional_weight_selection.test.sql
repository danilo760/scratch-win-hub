begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(1);

insert into public.scratchcards(id,title,price,active,is_daily_eligible)
values ('73737373-7373-4373-8373-737373737373','Daily fractional fixture',0,true,true);

insert into public.scratch_math_versions(id,scratchcard_id,rarity_id,version_name,status)
select
  '74747474-7474-4474-8474-747474747474',
  '73737373-7373-4373-8373-737373737373',
  id,
  'Daily fractional V1',
  'DRAFT'
from public.scratch_rarities
where slug='bronze';

insert into public.scratch_outcomes(id,math_version_id,name,prize,points,weight)
values
  ('75757575-7575-4575-8575-757575757575','74747474-7474-4474-8474-747474747474','Daily Fraction A',0,1,0.5),
  ('76767676-7676-4676-8676-767676767676','74747474-7474-4474-8474-747474747474','Daily Fraction B',0,2,0.5);

update public.scratch_math_versions
set status='PUBLISHED'
where id='74747474-7474-4474-8474-747474747474';

do $$
declare
  i integer;
  uid uuid;
  claims jsonb;
  seen_a boolean;
  seen_b boolean;
begin
  perform setseed(0.314159);

  for i in 1..50 loop
    uid := gen_random_uuid();
    insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
    values(
      uid,
      'authenticated',
      'authenticated',
      format('daily-fraction-%s@example.invalid',uid),
      '{}',
      jsonb_build_object('display_name',format('Daily Fraction %s',i)),
      now(),
      now()
    );

    perform set_config(
      'request.jwt.claims',
      jsonb_build_object('sub',uid::text,'role','authenticated')::text,
      true
    );

    claims := public.claim_daily_scratch_v2(gen_random_uuid());
    if claims->>'card_id' <> '73737373-7373-4373-8373-737373737373'
       or claims->>'rarity_slug' <> 'bronze'
       or claims->>'already_claimed' <> 'false' then
      raise exception 'unexpected fractional daily response: %',claims;
    end if;
  end loop;

  select exists(
    select 1 from public.plays
    where card_id='73737373-7373-4373-8373-737373737373'
      and outcome_id='75757575-7575-4575-8575-757575757575'
      and source='daily'
  ) into seen_a;

  select exists(
    select 1 from public.plays
    where card_id='73737373-7373-4373-8373-737373737373'
      and outcome_id='76767676-7676-4676-8676-767676767676'
      and source='daily'
  ) into seen_b;

  if not seen_a or not seen_b then
    raise exception 'fractional daily outcomes were not both reachable';
  end if;
end $$;

select extensions.pass('daily scratch continuous NUMERIC selection keeps both 0.5/0.5 outcomes reachable');
select * from extensions.finish();
rollback;
