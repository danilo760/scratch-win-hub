create table if not exists public.mystery_versions (
  id uuid primary key default gen_random_uuid(), name text not null unique,
  status text not null default 'DRAFT' check (status in ('DRAFT','PUBLISHED','RETIRED')),
  published_at timestamptz, published_by uuid references auth.users(id), created_at timestamptz not null default now()
);
create table if not exists public.mystery_version_entries (
  id uuid primary key default gen_random_uuid(), mystery_version_id uuid not null references public.mystery_versions(id) on delete cascade,
  scratchcard_id uuid not null references public.scratchcards(id), weight numeric not null check (weight > 0), unique(mystery_version_id, scratchcard_id)
);
create table if not exists public.mystery_openings (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
  client_request_id uuid not null, mystery_version_id uuid not null references public.mystery_versions(id),
  scratchcard_id uuid not null references public.scratchcards(id), math_version_id uuid references public.scratch_math_versions(id),
  opened_at timestamptz not null default now(), unique(user_id, client_request_id)
);
create table if not exists public.daily_scratch_claims (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), claim_date date not null,
  scratch_play_id uuid references public.plays(id), created_at timestamptz not null default now(), unique(user_id, claim_date)
);
create index if not exists mystery_entries_version_idx on public.mystery_version_entries(mystery_version_id);
create index if not exists mystery_openings_user_idx on public.mystery_openings(user_id, opened_at desc);
create index if not exists daily_claims_user_date_idx on public.daily_scratch_claims(user_id, claim_date desc);
alter table public.mystery_versions enable row level security;
alter table public.mystery_version_entries enable row level security;
alter table public.mystery_openings enable row level security;
alter table public.daily_scratch_claims enable row level security;
create policy "read published mystery versions" on public.mystery_versions for select to authenticated using (status='PUBLISHED');
create policy "read published mystery entries" on public.mystery_version_entries for select to authenticated using (exists (select 1 from mystery_versions v where v.id=mystery_version_id and v.status='PUBLISHED'));
create policy "read own mystery openings" on public.mystery_openings for select to authenticated using (user_id=(select auth.uid()));
create policy "read own daily claims" on public.daily_scratch_claims for select to authenticated using (user_id=(select auth.uid()));
create or replace function public.open_mystery_scratch_v1(p_client_request_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_user uuid:=auth.uid(); v_version mystery_versions%rowtype; v_entry mystery_version_entries%rowtype; v_total numeric; v_pick numeric; v_cursor numeric:=0; v_math uuid; v_open mystery_openings%rowtype;
begin
 if v_user is null or p_client_request_id is null then raise exception 'Requisição inválida'; end if;
 select * into v_open from mystery_openings where user_id=v_user and client_request_id=p_client_request_id;
 if found then return jsonb_build_object('id',v_open.id,'scratchcard_id',v_open.scratchcard_id,'math_version_id',v_open.math_version_id,'idempotent',true); end if;
 select * into v_version from mystery_versions where status='PUBLISHED' order by published_at desc limit 1 for update;
 if not found then raise exception 'Pool misterioso indisponível'; end if;
 select coalesce(sum(weight),0) into v_total from mystery_version_entries where mystery_version_id=v_version.id;
 if v_total <= 0 then raise exception 'Pool misterioso inválido'; end if;
 v_pick:=floor(random()*v_total)+1;
 for v_entry in select * from mystery_version_entries where mystery_version_id=v_version.id order by id loop v_cursor:=v_cursor+v_entry.weight; if v_pick<=v_cursor then exit; end if; end loop;
 select id into v_math from scratch_math_versions where scratchcard_id=v_entry.scratchcard_id and status='PUBLISHED' order by published_at desc limit 1;
 if v_math is null then raise exception 'Cartela selecionada sem matemática publicada'; end if;
 insert into mystery_openings(user_id,client_request_id,mystery_version_id,scratchcard_id,math_version_id) values(v_user,p_client_request_id,v_version.id,v_entry.scratchcard_id,v_math) returning * into v_open;
 return jsonb_build_object('id',v_open.id,'scratchcard_id',v_open.scratchcard_id,'math_version_id',v_open.math_version_id,'mystery_version_id',v_open.mystery_version_id,'idempotent',false);
end; $$;
create or replace function public.claim_daily_scratch_v1(p_card_id uuid, p_client_request_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_user uuid:=auth.uid(); v_date date:=(now() at time zone 'America/Sao_Paulo')::date; v_claim daily_scratch_claims%rowtype; v_version scratch_math_versions%rowtype; v_outcome scratch_outcomes%rowtype; v_total numeric; v_pick numeric; v_cursor numeric:=0; v_play plays%rowtype;
begin
 if v_user is null or p_client_request_id is null then raise exception 'Requisição inválida'; end if;
 insert into daily_scratch_claims(user_id,claim_date) values(v_user,v_date) on conflict(user_id,claim_date) do nothing returning * into v_claim;
 if not found then select * into v_claim from daily_scratch_claims where user_id=v_user and claim_date=v_date; if v_claim.scratch_play_id is not null then select * into v_play from plays where id=v_claim.scratch_play_id; return jsonb_build_object('id',v_play.id,'prize',v_play.prize,'points_earned',v_play.points_earned,'already_claimed',true); end if; raise exception 'Cortesia diária em processamento'; end if;
 select * into v_version from scratch_math_versions where scratchcard_id=p_card_id and status='PUBLISHED' order by published_at desc limit 1;
 if not found then raise exception 'Raspadinha diária indisponível'; end if;
 select coalesce(sum(weight),0) into v_total from scratch_outcomes where math_version_id=v_version.id; if v_total<=0 then raise exception 'Matemática inválida'; end if;
 v_pick:=floor(random()*v_total)+1; for v_outcome in select * from scratch_outcomes where math_version_id=v_version.id order by id loop v_cursor:=v_cursor+v_outcome.weight; if v_pick<=v_cursor then exit; end if; end loop;
 update profiles set balance=balance+v_outcome.prize, points=points+v_outcome.points where id=v_user;
 insert into plays(user_id,card_id,price,prize,points_earned,math_version_id,client_request_id,outcome_id,source) values(v_user,p_card_id,0,v_outcome.prize,v_outcome.points,v_version.id,p_client_request_id,v_outcome.id,'daily') returning * into v_play;
 update daily_scratch_claims set scratch_play_id=v_play.id where id=v_claim.id;
 return jsonb_build_object('id',v_play.id,'prize',v_play.prize,'points_earned',v_play.points_earned,'already_claimed',false);
end; $$;
revoke all on function public.open_mystery_scratch_v1(uuid) from public,anon;
grant execute on function public.open_mystery_scratch_v1(uuid) to authenticated;
revoke all on function public.claim_daily_scratch_v1(uuid,uuid) from public,anon;
grant execute on function public.claim_daily_scratch_v1(uuid,uuid) to authenticated;
