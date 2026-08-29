-- Make Admin Master wallet adjustments safe against retries and concurrent duplicate submissions.
-- The legacy v1 RPC remains available during the frontend transition; the application moves to v2.

create table public.admin_adjustment_requests (
  actor_id uuid not null references auth.users(id),
  client_request_id uuid not null,
  user_id uuid not null references auth.users(id),
  balance_delta numeric not null,
  points_delta integer not null,
  reason text not null,
  reference_id uuid not null default gen_random_uuid(),
  result jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (actor_id, client_request_id),
  unique (reference_id),
  constraint admin_adjustment_requests_reason_check
    check (length(reason) between 1 and 240),
  constraint admin_adjustment_requests_completion_check
    check ((result is null) = (completed_at is null))
);

alter table public.admin_adjustment_requests enable row level security;
revoke all on table public.admin_adjustment_requests from public, anon, authenticated;

create or replace function public.admin_master_adjust_user_v2(
  p_user_id uuid,
  p_client_request_id uuid,
  p_balance_delta numeric default 0,
  p_points_delta integer default 0,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_before_balance numeric;
  v_after_balance numeric;
  v_before_points integer;
  v_after_points integer;
  v_balance_delta numeric := coalesce(p_balance_delta, 0);
  v_points_delta integer := coalesce(p_points_delta, 0);
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_request public.admin_adjustment_requests%rowtype;
  v_inserted boolean;
  v_result jsonb;
begin
  if v_actor is null or not public.is_admin_master(v_actor) then
    raise exception 'Sem permissão de admin master';
  end if;
  if p_user_id is null then raise exception 'Usuário obrigatório'; end if;
  if p_client_request_id is null then raise exception 'client_request_id obrigatório'; end if;
  if v_balance_delta = 0 and v_points_delta = 0 then
    raise exception 'Informe um ajuste diferente de zero';
  end if;
  if v_reason is null then raise exception 'Motivo do ajuste é obrigatório'; end if;
  if length(v_reason) > 240 then raise exception 'Motivo do ajuste deve ter no máximo 240 caracteres'; end if;

  insert into public.admin_adjustment_requests(
    actor_id,
    client_request_id,
    user_id,
    balance_delta,
    points_delta,
    reason
  ) values (
    v_actor,
    p_client_request_id,
    p_user_id,
    v_balance_delta,
    v_points_delta,
    v_reason
  )
  on conflict (actor_id, client_request_id) do nothing
  returning * into v_request;

  v_inserted := found;

  if not v_inserted then
    select * into v_request
    from public.admin_adjustment_requests
    where actor_id = v_actor
      and client_request_id = p_client_request_id
    for update;

    if not found then
      raise exception 'Não foi possível recuperar a requisição idempotente';
    end if;

    if v_request.user_id is distinct from p_user_id
       or v_request.balance_delta is distinct from v_balance_delta
       or v_request.points_delta is distinct from v_points_delta
       or v_request.reason is distinct from v_reason then
      raise exception 'client_request_id já utilizado com parâmetros diferentes';
    end if;

    if v_request.result is null then
      raise exception 'Ajuste idempotente incompleto; tente novamente';
    end if;

    return v_request.result;
  end if;

  select balance, points into v_before_balance, v_before_points
  from public.profiles
  where id = p_user_id
  for update;
  if not found then raise exception 'Usuário não encontrado'; end if;

  v_after_balance := v_before_balance + v_balance_delta;
  v_after_points := v_before_points + v_points_delta;
  if v_after_balance < 0 then raise exception 'Saldo não pode ficar negativo'; end if;
  if v_after_points < 0 then raise exception 'Pontos não podem ficar negativos'; end if;

  update public.profiles
  set balance = v_after_balance,
      points = v_after_points,
      updated_at = now()
  where id = p_user_id;

  if v_balance_delta <> 0 then
    insert into public.credit_ledger(
      user_id, amount, balance_before, balance_after,
      transaction_type, reference_type, reference_id, metadata
    ) values (
      p_user_id, v_balance_delta, v_before_balance, v_after_balance,
      'ADMIN_ADJUSTMENT', 'admin_adjustment', v_request.reference_id,
      jsonb_build_object(
        'actor_id', v_actor,
        'reason', v_reason,
        'client_request_id', p_client_request_id
      )
    );
  end if;

  if v_points_delta <> 0 then
    insert into public.points_ledger(
      user_id, amount, balance_before, balance_after,
      transaction_type, reference_type, reference_id, metadata
    ) values (
      p_user_id, v_points_delta, v_before_points, v_after_points,
      'ADMIN_ADJUSTMENT', 'admin_adjustment', v_request.reference_id,
      jsonb_build_object(
        'actor_id', v_actor,
        'reason', v_reason,
        'client_request_id', p_client_request_id
      )
    );
  end if;

  insert into public.audit_logs(admin_id, action, entity_type, entity_id, before_data, after_data, metadata)
  values (
    v_actor, 'user.wallet_adjusted', 'profile', p_user_id,
    jsonb_build_object('balance', v_before_balance, 'points', v_before_points),
    jsonb_build_object('balance', v_after_balance, 'points', v_after_points),
    jsonb_build_object(
      'reference_id', v_request.reference_id,
      'client_request_id', p_client_request_id,
      'reason', v_reason
    )
  );

  insert into public.admin_audit_logs(actor_id, action, entity_type, entity_id, metadata)
  values (
    v_actor, 'user.wallet_adjusted', 'profile', p_user_id,
    jsonb_build_object(
      'reference_id', v_request.reference_id,
      'client_request_id', p_client_request_id,
      'balance_delta', v_balance_delta,
      'points_delta', v_points_delta,
      'reason', v_reason
    )
  );

  v_result := jsonb_build_object(
    'user_id', p_user_id,
    'client_request_id', p_client_request_id,
    'reference_id', v_request.reference_id,
    'balance', v_after_balance,
    'points', v_after_points
  );

  update public.admin_adjustment_requests
  set result = v_result,
      completed_at = now()
  where actor_id = v_actor
    and client_request_id = p_client_request_id;

  return v_result;
end;
$$;

revoke all on function public.admin_master_adjust_user_v2(uuid, uuid, numeric, integer, text) from public, anon;
grant execute on function public.admin_master_adjust_user_v2(uuid, uuid, numeric, integer, text) to authenticated;
