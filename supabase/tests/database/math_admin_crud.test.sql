begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(1);

insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
('31313131-3131-4131-8131-313131313131','authenticated','authenticated','math-regular@example.invalid','{}','{"display_name":"Math Regular"}',now(),now()),
('32323232-3232-4232-8232-323232323232','authenticated','authenticated','math-admin-crud@example.invalid','{}','{"display_name":"Math CRUD Admin"}',now(),now());
update public.profiles set is_admin=true where id='32323232-3232-4232-8232-323232323232';

insert into public.scratchcards(id,title,price,active)
values ('33333333-4444-4333-8333-444444444444','Math CRUD fixture',2,true);

select set_config('request.jwt.claims','{"sub":"31313131-3131-4131-8131-313131313131","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
  begin
    perform public.create_math_draft_v1('33333333-4444-4333-8333-444444444444','Forbidden draft','prata');
    raise exception 'regular user created math draft';
  exception when others then
    if sqlerrm='regular user created math draft' then raise; end if;
    if position('Sem permissão' in sqlerrm)=0 then raise exception 'unexpected regular-user denial: %',sqlerrm; end if;
  end;
end $$;
reset role;

select set_config('request.jwt.claims','{"sub":"32323232-3232-4232-8232-323232323232","role":"authenticated"}',true);
set local role authenticated;

do $$
declare
  v_id uuid;
  o1 uuid;
  o2 uuid;
  pub jsonb;
  sim jsonb;
  audit jsonb;
  cfg jsonb;
  ok boolean;
begin
  v_id := public.create_math_draft_v1('33333333-4444-4333-8333-444444444444','CRUD V1','prata');
  cfg := public.get_admin_math_config_v1();
  select exists(
    select 1
    from jsonb_array_elements(cfg->'versions') v
    where v->>'id'=v_id::text
      and v->>'status'='DRAFT'
      and v->>'rarity_slug'='prata'
  ) into ok;
  if not ok then raise exception 'draft was not visible through admin math RPC with selected rarity'; end if;

  o1 := public.add_math_outcome_v1(v_id,'Outcome A',0,10,2.5);
  o2 := public.add_math_outcome_v1(v_id,'Outcome B',1.25,0,7.5);

  perform public.update_math_outcome_v1(o1,'Outcome A editado',0.50,5,3.5);
  cfg := public.get_admin_math_config_v1();
  select exists(
    select 1
    from jsonb_array_elements(cfg->'versions') v
    cross join lateral jsonb_array_elements(v->'outcomes') o
    where v->>'id'=v_id::text
      and o->>'id'=o1::text
      and o->>'name'='Outcome A editado'
      and (o->>'prize')::numeric=0.50
      and (o->>'points')::int=5
      and (o->>'weight')::numeric=3.5
  ) into ok;
  if not ok then raise exception 'outcome update was not visible through admin math RPC'; end if;

  perform public.delete_math_outcome_v1(o2);
  cfg := public.get_admin_math_config_v1();
  select exists(
    select 1
    from jsonb_array_elements(cfg->'versions') v
    cross join lateral jsonb_array_elements(v->'outcomes') o
    where v->>'id'=v_id::text and o->>'id'=o2::text
  ) into ok;
  if ok then raise exception 'deleted outcome remained visible through admin math RPC'; end if;

  o2 := public.add_math_outcome_v1(v_id,'Outcome B final',0,0,6.5);
  pub := public.publish_math_version_v1(v_id);
  if pub->>'status' <> 'PUBLISHED' then raise exception 'publish response invalid: %',pub; end if;

  begin
    perform public.update_math_outcome_v1(o1,'Tamper',99,99,99);
    raise exception 'published outcome update RPC succeeded';
  exception when others then
    if sqlerrm='published outcome update RPC succeeded' then raise; end if;
    if position('não editável' in sqlerrm)=0 then raise exception 'unexpected published update error: %',sqlerrm; end if;
  end;

  begin
    perform public.add_math_outcome_v1(v_id,'Tamper add',1,1,1);
    raise exception 'published outcome add RPC succeeded';
  exception when others then
    if sqlerrm='published outcome add RPC succeeded' then raise; end if;
    if position('Somente versões DRAFT' in sqlerrm)=0 then raise exception 'unexpected published add error: %',sqlerrm; end if;
  end;

  begin
    perform public.delete_math_outcome_v1(o1);
    raise exception 'published outcome delete RPC succeeded';
  exception when others then
    if sqlerrm='published outcome delete RPC succeeded' then raise; end if;
    if position('não removível' in sqlerrm)=0 then raise exception 'unexpected published delete error: %',sqlerrm; end if;
  end;

  sim := public.simulate_math_v1(v_id,1000);
  if (sim->>'simulations')::int <> 1000 or jsonb_array_length(sim->'outcomes') <> 2 then
    raise exception 'simulator response invalid: %',sim;
  end if;

  audit := public.get_math_audit_v1(v_id);
  if audit->>'version_id' <> v_id::text or (audit->>'total_plays')::int <> 0 then
    raise exception 'math audit response invalid: %',audit;
  end if;
end $$;

reset role;

select extensions.pass('math admin CRUD is admin-only, uses the admin RPC surface for DRAFT data, locks PUBLISHED outcomes, and exposes simulator/audit');
select * from extensions.finish();
rollback;
