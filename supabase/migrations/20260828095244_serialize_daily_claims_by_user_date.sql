create or replace function public.claim_daily_scratch_v2(p_client_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_date date := (now() at time zone 'America/Sao_Paulo')::date;
  v_card_id uuid;
begin
  if v_user is null or p_client_request_id is null then
    raise exception 'Requisição inválida';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('daily:' || v_user::text || ':' || v_date::text, 0)
  );

  select c.id into v_card_id
  from public.scratchcards c
  where c.active = true
    and c.is_daily_eligible = true
    and exists (
      select 1
      from public.scratch_math_versions mv
      where mv.scratchcard_id = c.id
        and mv.status = 'PUBLISHED'
    )
  order by c.updated_at desc, c.id desc
  limit 1;

  if v_card_id is null then
    raise exception 'Raspadinha diária indisponível';
  end if;

  return public.claim_daily_scratch_v1(v_card_id, p_client_request_id);
end;
$function$;