begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(1);

insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
('41414141-4141-4141-8141-414141414141','authenticated','authenticated','special-regular@example.invalid','{}','{"display_name":"Special Regular"}',now(),now()),
('42424242-4242-4242-8242-424242424242','authenticated','authenticated','special-admin@example.invalid','{}','{"display_name":"Special Admin"}',now(),now());

update public.profiles set admin_role='admin_master' where id='42424242-4242-4242-8242-424242424242';

insert into public.scratchcards(id,title,price,active,is_daily_eligible)
values
('43434343-4343-4343-8343-434343434343','Special A',1,true,false),
('44444444-4444-4444-8444-444444444444','Special B',1,true,false);

insert into public.scratch_math_versions(id,scratchcard_id,rarity_id,version_name,status)
select '45454545-4545-4545-8545-454545454545','43434343-4343-4343-8343-434343434343',id,'Special A V1','DRAFT'
from public.scratch_rarities where slug='bronze';

insert into public.scratch_math_versions(id,scratchcard_id,rarity_id,version_name,status)
select '46464646-4646-4646-8646-464646464646','44444444-4444-4444-8444-444444444444',id,'Special B V1','DRAFT'
from public.scratch_rarities where slug='prata';

insert into public.scratch_outcomes(id,math_version_id,name,prize,points,weight)
values
('47474747-4747-4747-8747-474747474747','45454545-4545-4545-8545-454545454545','A1',0,1,0.5),
('48484848-4848-4848-8848-484848484848','45454545-4545-4545-8545-454545454545','A2',0,2,0.5),
('49494949-4949-4949-8949-494949494949','46464646-4646-4646-8646-464646464646','B1',0,3,1);

update public.scratch_math_versions set status='PUBLISHED'
where id in ('45454545-4545-4545-8545-454545454545','46464646-4646-4646-8646-464646464646');

select set_config('request.jwt.claims','{"sub":"42424242-4242-4242-8242-424242424242","role":"authenticated"}',true);
set local role authenticated;

select public.admin_set_daily_scratch_v1('43434343-4343-4343-8343-434343434343');

create temporary table special_ids(pool1 uuid, pool2 uuid, entry1 uuid) on commit drop;

do $$
declare
  p1 uuid;
  e1 uuid;
begin
  p1 := public.admin_create_mystery_draft_v1('SPECIAL POOL V1');
  e1 := public.admin_add_mystery_entry_v1(p1,'43434343-4343-4343-8343-434343434343',0.5);
  perform public.admin_add_mystery_entry_v1(p1,'44444444-4444-4444-8444-444444444444',0.5);
  perform public.admin_publish_mystery_v1(p1);
  insert into special_ids(pool1,entry1) values(p1,e1);
end $$;

reset role;

select set_config('request.jwt.claims','{"sub":"41414141-4141-4141-8141-414141414141","role":"authenticated"}',true);
set local role authenticated;

do $$
declare
  s jsonb;
  first_daily jsonb;
  retry_daily jsonb;
  first_mystery jsonb;
  retry_mystery jsonb;
  req uuid := '50505050-5050-4050-8050-505050505050';
  i integer;
  distinct_cards integer;
begin
  s := public.get_special_scratch_status_v1();
  if s->>'daily_configured' <> 'true'
     or s->>'daily_available' <> 'true'
     or s->>'daily_claimed_today' <> 'false'
     or s->>'mystery_available' <> 'true' then
    raise exception 'initial special status invalid: %',s;
  end if;

  first_daily := public.claim_daily_scratch_v2('51515151-5151-4151-8151-515151515151');
  if first_daily->>'already_claimed' <> 'false'
     or first_daily->>'card_id' <> '43434343-4343-4343-8343-434343434343'
     or first_daily->>'rarity_slug' <> 'bronze'
     or first_daily->>'card_title' <> 'Special A' then
    raise exception 'first daily response invalid: %',first_daily;
  end if;

  s := public.get_special_scratch_status_v1();
  if s->>'daily_configured' <> 'true'
     or s->>'daily_available' <> 'false'
     or s->>'daily_claimed_today' <> 'true' then
    raise exception 'post-claim daily status invalid: %',s;
  end if;

  retry_daily := public.claim_daily_scratch_v2('52525252-5252-4252-8252-525252525252');
  if retry_daily->>'id' <> first_daily->>'id'
     or retry_daily->>'already_claimed' <> 'true'
     or retry_daily->>'rarity_slug' <> 'bronze' then
    raise exception 'daily idempotent response invalid: % / %',first_daily,retry_daily;
  end if;

  first_mystery := public.open_mystery_scratch_v1(req);
  retry_mystery := public.open_mystery_scratch_v1(req);
  if first_mystery->>'id' <> retry_mystery->>'id'
     or first_mystery->>'idempotent' <> 'false'
     or retry_mystery->>'idempotent' <> 'true' then
    raise exception 'mystery retry contract invalid: % / %',first_mystery,retry_mystery;
  end if;

  perform setseed(0.5);
  for i in 1..40 loop
    perform public.open_mystery_scratch_v1(gen_random_uuid());
  end loop;

  select count(distinct scratchcard_id)
  into distinct_cards
  from public.mystery_openings
  where user_id='41414141-4141-4141-8141-414141414141';

  if distinct_cards <> 2 then
    raise exception 'fractional mystery weights did not reach both cards: %',distinct_cards;
  end if;
end $$;

reset role;

select set_config('request.jwt.claims','{"sub":"41414141-4141-4141-8141-414141414141","role":"authenticated"}',true);
set local role authenticated;
do $$
begin
  begin
    perform public.admin_create_mystery_draft_v1('FORBIDDEN');
    raise exception 'regular user created mystery draft';
  exception when others then
    if sqlerrm='regular user created mystery draft' then raise; end if;
    if position('Sem permissão' in sqlerrm)=0 then
      raise exception 'unexpected non-admin mystery error: %',sqlerrm;
    end if;
  end;
end $$;
reset role;

select set_config('request.jwt.claims','{"sub":"42424242-4242-4242-8242-424242424242","role":"authenticated"}',true);
set local role authenticated;

do $$
declare
  p2 uuid;
begin
  p2 := public.admin_create_mystery_draft_v1('SPECIAL POOL V2');
  perform public.admin_add_mystery_entry_v1(p2,'43434343-4343-4343-8343-434343434343',1);
  perform public.admin_publish_mystery_v1(p2);
  update special_ids set pool2=p2;
  perform public.admin_clear_daily_scratch_v1();
end $$;

reset role;

do $$
declare
  p1 uuid;
  p2 uuid;
  e1 uuid;
  published_count integer;
begin
  select pool1,pool2,entry1 into p1,p2,e1 from special_ids limit 1;

  if not exists(select 1 from public.mystery_versions where id=p1 and status='RETIRED') then
    raise exception 'previous mystery pool was not retired';
  end if;
  if not exists(select 1 from public.mystery_versions where id=p2 and status='PUBLISHED') then
    raise exception 'new mystery pool was not published';
  end if;
  select count(*) into published_count from public.mystery_versions where status='PUBLISHED';
  if published_count <> 1 then raise exception 'expected one published mystery pool, got %',published_count; end if;

  begin
    update public.mystery_versions set name='TAMPER' where id=p1;
    raise exception 'retired mystery version was editable';
  exception when others then
    if sqlerrm='retired mystery version was editable' then raise; end if;
    if position('aposentada' in lower(sqlerrm))=0 then raise exception 'unexpected retired version error: %',sqlerrm; end if;
  end;

  begin
    update public.mystery_version_entries set weight=99 where id=e1;
    raise exception 'retired mystery entry was editable';
  exception when others then
    if sqlerrm='retired mystery entry was editable' then raise; end if;
    if position('aposentada' in lower(sqlerrm))=0 then raise exception 'unexpected retired entry error: %',sqlerrm; end if;
  end;
end $$;

select set_config('request.jwt.claims','{"sub":"41414141-4141-4141-8141-414141414141","role":"authenticated"}',true);
set local role authenticated;
do $$
declare s jsonb;
begin
  s := public.get_special_scratch_status_v1();
  if s->>'daily_configured' <> 'false'
     or s->>'daily_available' <> 'false'
     or s->>'daily_claimed_today' <> 'true'
     or s->>'mystery_available' <> 'true' then
    raise exception 'final special status invalid: %',s;
  end if;
end $$;
reset role;

select extensions.pass('daily and mystery contracts enforce server selection, Sao Paulo daily state, idempotency, fractional weights, single published pool, retirement immutability, and admin-master authorization');
select * from extensions.finish();
rollback;