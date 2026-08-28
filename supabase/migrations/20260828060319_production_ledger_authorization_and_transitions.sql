-- Production hardening: keep the existing model, but make financial history
-- complete and make administrative checks executable only for the caller itself.

create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  amount numeric(12,2) not null check (amount <> 0),
  balance_before numeric(12,2) not null,
  balance_after numeric(12,2) not null,
  transaction_type text not null check (transaction_type in ('SCRATCH_COST','SCRATCH_REWARD','DAILY_REWARD','ADMIN_ADJUSTMENT')),
  reference_type text not null,
  reference_id uuid not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(reference_type, reference_id, transaction_type)
);

create index if not exists credit_ledger_user_created_at_idx on public.credit_ledger(user_id, created_at desc);
alter table public.credit_ledger enable row level security;
grant select on public.credit_ledger to authenticated;
revoke insert, update, delete on public.credit_ledger from anon, authenticated;
create policy "read own credit ledger" on public.credit_ledger for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.is_admin(_user_id uuid)
returns boolean language plpgsql stable security definer set search_path=public as $$
begin
  if auth.uid() is null or auth.uid() <> _user_id then
    return false;
  end if;
  return exists (select 1 from public.profiles where id=_user_id and is_admin=true);
end;
$$;
revoke all on function public.is_admin(uuid) from public, anon;
grant execute on function public.is_admin(uuid) to authenticated;

create or replace function public.play_scratchcard_v1(p_card_id uuid, p_client_request_id uuid, p_source text default 'web')
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_user uuid := auth.uid();
  v_card scratchcards%rowtype;
  v_version scratch_math_versions%rowtype;
  v_outcome scratch_outcomes%rowtype;
  v_total numeric;
  v_pick numeric;
  v_cursor numeric := 0;
  v_play plays%rowtype;
  v_balance_before numeric(12,2);
  v_balance_after numeric(12,2);
  v_points_before integer;
  v_points_after integer;
begin
  if v_user is null or p_client_request_id is null then raise exception 'Usuário e requisição são obrigatórios'; end if;
  select * into v_play from plays where user_id=v_user and client_request_id=p_client_request_id limit 1;
  if found then
    return jsonb_build_object('id',v_play.id,'prize',v_play.prize,'points_earned',v_play.points_earned,'idempotent',true);
  end if;
  select * into v_card from scratchcards where id=p_card_id and active=true for update;
  if not found then raise exception 'Raspadinha indisponível'; end if;
  select * into v_version from scratch_math_versions where scratchcard_id=p_card_id and status='PUBLISHED' order by published_at desc limit 1;
  if not found then raise exception 'Raspadinha sem versão matemática publicada'; end if;
  select coalesce(sum(weight),0) into v_total from scratch_outcomes where math_version_id=v_version.id;
  if v_total <= 0 then raise exception 'Versão matemática inválida'; end if;
  select balance, points into v_balance_before, v_points_before from profiles where id=v_user for update;
  if coalesce(v_balance_before,0) < v_card.price then raise exception 'Saldo insuficiente'; end if;
  v_pick := floor(random() * v_total) + 1;
  for v_outcome in select * from scratch_outcomes where math_version_id=v_version.id order by id loop
    v_cursor := v_cursor + v_outcome.weight;
    if v_pick <= v_cursor then exit; end if;
  end loop;
  update profiles
     set balance=balance-v_card.price+v_outcome.prize,
         points=points+v_outcome.points
   where id=v_user
   returning balance,points into v_balance_after,v_points_after;
  insert into plays(user_id,card_id,price,prize,points_earned,math_version_id,client_request_id,outcome_id,source)
  values(v_user,p_card_id,v_card.price,v_outcome.prize,v_outcome.points,v_version.id,p_client_request_id,v_outcome.id,left(coalesce(p_source,'web'),32))
  returning * into v_play;
  insert into credit_ledger(user_id,amount,balance_before,balance_after,transaction_type,reference_type,reference_id,metadata)
  values(v_user,-v_card.price,v_balance_before,v_balance_before-v_card.price,'SCRATCH_COST','play',v_play.id,jsonb_build_object('card_id',v_card.id));
  if v_outcome.prize > 0 then
    insert into credit_ledger(user_id,amount,balance_before,balance_after,transaction_type,reference_type,reference_id,metadata)
    values(v_user,v_outcome.prize,v_balance_before-v_card.price,v_balance_after,'SCRATCH_REWARD','play',v_play.id,jsonb_build_object('outcome_id',v_outcome.id));
  end if;
  if v_outcome.points > 0 then
    insert into points_ledger(user_id,amount,balance_before,balance_after,transaction_type,reference_type,reference_id,metadata)
    values(v_user,v_outcome.points,v_points_before,v_points_after,'SCRATCH_REWARD','play',v_play.id,jsonb_build_object('outcome_id',v_outcome.id));
  end if;
  return jsonb_build_object('id',v_play.id,'prize',v_outcome.prize,'points_earned',v_outcome.points,'new_balance',v_balance_after,'new_points',v_points_after,'math_version_id',v_version.id,'idempotent',false);
end;
$$;

create or replace function public.claim_daily_scratch_v1(p_card_id uuid, p_client_request_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_user uuid:=auth.uid();
  v_date date:=(now() at time zone 'America/Sao_Paulo')::date;
  v_claim daily_scratch_claims%rowtype;
  v_version scratch_math_versions%rowtype;
  v_outcome scratch_outcomes%rowtype;
  v_total numeric;
  v_pick numeric;
  v_cursor numeric:=0;
  v_play plays%rowtype;
  v_balance_before numeric(12,2);
  v_balance_after numeric(12,2);
  v_points_before integer;
  v_points_after integer;
begin
  if v_user is null or p_client_request_id is null then raise exception 'Requisição inválida'; end if;
  if not exists(select 1 from scratchcards where id=p_card_id and active=true and is_daily_eligible=true) then raise exception 'Raspadinha diária indisponível'; end if;
  insert into daily_scratch_claims(user_id,claim_date) values(v_user,v_date) on conflict(user_id,claim_date) do nothing returning * into v_claim;
  if not found then
    select * into v_claim from daily_scratch_claims where user_id=v_user and claim_date=v_date;
    if v_claim.scratch_play_id is not null then
      select * into v_play from plays where id=v_claim.scratch_play_id;
      return jsonb_build_object('id',v_play.id,'prize',v_play.prize,'points_earned',v_play.points_earned,'already_claimed',true);
    end if;
    raise exception 'Cortesia diária em processamento';
  end if;
  select * into v_version from scratch_math_versions where scratchcard_id=p_card_id and status='PUBLISHED' order by published_at desc limit 1;
  if not found then raise exception 'Raspadinha diária sem matemática publicada'; end if;
  select coalesce(sum(weight),0) into v_total from scratch_outcomes where math_version_id=v_version.id;
  if v_total<=0 then raise exception 'Matemática inválida'; end if;
  v_pick:=floor(random()*v_total)+1;
  for v_outcome in select * from scratch_outcomes where math_version_id=v_version.id order by id loop
    v_cursor:=v_cursor+v_outcome.weight;
    if v_pick<=v_cursor then exit; end if;
  end loop;
  select balance,points into v_balance_before,v_points_before from profiles where id=v_user for update;
  update profiles set balance=balance+v_outcome.prize, points=points+v_outcome.points where id=v_user returning balance,points into v_balance_after,v_points_after;
  insert into plays(user_id,card_id,price,prize,points_earned,math_version_id,client_request_id,outcome_id,source)
  values(v_user,p_card_id,0,v_outcome.prize,v_outcome.points,v_version.id,p_client_request_id,v_outcome.id,'daily') returning * into v_play;
  if v_outcome.prize > 0 then
    insert into credit_ledger(user_id,amount,balance_before,balance_after,transaction_type,reference_type,reference_id,metadata)
    values(v_user,v_outcome.prize,v_balance_before,v_balance_after,'DAILY_REWARD','play',v_play.id,jsonb_build_object('outcome_id',v_outcome.id));
  end if;
  if v_outcome.points > 0 then
    insert into points_ledger(user_id,amount,balance_before,balance_after,transaction_type,reference_type,reference_id,metadata)
    values(v_user,v_outcome.points,v_points_before,v_points_after,'DAILY_REWARD','play',v_play.id,jsonb_build_object('outcome_id',v_outcome.id));
  end if;
  update daily_scratch_claims set scratch_play_id=v_play.id where id=v_claim.id;
  return jsonb_build_object('id',v_play.id,'prize',v_play.prize,'points_earned',v_play.points_earned,'already_claimed',false);
end;
$$;

create or replace function public.admin_update_redemption_v1(p_redemption_id uuid,p_status text,p_fulfillment_code text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_admin uuid:=auth.uid();
  v_red redemptions%rowtype;
  v_before integer;
  v_after integer;
  v_previous text;
begin
  if v_admin is null or not is_admin(v_admin) then raise exception 'Sem permissão'; end if;
  if p_status not in ('APROVADO','PREPARANDO','DISPONIVEL','ENTREGUE','CANCELADO') then raise exception 'Status inválido'; end if;
  select * into v_red from redemptions where id=p_redemption_id for update;
  if not found then raise exception 'Resgate não encontrado'; end if;
  if p_status=v_red.status then return jsonb_build_object('id',v_red.id,'status',v_red.status,'idempotent',true); end if;
  if (v_red.status='SOLICITADO' and p_status not in ('APROVADO','CANCELADO'))
     or (v_red.status='APROVADO' and p_status not in ('PREPARANDO','CANCELADO'))
     or (v_red.status='PREPARANDO' and p_status not in ('DISPONIVEL','CANCELADO'))
     or (v_red.status='DISPONIVEL' and p_status not in ('ENTREGUE','CANCELADO'))
     or v_red.status in ('ENTREGUE','CANCELADO') then
    raise exception 'Transição de status inválida';
  end if;
  v_previous:=v_red.status;
  if p_status='CANCELADO' then
    select points into v_before from profiles where id=v_red.user_id for update;
    update profiles set points=points+v_red.points_spent where id=v_red.user_id returning points into v_after;
    insert into points_ledger(user_id,amount,balance_before,balance_after,transaction_type,reference_type,reference_id,metadata)
    values(v_red.user_id,v_red.points_spent,v_before,v_after,'REDEMPTION_REFUND','redemption',v_red.id,'{}') on conflict(reference_type,reference_id,transaction_type) do nothing;
    if found then update store_items set stock_available=stock_available+1,stock=stock_available+1 where id=v_red.item_id; end if;
  end if;
  update redemptions set status=p_status,fulfillment_code=coalesce(p_fulfillment_code,fulfillment_code),updated_at=now() where id=v_red.id returning * into v_red;
  insert into audit_logs(admin_id,action,entity_type,entity_id,before_data,after_data,metadata)
  values(v_admin,'redemption.status_changed','redemption',v_red.id,jsonb_build_object('status',v_previous),jsonb_build_object('status',v_red.status),jsonb_build_object('protocol',v_red.protocol));
  insert into admin_audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(v_admin,'redemption.status_changed','redemption',v_red.id,jsonb_build_object('status',p_status));
  return jsonb_build_object('id',v_red.id,'status',v_red.status,'protocol',v_red.protocol);
end;
$$;
