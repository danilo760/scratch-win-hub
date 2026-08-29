begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(1);

insert into auth.users (id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values (
  '13131313-1313-4313-8313-131313131313',
  'authenticated','authenticated','math-admin@example.invalid','{}',
  '{"display_name":"Math Admin"}',now(),now()
);
update public.profiles
set admin_role='admin_master'
where id='13131313-1313-4313-8313-131313131313';

insert into public.scratchcards(id,title,price,active)
values ('14141414-1414-4414-8414-141414141414','Math lifecycle fixture',1,true);

insert into public.scratch_math_versions(id,scratchcard_id,rarity_id,version_name,status)
select '15151515-1515-4515-8515-151515151515','14141414-1414-4414-8414-141414141414',id,'V1','DRAFT'
from public.scratch_rarities where slug='bronze';
insert into public.scratch_outcomes(id,math_version_id,name,prize,points,weight)
values ('16161616-1616-4616-8616-161616161616','15151515-1515-4515-8515-151515151515','V1 outcome',0,1,1);

insert into public.scratch_math_versions(id,scratchcard_id,rarity_id,version_name,status)
select '17171717-1717-4717-8717-171717171717','14141414-1414-4414-8414-141414141414',id,'V2','DRAFT'
from public.scratch_rarities where slug='ouro';
insert into public.scratch_outcomes(id,math_version_id,name,prize,points,weight)
values
  ('18181818-1818-4818-8818-181818181818','17171717-1717-4717-8717-171717171717','Fraction A',0,2,0.5),
  ('19191919-1919-4919-8919-191919191919','17171717-1717-4717-8717-171717171717','Fraction B',0,4,0.5);

insert into public.scratch_math_versions(id,scratchcard_id,rarity_id,version_name,status)
select '20202020-3030-4020-8020-303030303030','14141414-1414-4414-8414-141414141414',id,'V3 inválida','DRAFT'
from public.scratch_rarities where slug='prata';

select set_config(
  'request.jwt.claims',
  '{"sub":"13131313-1313-4313-8313-131313131313","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  r jsonb;
  sim jsonb;
  count_a int;
  count_b int;
begin
  r := public.publish_math_version_v1('15151515-1515-4515-8515-151515151515');
  if r->>'status' <> 'PUBLISHED' then raise exception 'V1 publish failed'; end if;

  r := public.publish_math_version_v1('17171717-1717-4717-8717-171717171717');
  if r->>'status' <> 'PUBLISHED' then raise exception 'V2 publish failed'; end if;

  if (select status from public.scratch_math_versions where id='15151515-1515-4515-8515-151515151515') <> 'RETIRED' then
    raise exception 'previous published version was not retired';
  end if;
  if (select status from public.scratch_math_versions where id='17171717-1717-4717-8717-171717171717') <> 'PUBLISHED' then
    raise exception 'new version is not published';
  end if;
  if (select count(*) from public.scratch_math_versions where scratchcard_id='14141414-1414-4414-8414-141414141414' and status='PUBLISHED') <> 1 then
    raise exception 'card has more than one published version';
  end if;

  begin
    perform public.publish_math_version_v1('20202020-3030-4020-8020-303030303030');
    raise exception 'empty draft was published';
  exception when others then
    if sqlerrm='empty draft was published' then raise; end if;
    if position('Versão sem matemática válida' in sqlerrm)=0 then
      raise exception 'unexpected invalid publish error: %',sqlerrm;
    end if;
  end;
  if (select status from public.scratch_math_versions where id='17171717-1717-4717-8717-171717171717') <> 'PUBLISHED' then
    raise exception 'failed publish retired the valid current version';
  end if;

  sim := public.simulate_math_v1('17171717-1717-4717-8717-171717171717',10000);
  select (x->>'count')::int into count_a
  from jsonb_array_elements(sim->'outcomes') x
  where x->>'outcome_id'='18181818-1818-4818-8818-181818181818';
  select (x->>'count')::int into count_b
  from jsonb_array_elements(sim->'outcomes') x
  where x->>'outcome_id'='19191919-1919-4919-8919-191919191919';
  if coalesce(count_a,0)=0 or coalesce(count_b,0)=0 or count_a+count_b<>10000 then
    raise exception 'fractional simulator did not preserve both buckets: %, %',count_a,count_b;
  end if;
end $$;

reset role;

do $$ begin
  begin
    update public.scratch_math_versions
    set version_name='tampered'
    where id='15151515-1515-4515-8515-151515151515';
    raise exception 'retired version was mutable';
  exception when others then
    if sqlerrm='retired version was mutable' then raise; end if;
    if position('imutável' in lower(sqlerrm))=0 then raise exception 'unexpected retired guard: %',sqlerrm; end if;
  end;

  begin
    update public.scratch_outcomes
    set weight=9
    where id='18181818-1818-4818-8818-181818181818';
    raise exception 'published outcome was mutable';
  exception when others then
    if sqlerrm='published outcome was mutable' then raise; end if;
    if position('imutáveis' in lower(sqlerrm))=0 then raise exception 'unexpected outcome guard: %',sqlerrm; end if;
  end;
end $$;

select extensions.pass('math publishing retires the prior version, fractional simulation is valid, failed publishes are atomic, and published history is immutable');
select * from extensions.finish();
rollback;
