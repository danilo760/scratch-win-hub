begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(1);

insert into auth.users (id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
('10101010-1010-4010-8010-101010101010','authenticated','authenticated','rls-a@example.invalid','{}','{"display_name":"RLS A"}',now(),now()),
('20202020-2020-4020-8020-202020202020','authenticated','authenticated','rls-b@example.invalid','{}','{"display_name":"RLS B"}',now(),now());

insert into public.scratchcards(id,title,price,active)
values ('30303030-3030-4030-8030-303030303030','RLS fixture',1,true);
insert into public.scratch_math_versions(id,scratchcard_id,rarity_id,version_name,status)
select '40404040-4040-4040-8040-404040404040','30303030-3030-4030-8030-303030303030',id,'RLS fixture','DRAFT'
from public.scratch_rarities where slug='bronze';
insert into public.mystery_versions(id,name,status)
values ('50505050-5050-4050-8050-505050505050','RLS fixture','DRAFT');
insert into public.store_items(id,title,points_cost,stock,stock_total,stock_available,per_user_limit,active)
values ('60606060-6060-4060-8060-606060606060','RLS fixture',1,10,10,10,10,true);
insert into public.achievements(id,slug,name,description,icon,criteria,active)
values ('70707070-7070-4070-8070-707070707070','rls-fixture','RLS fixture','RLS fixture','shield','{}',true);

insert into public.plays(id,user_id,card_id,price,prize,points_earned,math_version_id,client_request_id,source)
values
('11111111-aaaa-4111-8111-111111111111','10101010-1010-4010-8010-101010101010','30303030-3030-4030-8030-303030303030',1,0,1,'40404040-4040-4040-8040-404040404040','11111111-bbbb-4111-8111-111111111111','rls'),
('22222222-aaaa-4222-8222-222222222222','20202020-2020-4020-8020-202020202020','30303030-3030-4030-8030-303030303030',1,0,1,'40404040-4040-4040-8040-404040404040','22222222-bbbb-4222-8222-222222222222','rls');
insert into public.credit_ledger(user_id,amount,balance_before,balance_after,transaction_type,reference_type,reference_id)
values
('10101010-1010-4010-8010-101010101010',-1,10,9,'SCRATCH_COST','play','11111111-aaaa-4111-8111-111111111111'),
('20202020-2020-4020-8020-202020202020',-1,10,9,'SCRATCH_COST','play','22222222-aaaa-4222-8222-222222222222');
insert into public.points_ledger(user_id,amount,balance_before,balance_after,transaction_type,reference_type,reference_id)
values
('10101010-1010-4010-8010-101010101010',1,0,1,'SCRATCH_REWARD','play','11111111-aaaa-4111-8111-111111111111'),
('20202020-2020-4020-8020-202020202020',1,0,1,'SCRATCH_REWARD','play','22222222-aaaa-4222-8222-222222222222');
insert into public.daily_scratch_claims(user_id,claim_date,scratch_play_id)
values
('10101010-1010-4010-8010-101010101010',date '2099-01-01','11111111-aaaa-4111-8111-111111111111'),
('20202020-2020-4020-8020-202020202020',date '2099-01-01','22222222-aaaa-4222-8222-222222222222');
insert into public.mystery_openings(user_id,client_request_id,mystery_version_id,scratchcard_id,math_version_id)
values
('10101010-1010-4010-8010-101010101010','11111111-cccc-4111-8111-111111111111','50505050-5050-4050-8050-505050505050','30303030-3030-4030-8030-303030303030','40404040-4040-4040-8040-404040404040'),
('20202020-2020-4020-8020-202020202020','22222222-cccc-4222-8222-222222222222','50505050-5050-4050-8050-505050505050','30303030-3030-4030-8030-303030303030','40404040-4040-4040-8040-404040404040');
insert into public.redemptions(user_id,item_id,points_spent,client_request_id,status,protocol)
values
('10101010-1010-4010-8010-101010101010','60606060-6060-4060-8060-606060606060',1,'11111111-dddd-4111-8111-111111111111','SOLICITADO','RLS-A'),
('20202020-2020-4020-8020-202020202020','60606060-6060-4060-8060-606060606060',1,'22222222-dddd-4222-8222-222222222222','SOLICITADO','RLS-B');
insert into public.xp_transactions(user_id,amount,source_type,source_id)
values
('10101010-1010-4010-8010-101010101010',1,'RLS_TEST','11111111-eeee-4111-8111-111111111111'),
('20202020-2020-4020-8020-202020202020',1,'RLS_TEST','22222222-eeee-4222-8222-222222222222');
insert into public.user_achievements(user_id,achievement_id)
values
('10101010-1010-4010-8010-101010101010','70707070-7070-4070-8070-707070707070'),
('20202020-2020-4020-8020-202020202020','70707070-7070-4070-8070-707070707070');

update public.profiles set profile_public=false where id='10101010-1010-4010-8010-101010101010';
set local role anon;
do $$ declare r jsonb; begin
  r := public.get_public_profile('user-10101010101040108010101010101010');
  if r is not null then raise exception 'private profile exposed by public RPC'; end if;
end $$;
reset role;

update public.profiles
set profile_public=true, show_achievements=false, show_statistics=false
where id='10101010-1010-4010-8010-101010101010';
set local role anon;
do $$ declare r jsonb; begin
  r := public.get_public_profile('user-10101010101040108010101010101010');
  if r is null then raise exception 'public profile unavailable'; end if;
  if r ? 'email' or r ? 'balance' or r ? 'points' or r ? 'is_admin' then raise exception 'public profile leaked sensitive fields'; end if;
  if r->>'display_name' <> 'RLS A' then raise exception 'public profile returned wrong subject'; end if;
end $$;
reset role;

create or replace function pg_temp.assert_owner_isolation(p_label text)
returns void
language plpgsql
as $$
declare t text; c integer;
begin
  select count(*) into c from public.profiles;
  if c <> 1 then raise exception '% profile isolation failed',p_label; end if;
  foreach t in array array['plays','credit_ledger','points_ledger','daily_scratch_claims','mystery_openings','redemptions','xp_transactions','user_achievements']
  loop
    execute format('select count(*) from public.%I',t) into c;
    if c <> 1 then raise exception '% isolation failed for %',p_label,t; end if;
  end loop;
end;
$$;

select set_config('request.jwt.claims','{"sub":"10101010-1010-4010-8010-101010101010","role":"authenticated"}',true);
set local role authenticated;
select pg_temp.assert_owner_isolation('A');
do $$ begin
  begin
    perform public.get_admin_operations_v1();
    raise exception 'regular user reached admin RPC';
  exception when others then
    if sqlerrm='regular user reached admin RPC' then raise; end if;
    if position('Sem permissão' in sqlerrm)=0 then raise exception 'unexpected admin denial: %',sqlerrm; end if;
  end;
end $$;
reset role;

select set_config('request.jwt.claims','{"sub":"20202020-2020-4020-8020-202020202020","role":"authenticated"}',true);
set local role authenticated;
select pg_temp.assert_owner_isolation('B');
reset role;

select extensions.pass('USER_A and USER_B remain isolated, public profiles respect privacy, and regular users cannot call admin RPCs');
select * from extensions.finish();
rollback;
