begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(1);

insert into auth.users (id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values (
  '13131313-1313-4313-8313-131313131313',
  'authenticated',
  'authenticated',
  'play-contract@example.invalid',
  '{}',
  '{"display_name":"Play Contract"}',
  now(),
  now()
);

insert into public.scratchcards(id,title,price,active)
values ('14141414-1414-4414-8414-141414141414','Play contract fixture',1,true);

insert into public.scratch_math_versions(id,scratchcard_id,rarity_id,version_name,status)
select
  '15151515-1515-4515-8515-151515151515',
  '14141414-1414-4414-8414-141414141414',
  id,
  'Play contract fixture',
  'DRAFT'
from public.scratch_rarities
where slug='bronze';

insert into public.scratch_outcomes(id,math_version_id,name,prize,points,weight)
values (
  '16161616-1616-4616-8616-161616161616',
  '15151515-1515-4515-8515-151515151515',
  '+5 pontos',
  0,
  5,
  1
);

update public.scratch_math_versions
set status='PUBLISHED'
where id='15151515-1515-4515-8515-151515151515';

select set_config(
  'request.jwt.claims',
  '{"sub":"13131313-1313-4313-8313-131313131313","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  r1 jsonb;
  r2 jsonb;
begin
  r1 := public.play_scratchcard_v1(
    '14141414-1414-4414-8414-141414141414',
    '17171717-1717-4717-8717-171717171717',
    'contract-first'
  );
  r2 := public.play_scratchcard_v1(
    '14141414-1414-4414-8414-141414141414',
    '17171717-1717-4717-8717-171717171717',
    'contract-retry'
  );

  if coalesce((r1->>'idempotent')::boolean,true) then
    raise exception 'first paid response unexpectedly idempotent';
  end if;
  if not coalesce((r2->>'idempotent')::boolean,false) then
    raise exception 'retry response not marked idempotent';
  end if;
  if (r1 - 'idempotent') is distinct from (r2 - 'idempotent') then
    raise exception 'retry contract changed fields: first %, retry %', r1, r2;
  end if;
  if r1->>'result_type' <> 'points' then
    raise exception 'points-only outcome was not classified as a win';
  end if;
  if (r1->>'new_balance')::numeric <> 9 or (r1->>'new_points')::integer <> 5 then
    raise exception 'authoritative paid balances are incorrect: %', r1;
  end if;

  begin
    perform public.play_scratchcard_v1(
      '19191919-1919-4919-8919-191919191919',
      '17171717-1717-4717-8717-171717171717',
      'contract-cross-card'
    );
    raise exception 'cross-card client_request_id reuse was accepted';
  exception when others then
    if sqlerrm='cross-card client_request_id reuse was accepted' then raise; end if;
    if position('outra raspadinha' in sqlerrm)=0 then
      raise exception 'unexpected cross-card reuse error: %', sqlerrm;
    end if;
  end;

  if (select count(*) from public.plays where user_id='13131313-1313-4313-8313-131313131313') <> 1 then
    raise exception 'retry duplicated paid play';
  end if;
  if (select count(*) from public.credit_ledger where user_id='13131313-1313-4313-8313-131313131313' and transaction_type='SCRATCH_COST') <> 1 then
    raise exception 'retry duplicated credit debit';
  end if;
  if (select count(*) from public.points_ledger where user_id='13131313-1313-4313-8313-131313131313' and transaction_type='SCRATCH_REWARD') <> 1 then
    raise exception 'retry duplicated points reward';
  end if;
end $$;

reset role;

update public.profiles
set balance=0.50
where id='13131313-1313-4313-8313-131313131313';

select set_config(
  'request.jwt.claims',
  '{"sub":"13131313-1313-4313-8313-131313131313","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
begin
  begin
    perform public.play_scratchcard_v1(
      '14141414-1414-4414-8414-141414141414',
      '18181818-1818-4818-8818-181818181818',
      'insufficient-balance'
    );
    raise exception 'insufficient balance was accepted';
  exception when others then
    if sqlerrm='insufficient balance was accepted' then raise; end if;
    if position('Saldo insuficiente' in sqlerrm)=0 then
      raise exception 'unexpected insufficient-balance error: %', sqlerrm;
    end if;
  end;

  if (select balance from public.profiles where id='13131313-1313-4313-8313-131313131313') <> 0.50 then
    raise exception 'insufficient balance changed credits';
  end if;
  if (select points from public.profiles where id='13131313-1313-4313-8313-131313131313') <> 5 then
    raise exception 'insufficient balance changed points';
  end if;
  if (select count(*) from public.plays where user_id='13131313-1313-4313-8313-131313131313') <> 1 then
    raise exception 'insufficient balance created a play';
  end if;
  if (select count(*) from public.credit_ledger where user_id='13131313-1313-4313-8313-131313131313') <> 1 then
    raise exception 'insufficient balance created credit ledger entries';
  end if;
  if (select count(*) from public.points_ledger where user_id='13131313-1313-4313-8313-131313131313') <> 1 then
    raise exception 'insufficient balance created points ledger entries';
  end if;
end $$;

reset role;

select extensions.pass('paid play retries preserve the full contract, reject cross-card key reuse and insufficient balance fails atomically');
select * from extensions.finish();
rollback;
