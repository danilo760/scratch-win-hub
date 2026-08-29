begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(1);

do $$
declare
  actual text[];
begin
  select array_agg(slug order by case slug when 'bronze' then 1 when 'prata' then 2 when 'ouro' then 3 when 'diamante' then 4 else 99 end)
  into actual
  from public.scratch_rarities;

  if actual is distinct from array['bronze','prata','ouro','diamante']::text[] then
    raise exception 'unexpected rarity contract: %',actual;
  end if;

  if exists(select 1 from public.scratch_rarities where slug in ('silver','gold','diamond')) then
    raise exception 'legacy English rarity slug is present';
  end if;
end $$;

insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('21212121-2121-4121-8121-212121212121','authenticated','authenticated','rarity-admin@example.invalid','{}','{"display_name":"Rarity Admin"}',now(),now());
update public.profiles set admin_role='admin_master' where id='21212121-2121-4121-8121-212121212121';

insert into public.scratchcards(id,title,price,active)
values ('22222222-3333-4222-8222-333333333333','Rarity contract fixture',1,true);

select set_config('request.jwt.claims','{"sub":"21212121-2121-4121-8121-212121212121","role":"authenticated"}',true);
set local role authenticated;

do $$
declare
  draft_id uuid;
  cfg jsonb;
  valid_draft boolean;
begin
  draft_id := public.create_math_draft_v1(
    '22222222-3333-4222-8222-333333333333',
    'Valid Ouro Draft',
    'ouro'
  );

  cfg := public.get_admin_math_config_v1();
  select exists(
    select 1
    from jsonb_array_elements(cfg->'versions') v
    where v->>'id'=draft_id::text
      and v->>'status'='DRAFT'
      and v->>'rarity_slug'='ouro'
  ) into valid_draft;

  if not valid_draft then
    raise exception 'valid ouro draft was not returned correctly by admin math RPC';
  end if;

  begin
    perform public.create_math_draft_v1(
      '22222222-3333-4222-8222-333333333333',
      'Invalid Gold Draft',
      'gold'
    );
    raise exception 'legacy gold slug was accepted';
  exception when others then
    if sqlerrm='legacy gold slug was accepted' then raise; end if;
    if position('Raridade inválida' in sqlerrm)=0 then
      raise exception 'unexpected invalid rarity error: %',sqlerrm;
    end if;
  end;
end $$;

reset role;

select extensions.pass('rarity contract uses only bronze/prata/ouro/diamante and admin master draft creation rejects English aliases through the real RPC surface');
select * from extensions.finish();
rollback;
