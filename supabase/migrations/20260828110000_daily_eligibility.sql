alter table public.scratchcards add column if not exists is_daily_eligible boolean not null default false;
create or replace function public.claim_daily_scratch_v1(p_card_id uuid, p_client_request_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_user uuid:=auth.uid(); v_date date:=(now() at time zone 'America/Sao_Paulo')::date; v_claim daily_scratch_claims%rowtype; v_version scratch_math_versions%rowtype; v_outcome scratch_outcomes%rowtype; v_total numeric; v_pick numeric; v_cursor numeric:=0; v_play plays%rowtype;
begin
 if v_user is null or p_client_request_id is null then raise exception 'Requisição inválida'; end if;
 if not exists(select 1 from scratchcards where id=p_card_id and active=true and is_daily_eligible=true) then raise exception 'Raspadinha diária indisponível'; end if;
 insert into daily_scratch_claims(user_id,claim_date) values(v_user,v_date) on conflict(user_id,claim_date) do nothing returning * into v_claim;
 if not found then select * into v_claim from daily_scratch_claims where user_id=v_user and claim_date=v_date; if v_claim.scratch_play_id is not null then select * into v_play from plays where id=v_claim.scratch_play_id; return jsonb_build_object('id',v_play.id,'prize',v_play.prize,'points_earned',v_play.points_earned,'already_claimed',true); end if; raise exception 'Cortesia diária em processamento'; end if;
 select * into v_version from scratch_math_versions where scratchcard_id=p_card_id and status='PUBLISHED' order by published_at desc limit 1; if not found then raise exception 'Raspadinha diária sem matemática publicada'; end if;
 select coalesce(sum(weight),0) into v_total from scratch_outcomes where math_version_id=v_version.id; if v_total<=0 then raise exception 'Matemática inválida'; end if;
 v_pick:=floor(random()*v_total)+1; for v_outcome in select * from scratch_outcomes where math_version_id=v_version.id order by id loop v_cursor:=v_cursor+v_outcome.weight; if v_pick<=v_cursor then exit; end if; end loop;
 update profiles set balance=balance+v_outcome.prize, points=points+v_outcome.points where id=v_user;
 insert into plays(user_id,card_id,price,prize,points_earned,math_version_id,client_request_id,outcome_id,source) values(v_user,p_card_id,0,v_outcome.prize,v_outcome.points,v_version.id,p_client_request_id,v_outcome.id,'daily') returning * into v_play;
 update daily_scratch_claims set scratch_play_id=v_play.id where id=v_claim.id;
 return jsonb_build_object('id',v_play.id,'prize',v_play.prize,'points_earned',v_play.points_earned,'already_claimed',false);
end; $$;
