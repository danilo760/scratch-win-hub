create table if not exists public.raffles (
  id uuid primary key default gen_random_uuid(), title text not null, description text not null default '',
  image_url text, total_tickets integer not null check (total_tickets > 0), ticket_price integer not null check (ticket_price > 0),
  status text not null default 'active' check (status in ('active','closed','drawn')), winner_ticket integer,
  created_at timestamptz not null default now(), closed_at timestamptz
);
create table if not exists public.raffle_tickets (
  id uuid primary key default gen_random_uuid(), raffle_id uuid not null references public.raffles(id) on delete cascade,
  ticket_number integer not null, user_id uuid not null references auth.users(id) on delete cascade, purchased_at timestamptz not null default now(),
  unique (raffle_id, ticket_number)
);
create table if not exists public.credit_transactions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  amount integer not null check (amount > 0), type text not null check (type in ('pix_pending','pix_approved','admin_credit')),
  status text not null default 'pending' check (status in ('pending','approved','rejected')), pix_key text,
  created_at timestamptz not null default now(), approved_at timestamptz
);
alter table public.raffles enable row level security;
alter table public.raffle_tickets enable row level security;
alter table public.credit_transactions enable row level security;
create policy "active raffles are public" on public.raffles for select using (status = 'active' or auth.uid() is not null);
create policy "users see own tickets" on public.raffle_tickets for select to authenticated using (user_id = auth.uid());
create policy "users see own transactions" on public.credit_transactions for select to authenticated using (user_id = auth.uid());
create policy "users create pix requests" on public.credit_transactions for insert to authenticated with check (user_id = auth.uid() and type = 'pix_pending' and status = 'pending');
insert into public.raffles (title, description, image_url, total_tickets, ticket_price)
select 'iPhone 15 Pro', 'Concorra a um smartphone novo com bilhetes digitais.', 'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=900', 100, 10
where not exists (select 1 from public.raffles);
insert into public.raffles (title, description, image_url, total_tickets, ticket_price)
select 'Vale-compras R$ 500', 'Escolha seus números e participe do próximo sorteio.', 'https://images.unsplash.com/photo-1607082349566-187342175e2f?w=900', 250, 5
where (select count(*) from public.raffles) = 1;
create or replace function public.buy_raffle_tickets(p_raffle_id uuid, p_quantity integer) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_price integer; v_balance numeric; v_start integer;
begin
 if v_user is null or p_quantity < 1 or p_quantity > 10 then raise exception 'Dados inválidos'; end if;
 select ticket_price into v_price from raffles where id=p_raffle_id and status='active' for update;
 if v_price is null then raise exception 'Sorteio indisponível'; end if;
 select balance into v_balance from profiles where id=v_user for update;
 if coalesce(v_balance,0) < v_price*p_quantity then raise exception 'Saldo insuficiente'; end if;
 select coalesce(max(ticket_number),0)+1 into v_start from raffle_tickets where raffle_id=p_raffle_id;
 if v_start+p_quantity-1 > (select total_tickets from raffles where id=p_raffle_id) then raise exception 'Bilhetes esgotados'; end if;
 update profiles set balance=balance-v_price*p_quantity where id=v_user;
 insert into raffle_tickets(raffle_id,ticket_number,user_id) select p_raffle_id, v_start+g, v_user from generate_series(0,p_quantity-1) g;
 return jsonb_build_object('success',true,'quantity',p_quantity);
end; $$;
revoke all on function public.buy_raffle_tickets(uuid,integer) from public, anon;
grant execute on function public.buy_raffle_tickets(uuid,integer) to authenticated;
create policy raffles_admin_insert on public.raffles for insert to authenticated with check (exists (select 1 from profiles where id=auth.uid() and is_admin=true));
