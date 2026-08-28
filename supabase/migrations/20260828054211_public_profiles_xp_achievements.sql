alter table public.profiles add column if not exists public_slug text;
alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists profile_public boolean not null default true;
alter table public.profiles add column if not exists show_achievements boolean not null default true;
alter table public.profiles add column if not exists show_statistics boolean not null default true;
alter table public.profiles add column if not exists xp integer not null default 0 check (xp >= 0);
alter table public.profiles add column if not exists level integer not null default 1 check (level >= 1);
update public.profiles set public_slug=coalesce(public_slug, 'jogador-' || left(id::text,8)), display_name=coalesce(display_name, split_part(coalesce(email,'Jogador'),'@',1));
alter table public.profiles alter column public_slug set not null;
alter table public.profiles alter column display_name set not null;
create unique index if not exists profiles_public_slug_unique on public.profiles(public_slug);
create table if not exists public.xp_transactions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  amount integer not null check (amount <> 0), source_type text not null, source_id uuid not null, created_at timestamptz not null default now(),
  unique(user_id,source_type,source_id)
);
create table if not exists public.achievements (
  id uuid primary key default gen_random_uuid(), slug text not null unique, name text not null, description text not null,
  icon text not null, criteria jsonb not null default '{}'::jsonb, sort_order integer not null default 0, active boolean not null default true, created_at timestamptz not null default now()
);
create table if not exists public.user_achievements (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  achievement_id uuid not null references public.achievements(id), earned_at timestamptz not null default now(), metadata jsonb not null default '{}'::jsonb,
  unique(user_id,achievement_id)
);
create index if not exists xp_transactions_user_idx on public.xp_transactions(user_id,created_at desc);
create index if not exists user_achievements_user_idx on public.user_achievements(user_id,earned_at desc);
alter table public.xp_transactions enable row level security;
alter table public.achievements enable row level security;
alter table public.user_achievements enable row level security;
create policy "read own xp transactions" on public.xp_transactions for select to authenticated using (user_id=(select auth.uid()));
create policy "read active achievements" on public.achievements for select to authenticated using (active=true);
create policy "read own earned achievements" on public.user_achievements for select to authenticated using (user_id=(select auth.uid()));
insert into public.achievements(slug,name,description,icon,criteria,sort_order) values
 ('first_scratch','Primeira Raspadinha','Complete sua primeira raspadinha.','🏅','{"type":"plays","count":1}',1),
 ('bronze_explorer','Explorador Bronze','Jogue uma raspadinha Bronze.','🥉','{"type":"rarity","slug":"bronze"}',2),
 ('silver_collector','Colecionador Prata','Jogue uma raspadinha Prata.','🥈','{"type":"rarity","slug":"prata"}',3),
 ('gold_touch','Toque de Ouro','Jogue uma raspadinha Ouro.','🥇','{"type":"rarity","slug":"ouro"}',4),
 ('diamond','Diamante','Jogue uma raspadinha Diamante.','💎','{"type":"rarity","slug":"diamante"}',5),
 ('frequent','Frequente','Complete uma raspadinha diária.','🔥','{"type":"daily","count":1}',6)
on conflict(slug) do nothing;
create or replace function public.award_achievement(p_user_id uuid,p_slug text,p_metadata jsonb default '{}'::jsonb) returns void language plpgsql security definer set search_path=public as $$
begin insert into user_achievements(user_id,achievement_id,metadata) select p_user_id,id,p_metadata from achievements where slug=p_slug and active=true on conflict(user_id,achievement_id) do nothing; end; $$;
create or replace function public.apply_play_progression() returns trigger language plpgsql security definer set search_path=public as $$
declare v_rarity text;
begin
 insert into xp_transactions(user_id,amount,source_type,source_id) values(new.user_id,10,'scratch_play',new.id) on conflict(user_id,source_type,source_id) do nothing;
 if found then update profiles set xp=xp+10, level=greatest(1,floor(sqrt((xp+10)::numeric/100))::integer+1) where id=new.user_id; end if;
 perform award_achievement(new.user_id,'first_scratch',jsonb_build_object('play_id',new.id));
 if new.source='daily' then perform award_achievement(new.user_id,'frequent',jsonb_build_object('play_id',new.id)); end if;
 select r.slug into v_rarity from scratch_math_versions v join scratch_rarities r on r.id=v.rarity_id where v.id=new.math_version_id;
 if v_rarity is not null then perform award_achievement(new.user_id,case v_rarity when 'bronze' then 'bronze_explorer' when 'prata' then 'silver_collector' when 'ouro' then 'gold_touch' when 'diamante' then 'diamond' end,jsonb_build_object('play_id',new.id)); end if;
 return new;
end; $$;
drop trigger if exists plays_progression on public.plays;
create trigger plays_progression after insert on public.plays for each row execute function public.apply_play_progression();
create or replace function public.get_public_profile(p_slug text) returns jsonb language plpgsql security definer set search_path=public as $$
declare p profiles%rowtype; v_achievements jsonb := '[]'::jsonb; v_stats jsonb := '{}'::jsonb;
begin
 select * into p from profiles where public_slug=lower(trim(p_slug)) and profile_public=true;
 if not found then return null; end if;
 if p.show_achievements then select coalesce(jsonb_agg(jsonb_build_object('name',a.name,'description',a.description,'icon',a.icon,'earned_at',ua.earned_at) order by ua.earned_at desc),'[]'::jsonb) into v_achievements from user_achievements ua join achievements a on a.id=ua.achievement_id where ua.user_id=p.id; end if;
 if p.show_statistics then select jsonb_build_object('scratch_count',(select count(*) from plays where user_id=p.id),'rarities',coalesce((select jsonb_agg(distinct r.slug) from plays pl join scratch_math_versions v on v.id=pl.math_version_id join scratch_rarities r on r.id=v.rarity_id where pl.user_id=p.id),'[]'::jsonb)) into v_stats; end if;
 return jsonb_build_object('slug',p.public_slug,'display_name',p.display_name,'avatar_url',p.avatar_url,'level',p.level,'xp',p.xp,'joined_at',p.created_at,'achievements',v_achievements,'stats',v_stats,'show_achievements',p.show_achievements,'show_statistics',p.show_statistics);
end; $$;
revoke all on function public.get_public_profile(text) from public;
grant execute on function public.get_public_profile(text) to anon,authenticated;
