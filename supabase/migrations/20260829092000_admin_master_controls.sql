-- Complete RBAC separation.
-- admin: operational read access, store and redemption operations.
-- admin_master: all admin capabilities, including cards, math, Daily, Mystery,
-- roles and audited wallet adjustments.
-- Historical plays and append-only ledgers remain immutable for every role.

create or replace function public.sync_admin_role_legacy_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.admin_role = 'user' and new.is_admin then
      new.admin_role := 'admin';
    else
      new.is_admin := new.admin_role in ('admin', 'admin_master');
    end if;
    return new;
  end if;

  if new.admin_role is distinct from old.admin_role then
    new.is_admin := new.admin_role in ('admin', 'admin_master');
  elsif new.is_admin is distinct from old.is_admin then
    if old.admin_role = 'admin_master' then
      new.admin_role := 'admin_master';
      new.is_admin := true;
    else
      new.admin_role := case when new.is_admin then 'admin' else 'user' end;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_admin_role_legacy on public.profiles;
create trigger sync_admin_role_legacy
before insert or update of is_admin, admin_role on public.profiles
for each row execute function public.sync_admin_role_legacy_v1();

revoke all on function public.sync_admin_role_legacy_v1() from public, anon, authenticated;

create or replace function public.get_admin_user_management_v1()
returns table (
  user_id uuid,
  email text,
  display_name text,
  balance numeric,
  points integer,
  is_admin boolean,
  admin_role text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null or not public.is_admin_master(v_actor) then
    raise exception 'Sem permissão de admin master';
  end if;

  return query
  select p.id, p.email, p.display_name, p.balance, p.points, p.is_admin, p.admin_role, p.created_at
  from public.profiles p
  order by p.created_at desc;
end;
$$;

revoke all on function public.get_admin_user_management_v1() from public, anon;
grant execute on function public.get_admin_user_management_v1() to authenticated;

create or replace function public.admin_master_adjust_user_v1(
  p_user_id uuid,
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
  v_ref uuid := gen_random_uuid();
  v_before_balance numeric;
  v_after_balance numeric;
  v_before_points integer;
  v_after_points integer;
  v_balance_delta numeric := coalesce(p_balance_delta, 0);
  v_points_delta integer := coalesce(p_points_delta, 0);
  v_reason text := nullif(left(trim(coalesce(p_reason, '')), 240), '');
begin
  if v_actor is null or not public.is_admin_master(v_actor) then
    raise exception 'Sem permissão de admin master';
  end if;
  if p_user_id is null then raise exception 'Usuário obrigatório'; end if;
  if v_balance_delta = 0 and v_points_delta = 0 then raise exception 'Informe um ajuste diferente de zero'; end if;
  if v_reason is null then raise exception 'Motivo do ajuste é obrigatório'; end if;

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
      'ADMIN_ADJUSTMENT', 'admin_adjustment', v_ref,
      jsonb_build_object('actor_id', v_actor, 'reason', v_reason)
    );
  end if;

  if v_points_delta <> 0 then
    insert into public.points_ledger(
      user_id, amount, balance_before, balance_after,
      transaction_type, reference_type, reference_id, metadata
    ) values (
      p_user_id, v_points_delta, v_before_points, v_after_points,
      'ADMIN_ADJUSTMENT', 'admin_adjustment', v_ref,
      jsonb_build_object('actor_id', v_actor, 'reason', v_reason)
    );
  end if;

  insert into public.audit_logs(admin_id, action, entity_type, entity_id, before_data, after_data, metadata)
  values (
    v_actor, 'user.wallet_adjusted', 'profile', p_user_id,
    jsonb_build_object('balance', v_before_balance, 'points', v_before_points),
    jsonb_build_object('balance', v_after_balance, 'points', v_after_points),
    jsonb_build_object('reference_id', v_ref, 'reason', v_reason)
  );

  insert into public.admin_audit_logs(actor_id, action, entity_type, entity_id, metadata)
  values (
    v_actor, 'user.wallet_adjusted', 'profile', p_user_id,
    jsonb_build_object(
      'reference_id', v_ref,
      'balance_delta', v_balance_delta,
      'points_delta', v_points_delta,
      'reason', v_reason
    )
  );

  return jsonb_build_object(
    'user_id', p_user_id,
    'reference_id', v_ref,
    'balance', v_after_balance,
    'points', v_after_points
  );
end;
$$;

revoke all on function public.admin_master_adjust_user_v1(uuid, numeric, integer, text) from public, anon;
grant execute on function public.admin_master_adjust_user_v1(uuid, numeric, integer, text) to authenticated;

-- Promote high-risk admin RPCs to master-only wrappers while preserving the
-- existing, already-tested transactional implementations as private internals.
alter function public.create_math_draft_v1(uuid, text, text)
  rename to create_math_draft_v1_master_internal;
create function public.create_math_draft_v1(p_card_id uuid, p_version_name text, p_rarity_slug text)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_admin_master(auth.uid()) then raise exception 'Sem permissão de admin master'; end if;
  return public.create_math_draft_v1_master_internal(p_card_id, p_version_name, p_rarity_slug);
end; $$;

alter function public.add_math_outcome_v1(uuid, text, numeric, integer, numeric)
  rename to add_math_outcome_v1_master_internal;
create function public.add_math_outcome_v1(p_math_version_id uuid, p_name text, p_prize numeric, p_points integer, p_weight numeric)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_admin_master(auth.uid()) then raise exception 'Sem permissão de admin master'; end if;
  return public.add_math_outcome_v1_master_internal(p_math_version_id, p_name, p_prize, p_points, p_weight);
end; $$;

alter function public.update_math_outcome_v1(uuid, text, numeric, integer, numeric)
  rename to update_math_outcome_v1_master_internal;
create function public.update_math_outcome_v1(p_outcome_id uuid, p_name text, p_prize numeric, p_points integer, p_weight numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_admin_master(auth.uid()) then raise exception 'Sem permissão de admin master'; end if;
  perform public.update_math_outcome_v1_master_internal(p_outcome_id, p_name, p_prize, p_points, p_weight);
end; $$;

alter function public.delete_math_outcome_v1(uuid)
  rename to delete_math_outcome_v1_master_internal;
create function public.delete_math_outcome_v1(p_outcome_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_admin_master(auth.uid()) then raise exception 'Sem permissão de admin master'; end if;
  perform public.delete_math_outcome_v1_master_internal(p_outcome_id);
end; $$;

alter function public.publish_math_version_v1(uuid)
  rename to publish_math_version_v1_master_internal;
create function public.publish_math_version_v1(p_math_version_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_admin_master(auth.uid()) then raise exception 'Sem permissão de admin master'; end if;
  return public.publish_math_version_v1_master_internal(p_math_version_id);
end; $$;

alter function public.admin_upsert_scratchcard_v1(text, numeric, boolean, boolean, uuid)
  rename to admin_upsert_scratchcard_v1_master_internal;
create function public.admin_upsert_scratchcard_v1(
  p_title text,
  p_price numeric,
  p_active boolean,
  p_is_daily_eligible boolean default false,
  p_id uuid default null
)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_admin_master(auth.uid()) then raise exception 'Sem permissão de admin master'; end if;
  return public.admin_upsert_scratchcard_v1_master_internal(p_title, p_price, p_active, p_is_daily_eligible, p_id);
end; $$;

alter function public.admin_set_daily_scratch_v1(uuid)
  rename to admin_set_daily_scratch_v1_master_internal;
create function public.admin_set_daily_scratch_v1(p_card_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_admin_master(auth.uid()) then raise exception 'Sem permissão de admin master'; end if;
  perform public.admin_set_daily_scratch_v1_master_internal(p_card_id);
end; $$;

alter function public.admin_clear_daily_scratch_v1()
  rename to admin_clear_daily_scratch_v1_master_internal;
create function public.admin_clear_daily_scratch_v1()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_admin_master(auth.uid()) then raise exception 'Sem permissão de admin master'; end if;
  perform public.admin_clear_daily_scratch_v1_master_internal();
end; $$;

alter function public.admin_create_mystery_draft_v1(text)
  rename to admin_create_mystery_draft_v1_master_internal;
create function public.admin_create_mystery_draft_v1(p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_admin_master(auth.uid()) then raise exception 'Sem permissão de admin master'; end if;
  return public.admin_create_mystery_draft_v1_master_internal(p_name);
end; $$;

alter function public.admin_add_mystery_entry_v1(uuid, uuid, numeric)
  rename to admin_add_mystery_entry_v1_master_internal;
create function public.admin_add_mystery_entry_v1(p_mystery_version_id uuid, p_scratchcard_id uuid, p_weight numeric)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_admin_master(auth.uid()) then raise exception 'Sem permissão de admin master'; end if;
  return public.admin_add_mystery_entry_v1_master_internal(p_mystery_version_id, p_scratchcard_id, p_weight);
end; $$;

alter function public.admin_update_mystery_entry_v1(uuid, numeric)
  rename to admin_update_mystery_entry_v1_master_internal;
create function public.admin_update_mystery_entry_v1(p_entry_id uuid, p_weight numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_admin_master(auth.uid()) then raise exception 'Sem permissão de admin master'; end if;
  perform public.admin_update_mystery_entry_v1_master_internal(p_entry_id, p_weight);
end; $$;

alter function public.admin_delete_mystery_entry_v1(uuid)
  rename to admin_delete_mystery_entry_v1_master_internal;
create function public.admin_delete_mystery_entry_v1(p_entry_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_admin_master(auth.uid()) then raise exception 'Sem permissão de admin master'; end if;
  perform public.admin_delete_mystery_entry_v1_master_internal(p_entry_id);
end; $$;

alter function public.admin_publish_mystery_v1(uuid)
  rename to admin_publish_mystery_v1_master_internal;
create function public.admin_publish_mystery_v1(p_mystery_version_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_admin_master(auth.uid()) then raise exception 'Sem permissão de admin master'; end if;
  return public.admin_publish_mystery_v1_master_internal(p_mystery_version_id);
end; $$;

-- Internal functions are not part of the Data API. Only the owner-side wrappers
-- may invoke them.
revoke all on function public.create_math_draft_v1_master_internal(uuid, text, text) from public, anon, authenticated;
revoke all on function public.add_math_outcome_v1_master_internal(uuid, text, numeric, integer, numeric) from public, anon, authenticated;
revoke all on function public.update_math_outcome_v1_master_internal(uuid, text, numeric, integer, numeric) from public, anon, authenticated;
revoke all on function public.delete_math_outcome_v1_master_internal(uuid) from public, anon, authenticated;
revoke all on function public.publish_math_version_v1_master_internal(uuid) from public, anon, authenticated;
revoke all on function public.admin_upsert_scratchcard_v1_master_internal(text, numeric, boolean, boolean, uuid) from public, anon, authenticated;
revoke all on function public.admin_set_daily_scratch_v1_master_internal(uuid) from public, anon, authenticated;
revoke all on function public.admin_clear_daily_scratch_v1_master_internal() from public, anon, authenticated;
revoke all on function public.admin_create_mystery_draft_v1_master_internal(text) from public, anon, authenticated;
revoke all on function public.admin_add_mystery_entry_v1_master_internal(uuid, uuid, numeric) from public, anon, authenticated;
revoke all on function public.admin_update_mystery_entry_v1_master_internal(uuid, numeric) from public, anon, authenticated;
revoke all on function public.admin_delete_mystery_entry_v1_master_internal(uuid) from public, anon, authenticated;
revoke all on function public.admin_publish_mystery_v1_master_internal(uuid) from public, anon, authenticated;

-- Expose only the guarded wrapper signatures to signed-in clients.
revoke all on function public.create_math_draft_v1(uuid, text, text) from public, anon;
grant execute on function public.create_math_draft_v1(uuid, text, text) to authenticated;
revoke all on function public.add_math_outcome_v1(uuid, text, numeric, integer, numeric) from public, anon;
grant execute on function public.add_math_outcome_v1(uuid, text, numeric, integer, numeric) to authenticated;
revoke all on function public.update_math_outcome_v1(uuid, text, numeric, integer, numeric) from public, anon;
grant execute on function public.update_math_outcome_v1(uuid, text, numeric, integer, numeric) to authenticated;
revoke all on function public.delete_math_outcome_v1(uuid) from public, anon;
grant execute on function public.delete_math_outcome_v1(uuid) to authenticated;
revoke all on function public.publish_math_version_v1(uuid) from public, anon;
grant execute on function public.publish_math_version_v1(uuid) to authenticated;
revoke all on function public.admin_upsert_scratchcard_v1(text, numeric, boolean, boolean, uuid) from public, anon;
grant execute on function public.admin_upsert_scratchcard_v1(text, numeric, boolean, boolean, uuid) to authenticated;
revoke all on function public.admin_set_daily_scratch_v1(uuid) from public, anon;
grant execute on function public.admin_set_daily_scratch_v1(uuid) to authenticated;
revoke all on function public.admin_clear_daily_scratch_v1() from public, anon;
grant execute on function public.admin_clear_daily_scratch_v1() to authenticated;
revoke all on function public.admin_create_mystery_draft_v1(text) from public, anon;
grant execute on function public.admin_create_mystery_draft_v1(text) to authenticated;
revoke all on function public.admin_add_mystery_entry_v1(uuid, uuid, numeric) from public, anon;
grant execute on function public.admin_add_mystery_entry_v1(uuid, uuid, numeric) to authenticated;
revoke all on function public.admin_update_mystery_entry_v1(uuid, numeric) from public, anon;
grant execute on function public.admin_update_mystery_entry_v1(uuid, numeric) to authenticated;
revoke all on function public.admin_delete_mystery_entry_v1(uuid) from public, anon;
grant execute on function public.admin_delete_mystery_entry_v1(uuid) to authenticated;
revoke all on function public.admin_publish_mystery_v1(uuid) from public, anon;
grant execute on function public.admin_publish_mystery_v1(uuid) to authenticated;

-- Include the explicit role in the existing operational snapshot so UI and
-- audit tooling no longer infer permissions from is_admin.
create or replace function public.get_admin_operations_v1()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
begin
  if v_admin is null or not public.is_admin(v_admin) then raise exception 'Sem permissão'; end if;

  return jsonb_build_object(
    'scratchcards', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',c.id,'title',c.title,'price',c.price,'active',c.active,
        'is_daily_eligible',c.is_daily_eligible,'created_at',c.created_at,'updated_at',c.updated_at,
        'published_version_id',v.id,'published_version_name',v.version_name,
        'rarity_slug',r.slug,'rarity_name',r.name
      ) order by c.created_at desc),'[]'::jsonb)
      from public.scratchcards c
      left join lateral (
        select mv.id,mv.version_name,mv.rarity_id
        from public.scratch_math_versions mv
        where mv.scratchcard_id=c.id and mv.status='PUBLISHED'
        order by mv.published_at desc nulls last,mv.created_at desc,mv.id desc limit 1
      ) v on true
      left join public.scratch_rarities r on r.id=v.rarity_id
    ),
    'store_items', (
      select coalesce(jsonb_agg(to_jsonb(s) order by s.display_order,s.created_at),'[]'::jsonb)
      from public.store_items s
    ),
    'redemptions', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',rd.id,'protocol',rd.protocol,'user_id',rd.user_id,
        'user_email',p.email,'user_name',p.display_name,'item_id',rd.item_id,
        'item_title',coalesce(rd.item_title_snapshot,s.title),
        'points_spent',rd.points_spent,'status',rd.status,'fulfillment_code',rd.fulfillment_code,
        'created_at',rd.created_at,'updated_at',rd.updated_at
      ) order by rd.created_at desc),'[]'::jsonb)
      from public.redemptions rd
      left join public.profiles p on p.id=rd.user_id
      left join public.store_items s on s.id=rd.item_id
    ),
    'achievements', (
      select coalesce(jsonb_agg(to_jsonb(a) order by a.sort_order,a.name),'[]'::jsonb)
      from public.achievements a
    ),
    'users', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',p.id,'email',p.email,'display_name',p.display_name,'public_slug',p.public_slug,
        'balance',p.balance,'points',p.points,'xp',p.xp,'level',p.level,'is_admin',p.is_admin,
        'admin_role',p.admin_role,'created_at',p.created_at
      ) order by p.created_at desc),'[]'::jsonb)
      from public.profiles p
    ),
    'credit_ledger', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb)
      from (select * from public.credit_ledger order by created_at desc limit 200) x
    ),
    'points_ledger', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb)
      from (select * from public.points_ledger order by created_at desc limit 200) x
    ),
    'audit_logs', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb)
      from (select * from public.audit_logs order by created_at desc limit 200) x
    ),
    'mystery_versions', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',mv.id,'name',mv.name,'status',mv.status,'published_at',mv.published_at,'created_at',mv.created_at,
        'entries',(
          select coalesce(jsonb_agg(jsonb_build_object(
            'id',me.id,'scratchcard_id',me.scratchcard_id,'scratchcard_title',c.title,'weight',me.weight
          ) order by me.id),'[]'::jsonb)
          from public.mystery_version_entries me
          join public.scratchcards c on c.id=me.scratchcard_id
          where me.mystery_version_id=mv.id
        )
      ) order by mv.created_at desc),'[]'::jsonb)
      from public.mystery_versions mv
    )
  );
end;
$$;
