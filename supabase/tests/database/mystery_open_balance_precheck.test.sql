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
  '81818181-8181-4181-8181-818181818181',
  'authenticated',
  'authenticated',
  'mystery-balance-regular@example.invalid',
  '{}',
  '{"display_name":"Mystery Balance Regular"}',
  now(),
  now()
),
(
  '82828282-8282-4282-8282-828282828282',
  'authenticated',
  'authenticated',
  'mystery-balance-admin@example.invalid',
  '{}',
  '{"display_name":"Mystery Balance Admin"}',
  now(),
  now()
);

update public.profiles
set balance = 2
where id = '81818181-8181-4181-8181-818181818181';

update public.profiles
set admin_role = 'admin_master'
where id = '82828282-8282-4282-8282-828282828282';

insert into public.scratchcards(id,title,price,active,is_daily_eligible)
values
  ('83838383-8383-4383-8383-838383838383','Mystery Cheap Card',1,true,false),
  ('84848484-8484-4484-8484-848484848484','Mystery Expensive Card',5,true,false);

insert into public.scratch_math_versions(id,scratchcard_id,rarity_id,version_name,status)
select
  '85858585-8585-4585-8585-858585858585',
  '83838383-8383-4383-8383-838383838383',
  id,
  'Mystery Cheap V1',
  'DRAFT'
from public.scratch_rarities
where slug='bronze';

insert into public.scratch_math_versions(id,scratchcard_id,rarity_id,version_name,status)
select
  '86868686-8686-4686-8686-868686868686',
  '84848484-8484-4484-8484-848484848484',
  id,
  'Mystery Expensive V1',
  'DRAFT'
from public.scratch_rarities
where slug='bronze';

insert into public.scratch_outcomes(id,math_version_id,name,prize,points,weight)
values
  ('87878787-8787-4787-8787-878787878787','85858585-8585-4585-8585-858585858585','Cheap Outcome',0,1,1),
  ('88888888-8888-4888-8888-888888888888','86868686-8686-4686-8686-868686868686','Expensive Outcome',0,5,1);

select set_config(
  'request.jwt.claims',
  '{"sub":"82828282-8282-4282-8282-828282828282","role":"authenticated"}',
  true
);
set local role authenticated;

select public.publish_math_version_v1('85858585-8585-4585-8585-858585858585');
select public.publish_math_version_v1('86868686-8686-4686-8686-868686868686');

create temporary table mystery_balance_pool(pool_id uuid) on commit drop;

do $$
declare
  v_pool uuid;
begin
  v_pool := public.admin_create_mystery_draft_v1('MYSTERY BALANCE PRECHECK');
  perform public.admin_add_mystery_entry_v1(
    v_pool,
    '83838383-8383-4383-8383-838383838383',
    9
  );
  perform public.admin_add_mystery_entry_v1(
    v_pool,
    '84848484-8484-4484-8484-848484848484',
    1
  );
  perform public.admin_publish_mystery_v1(v_pool);
  insert into mystery_balance_pool(pool_id) values(v_pool);
end $$;

reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"81818181-8181-4181-8181-818181818181","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_error text;
begin
  begin
    perform public.open_mystery_scratch_v1('89898989-8989-4989-8989-898989898989');
    raise exception 'expected insufficient balance error';
  exception
    when others then
      v_error := sqlerrm;
      if v_error <> 'Saldo insuficiente para abrir a Misteriosa' then
        raise;
      end if;
  end;

  if exists(
    select 1
    from public.mystery_openings
    where user_id='81818181-8181-4181-8181-818181818181'
      and client_request_id='89898989-8989-4989-8989-898989898989'
  ) then
    raise exception 'unaffordable Mystery opening was persisted';
  end if;
end $$;

reset role;

update public.profiles
set balance = 5
where id = '81818181-8181-4181-8181-818181818181';

select set_config(
  'request.jwt.claims',
  '{"sub":"81818181-8181-4181-8181-818181818181","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_open jsonb;
  v_card uuid;
  v_math uuid;
begin
  v_open := public.open_mystery_scratch_v1('90909090-9090-4090-8090-909090909090');
  v_card := (v_open->>'scratchcard_id')::uuid;
  v_math := (v_open->>'math_version_id')::uuid;

  if v_card not in (
    '83838383-8383-4383-8383-838383838383'::uuid,
    '84848484-8484-4484-8484-848484848484'::uuid
  ) then
    raise exception 'Mystery selected a card outside the published pool: %',v_open;
  end if;

  if not exists(
    select 1
    from public.scratch_math_versions mv
    where mv.id=v_math
      and mv.scratchcard_id=v_card
      and mv.status='PUBLISHED'
  ) then
    raise exception 'Mystery did not persist the selected card published math: %',v_open;
  end if;
end $$;

reset role;

select extensions.pass(
  'Mystery opening rejects balances below the pool maximum price without persisting an opening, then opens normally once every pool entry is affordable'
);
select * from extensions.finish();
rollback;
