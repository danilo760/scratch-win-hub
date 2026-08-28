begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(1);

insert into auth.users (id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values (
  'abababab-abab-4bab-8bab-abababababab',
  'authenticated',
  'authenticated',
  'fractional-weights@example.invalid',
  '{}',
  '{"display_name":"Fractional Weights"}',
  now(),
  now()
);

insert into public.scratchcards(id,title,price,active)
values ('bcbcbcbc-bcbc-4cbc-8cbc-bcbcbcbcbcbc','Fractional weights fixture',0.01,true);

insert into public.scratch_math_versions(id,scratchcard_id,rarity_id,version_name,status)
select
  'cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd',
  'bcbcbcbc-bcbc-4cbc-8cbc-bcbcbcbcbcbc',
  id,
  'Fractional weights fixture',
  'DRAFT'
from public.scratch_rarities
where slug='bronze';

insert into public.scratch_outcomes(id,math_version_id,name,prize,points,weight)
values
  ('dededede-dede-4ede-8ede-dededededede','cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd','Fraction A',0,1,0.5),
  ('efefefef-efef-4fef-8fef-efefefefefef','cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd','Fraction B',0,2,0.5);

update public.scratch_math_versions
set status='PUBLISHED'
where id='cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd';

select set_config(
  'request.jwt.claims',
  '{"sub":"abababab-abab-4bab-8bab-abababababab","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  i integer;
  r jsonb;
begin
  for i in 1..40 loop
    r := public.play_scratchcard_v1(
      'bcbcbcbc-bcbc-4cbc-8cbc-bcbcbcbcbcbc',
      gen_random_uuid(),
      'fractional-test'
    );
    if r->>'result_type' <> 'points' then
      raise exception 'fractional result returned unexpected contract: %', r;
    end if;
  end loop;
end $$;

reset role;

do $$
declare
  seen_a boolean;
  seen_b boolean;
begin
  select exists(
    select 1 from public.plays
    where user_id='abababab-abab-4bab-8bab-abababababab'
      and outcome_id='dededede-dede-4ede-8ede-dededededede'
  ) into seen_a;

  select exists(
    select 1 from public.plays
    where user_id='abababab-abab-4bab-8bab-abababababab'
      and outcome_id='efefefef-efef-4fef-8fef-efefefefefef'
  ) into seen_b;

  if not seen_a or not seen_b then
    raise exception 'fractional weights were not both reachable';
  end if;
end $$;

select extensions.pass('fractional NUMERIC scratch weights remain reachable and preserve the points result contract');
select * from extensions.finish();
rollback;
