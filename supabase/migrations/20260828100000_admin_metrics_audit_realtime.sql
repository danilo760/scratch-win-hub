create table if not exists public.audit_logs (
 id uuid primary key default gen_random_uuid(), admin_id uuid references auth.users(id), action text not null, entity_type text not null, entity_id uuid not null,
 before_data jsonb, after_data jsonb, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
alter table public.audit_logs enable row level security;
create policy "admins read audit logs" on public.audit_logs for select to authenticated using (is_admin((select auth.uid())));
revoke insert,update,delete on public.audit_logs from authenticated;
create or replace function public.prevent_audit_log_mutation() returns trigger language plpgsql as $$ begin raise exception 'Audit logs são append-only'; end; $$;
drop trigger if exists audit_logs_append_only on public.audit_logs;
create trigger audit_logs_append_only before update or delete on public.audit_logs for each row execute function public.prevent_audit_log_mutation();
create or replace function public.get_admin_dashboard_v1() returns jsonb language plpgsql security definer set search_path=public as $$
declare v_admin uuid:=auth.uid(); v_today timestamptz:=date_trunc('day',now());
begin
 if v_admin is null or not is_admin(v_admin) then raise exception 'Sem permissão'; end if;
 return jsonb_build_object(
  'cards',jsonb_build_object('plays_today',(select count(*) from plays where created_at>=v_today),'winning_results',(select count(*) from plays where created_at>=v_today and (prize>0 or points_earned>0)),'points_distributed',(select coalesce(sum(points_earned),0) from plays where created_at>=v_today),'points_used',(select coalesce(abs(sum(amount)),0) from points_ledger where created_at>=v_today and transaction_type='REDEMPTION'),'pending_redemptions',(select count(*) from redemptions where status='SOLICITADO'),'low_stock',(select count(*) from store_items where active=true and stock_available between 1 and 3),'active_users',(select count(distinct user_id) from plays where created_at>=v_today),'daily_claims',(select count(*) from daily_scratch_claims where claim_date=(now() at time zone 'America/Sao_Paulo')::date)),
  'plays_by_day',(select coalesce(jsonb_agg(row_to_json(x) order by x.day),'[]'::jsonb) from (select created_at::date as day,count(*)::int as count from plays where created_at>=now()-interval '30 days' group by 1) x),
  'plays_by_rarity',(select coalesce(jsonb_agg(row_to_json(x)),'[]'::jsonb) from (select coalesce(r.name,'Não versionada') as rarity,count(*)::int as count from plays p left join scratch_math_versions v on v.id=p.math_version_id left join scratch_rarities r on r.id=v.rarity_id group by 1) x)
 );
end; $$;
create or replace function public.get_math_audit_v1(p_math_version_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_admin uuid:=auth.uid();
begin
 if v_admin is null or not is_admin(v_admin) then raise exception 'Sem permissão'; end if;
 return jsonb_build_object('version_id',p_math_version_id,'total_plays',(select count(*) from plays where math_version_id=p_math_version_id),'outcomes',(select coalesce(jsonb_agg(jsonb_build_object('outcome_id',o.id,'name',o.name,'points',o.points,'expected_percent',round(100*o.weight/nullif(sum(o.weight) over (),0),4),'observed_count',coalesce(p.cnt,0),'observed_percent',round(100*coalesce(p.cnt,0)/nullif((select count(*) from plays where math_version_id=p_math_version_id),0),4)) order by o.points),'[]'::jsonb) from scratch_outcomes o left join (select outcome_id,count(*) cnt from plays where math_version_id=p_math_version_id group by outcome_id) p on p.outcome_id=o.id where o.math_version_id=p_math_version_id));
end; $$;
create or replace function public.simulate_math_v1(p_math_version_id uuid,p_simulations integer) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_admin uuid:=auth.uid(); v_total numeric;
begin
 if v_admin is null or not is_admin(v_admin) then raise exception 'Sem permissão'; end if;
 if p_simulations not in (1000,10000,100000,1000000) then raise exception 'Quantidade inválida'; end if;
 select sum(weight) into v_total from scratch_outcomes where math_version_id=p_math_version_id; if coalesce(v_total,0)<=0 then raise exception 'Versão matemática inválida'; end if;
 return jsonb_build_object('simulations',p_simulations,'outcomes',(with samples as (select floor(random()*v_total)+1 as pick from generate_series(1,p_simulations)), buckets as (select o.id,o.name,o.points,o.weight,sum(o.weight) over(order by o.id) as edge from scratch_outcomes o where o.math_version_id=p_math_version_id) select coalesce(jsonb_agg(jsonb_build_object('outcome_id',b.id,'name',b.name,'count',x.count,'percent',round(100*x.count::numeric/p_simulations,4))),'[]'::jsonb) from buckets b join lateral (select count(*)::int from samples s where s.pick<=b.edge and s.pick>b.edge-b.weight) x(count) on true));
end; $$;
revoke all on function public.get_admin_dashboard_v1() from public,anon;
grant execute on function public.get_admin_dashboard_v1() to authenticated;
revoke all on function public.get_math_audit_v1(uuid) from public,anon;
grant execute on function public.get_math_audit_v1(uuid) to authenticated;
revoke all on function public.simulate_math_v1(uuid,integer) from public,anon;
grant execute on function public.simulate_math_v1(uuid,integer) to authenticated;
alter publication supabase_realtime add table public.store_items,public.redemptions,public.user_achievements,public.profiles;
