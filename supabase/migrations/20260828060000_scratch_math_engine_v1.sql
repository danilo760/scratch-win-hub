create table if not exists public.scratch_rarities (
  id uuid primary key default gen_random_uuid(), slug text not null unique,
  name text not null, description text not null default '', theme jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.scratch_math_versions (
  id uuid primary key default gen_random_uuid(), scratchcard_id uuid not null references public.scratchcards(id),
  rarity_id uuid references public.scratch_rarities(id), version_name text not null,
  status text not null default 'DRAFT' check (status in ('DRAFT','PUBLISHED','RETIRED')),
  published_at timestamptz, published_by uuid references auth.users(id), config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), unique (scratchcard_id, version_name)
);
create table if not exists public.scratch_outcomes (
  id uuid primary key default gen_random_uuid(), math_version_id uuid not null references public.scratch_math_versions(id) on delete cascade,
  name text not null, prize numeric not null check (prize >= 0), points integer not null default 0 check (points >= 0),
  weight numeric not null check (weight > 0), created_at timestamptz not null default now()
);
alter table public.plays add column if not exists math_version_id uuid references public.scratch_math_versions(id);
alter table public.plays add column if not exists client_request_id uuid;
alter table public.plays add column if not exists outcome_id uuid references public.scratch_outcomes(id);
alter table public.plays add column if not exists source text not null default 'web';
create unique index if not exists plays_user_request_unique on public.plays(user_id, client_request_id) where client_request_id is not null;
create index if not exists scratch_math_versions_card_status_idx on public.scratch_math_versions(scratchcard_id, status);
create index if not exists scratch_outcomes_version_idx on public.scratch_outcomes(math_version_id);
alter table public.scratch_rarities enable row level security;
alter table public.scratch_math_versions enable row level security;
alter table public.scratch_outcomes enable row level security;
create policy "authenticated read rarities" on public.scratch_rarities for select to authenticated using (true);
create policy "authenticated read published math" on public.scratch_math_versions for select to authenticated using (status = 'PUBLISHED');
create policy "authenticated read published outcomes" on public.scratch_outcomes for select to authenticated using (exists (select 1 from scratch_math_versions v where v.id=math_version_id and v.status='PUBLISHED'));
insert into public.scratch_rarities(slug,name,description,theme) values
 ('bronze','Bronze','Brilho bronze discreto','{"accent":"#CD7F32","effect":"subtle"}'),
 ('prata','Prata','Acabamento metálico','{"accent":"#C0C0C0","effect":"metallic"}'),
 ('ouro','Ouro','Glow dourado premium','{"accent":"#F5C542","effect":"glow"}'),
 ('diamante','Diamante','Efeito cristal premium','{"accent":"#67E8F9","effect":"crystal"}') on conflict (slug) do nothing;
create or replace function public.play_scratchcard_v1(p_card_id uuid, p_client_request_id uuid, p_source text default 'web') returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_card scratchcards%rowtype; v_version scratch_math_versions%rowtype; v_outcome scratch_outcomes%rowtype;
v_total numeric; v_pick numeric; v_cursor numeric := 0; v_play plays%rowtype; v_balance numeric; v_points integer;
begin
 if v_user is null or p_client_request_id is null then raise exception 'Usuário e requisição são obrigatórios'; end if;
 select * into v_play from plays where user_id=v_user and client_request_id=p_client_request_id limit 1;
 if found then return jsonb_build_object('id',v_play.id,'prize',v_play.prize,'points_earned',v_play.points_earned,'idempotent',true); end if;
 select * into v_card from scratchcards where id=p_card_id and active=true for update;
 if not found then raise exception 'Raspadinha indisponível'; end if;
 select * into v_version from scratch_math_versions where scratchcard_id=p_card_id and status='PUBLISHED' order by published_at desc limit 1;
 if not found then raise exception 'Raspadinha sem versão matemática publicada'; end if;
 select coalesce(sum(weight),0) into v_total from scratch_outcomes where math_version_id=v_version.id;
 if v_total <= 0 then raise exception 'Versão matemática inválida'; end if;
 select balance, points into v_balance, v_points from profiles where id=v_user for update;
 if coalesce(v_balance,0) < v_card.price then raise exception 'Saldo insuficiente'; end if;
 v_pick := floor(random() * v_total) + 1;
 for v_outcome in select * from scratch_outcomes where math_version_id=v_version.id order by id loop
   v_cursor := v_cursor + v_outcome.weight; if v_pick <= v_cursor then exit; end if;
 end loop;
 update profiles set balance=balance-v_card.price, points=points+v_outcome.points where id=v_user returning balance,points into v_balance,v_points;
 insert into plays(user_id,card_id,price,prize,points_earned,math_version_id,client_request_id,outcome_id,source)
 values(v_user,p_card_id,v_card.price,v_outcome.prize,v_outcome.points,v_version.id,p_client_request_id,v_outcome.id,left(coalesce(p_source,'web'),32)) returning * into v_play;
 return jsonb_build_object('id',v_play.id,'prize',v_outcome.prize,'points_earned',v_outcome.points,'new_balance',v_balance,'new_points',v_points,'math_version_id',v_version.id,'idempotent',false);
end; $$;
revoke all on function public.play_scratchcard_v1(uuid,uuid,text) from public, anon;
grant execute on function public.play_scratchcard_v1(uuid,uuid,text) to authenticated;
