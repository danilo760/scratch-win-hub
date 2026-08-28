begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(1);

-- Disposable users. The auth trigger must create complete profiles.
insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
('11111111-1111-4111-8111-111111111111','authenticated','authenticated','phase15-a@example.invalid','{}','{"display_name":"Usuário A"}',now(),now()),
('22222222-2222-4222-8222-222222222222','authenticated','authenticated','phase15-b@example.invalid','{}','{"display_name":"Usuário B"}',now(),now()),
('33333333-3333-4333-8333-333333333333','authenticated','authenticated','phase15-admin@example.invalid','{}','{"display_name":"Admin Teste"}',now(),now());
update public.profiles set is_admin=true where id='33333333-3333-4333-8333-333333333333';

-- Deterministic card: every result is +5 points, no credits.
insert into public.scratchcards (id,title,price,active,is_daily_eligible)
values ('44444444-4444-4444-8444-444444444444','PHASE15 Deterministic',1,true,true);
insert into public.scratch_math_versions (id,scratchcard_id,version_name,status,rarity_id)
select '55555555-5555-4555-8555-555555555555','44444444-4444-4444-8444-444444444444','PHASE15 v1','DRAFT',id
from public.scratch_rarities where slug='bronze';
insert into public.scratch_outcomes (id,math_version_id,name,prize,points,weight)
values ('66666666-6666-4666-8666-666666666666','55555555-5555-4555-8555-555555555555','PHASE15 +5 pontos',0,5,1);
update public.scratch_math_versions set status='PUBLISHED' where id='55555555-5555-4555-8555-555555555555';

insert into public.store_items (
  id,title,description,points_cost,stock,stock_total,stock_available,per_user_limit,active,display_order
) values (
  '77777777-7777-4777-8777-777777777777','PHASE15 Último Estoque','fixture descartável',10,1,1,1,1,true,0
);

insert into public.mystery_versions (id,name,status)
values ('88888888-8888-4888-8888-888888888888','PHASE15 Mystery','DRAFT');
insert into public.mystery_version_entries (id,mystery_version_id,scratchcard_id,weight)
values ('99999999-9999-4999-8999-999999999999','88888888-8888-4888-8888-888888888888','44444444-4444-4444-8444-444444444444',1);

-- Signup invariants.
do $$
declare c integer;
begin
  select count(*) into c
  from public.profiles
  where id in (
    '11111111-1111-4111-8111-111111111111'::uuid,
    '22222222-2222-4222-8222-222222222222'::uuid,
    '33333333-3333-4333-8333-333333333333'::uuid
  ) and display_name is not null and public_slug is not null and balance=10 and points=0;
  if c <> 3 then raise exception 'signup trigger failed'; end if;
  if (select count(distinct public_slug) from public.profiles where id in (
    '11111111-1111-4111-8111-111111111111'::uuid,
    '22222222-2222-4222-8222-222222222222'::uuid,
    '33333333-3333-4333-8333-333333333333'::uuid
  )) <> 3 then raise exception 'public_slug uniqueness failed'; end if;
end $$;

-- User A: RLS, admin denial, paid retry and daily retry.
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
set local role authenticated;
do $$
declare c integer; r1 jsonb; r2 jsonb; d1 jsonb; d2 jsonb;
begin
  select count(*) into c from public.profiles;
  if c <> 1 then raise exception 'RLS profile ownership failed'; end if;
  if exists(select 1 from public.profiles where id='22222222-2222-4222-8222-222222222222') then raise exception 'RLS profile leak'; end if;

  begin
    perform public.get_admin_operations_v1();
    raise exception 'admin RPC accepted regular user';
  exception when others then
    if sqlerrm = 'admin RPC accepted regular user' then raise; end if;
    if position('Sem permissão' in sqlerrm)=0 then raise exception 'unexpected admin error: %', sqlerrm; end if;
  end;

  r1 := public.play_scratchcard_v1('44444444-4444-4444-8444-444444444444','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','phase15');
  r2 := public.play_scratchcard_v1('44444444-4444-4444-8444-444444444444','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','phase15-retry');
  if r1->>'id' is distinct from r2->>'id' then raise exception 'paid retry returned different play'; end if;
  if not coalesce((r2->>'idempotent')::boolean,false) then raise exception 'paid retry was not idempotent'; end if;
  if (r2->>'result_type') <> 'points' or (r2->>'new_balance')::numeric <> 9 or (r2->>'new_points')::int <> 5 then raise exception 'paid response contract invalid'; end if;
  if (select count(*) from public.plays where client_request_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') <> 1 then raise exception 'paid retry duplicated play'; end if;

  d1 := public.claim_daily_scratch_v2('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
  d2 := public.claim_daily_scratch_v2('dddddddd-dddd-4ddd-8ddd-dddddddddddd');
  if coalesce((d1->>'already_claimed')::boolean,true) then raise exception 'first daily unexpectedly repeated'; end if;
  if not coalesce((d2->>'already_claimed')::boolean,false) then raise exception 'second daily not detected'; end if;
  if d1->>'id' is distinct from d2->>'id' then raise exception 'daily duplicated play'; end if;
end $$;
reset role;

-- User B creates peer data; A must not see it.
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',true);
set local role authenticated;
select public.play_scratchcard_v1('44444444-4444-4444-8444-444444444444','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','phase15');
reset role;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
  if exists(select 1 from public.plays where user_id='22222222-2222-4222-8222-222222222222') then raise exception 'RLS play leak'; end if;
  if exists(select 1 from public.points_ledger where user_id='22222222-2222-4222-8222-222222222222') then raise exception 'RLS ledger leak'; end if;
end $$;
reset role;

-- Admin publishes the mystery pool.
select set_config('request.jwt.claims','{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}',true);
set local role authenticated;
do $$ declare r jsonb; begin
  r := public.get_admin_operations_v1();
  if r is null then raise exception 'admin operations returned null'; end if;
  r := public.admin_publish_mystery_v1('88888888-8888-4888-8888-888888888888');
  if r->>'status' <> 'PUBLISHED' then raise exception 'mystery publication failed'; end if;
end $$;
reset role;

update public.profiles set points=100 where id in ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222');

-- User A: mystery retry and redemption retry.
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
set local role authenticated;
do $$ declare m1 jsonb; m2 jsonb; r1 jsonb; r2 jsonb; begin
  m1 := public.open_mystery_scratch_v1('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
  m2 := public.open_mystery_scratch_v1('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
  if m1->>'id' is distinct from m2->>'id' or not coalesce((m2->>'idempotent')::boolean,false) then raise exception 'mystery retry failed'; end if;

  r1 := public.redeem_reward_v1('77777777-7777-4777-8777-777777777777','ffffffff-ffff-4fff-8fff-ffffffffffff');
  r2 := public.redeem_reward_v1('77777777-7777-4777-8777-777777777777','ffffffff-ffff-4fff-8fff-ffffffffffff');
  if r1->>'id' is distinct from r2->>'id' or not coalesce((r2->>'idempotent')::boolean,false) then raise exception 'redemption retry failed'; end if;
  if (r2->>'new_points')::int <> 90 then raise exception 'redemption retry double debit'; end if;
end $$;
reset role;

-- User B: stock is already gone and must fail closed.
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
  begin
    perform public.redeem_reward_v1('77777777-7777-4777-8777-777777777777','12121212-1212-4212-8212-121212121212');
    raise exception 'second user consumed nonexistent stock';
  exception when others then
    if sqlerrm = 'second user consumed nonexistent stock' then raise; end if;
    if position('ESGOTADO' in sqlerrm)=0 then raise exception 'unexpected stock failure: %', sqlerrm; end if;
  end;
end $$;
reset role;

do $$ begin
  if (select stock_available from public.store_items where id='77777777-7777-4777-8777-777777777777') <> 0 then raise exception 'stock invariant failed'; end if;
  if (select count(*) from public.redemptions where item_id='77777777-7777-4777-8777-777777777777') <> 1 then raise exception 'redemption cardinality failed'; end if;
  if (select points from public.profiles where id='11111111-1111-4111-8111-111111111111') <> 90 then raise exception 'user A points invariant failed'; end if;
  if (select points from public.profiles where id='22222222-2222-4222-8222-222222222222') <> 100 then raise exception 'user B points changed after stock failure'; end if;
end $$;

select extensions.pass('phase 15 transactional signup/RLS/idempotency/daily/mystery/stock suite');
select * from extensions.finish();
rollback;
