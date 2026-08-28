revoke all on function public.award_achievement(uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.apply_play_progression() from public,anon,authenticated;
create or replace function public.prevent_audit_log_mutation() returns trigger language plpgsql set search_path=public as $$ begin raise exception 'Audit logs são append-only'; end; $$;
do $$
declare c record; v_id uuid;
begin
 for c in select s.id,s.title,s.points_reward from scratchcards s where s.active and not exists(select 1 from scratch_math_versions m where m.scratchcard_id=s.id and m.status='PUBLISHED') loop
   insert into scratch_math_versions(scratchcard_id,rarity_id,version_name,status,config) values(c.id,(select id from scratch_rarities where slug='bronze'),'LEGACY-'||left(c.id::text,8),'DRAFT',jsonb_build_object('seeded_from','legacy')) returning id into v_id;
   insert into scratch_outcomes(math_version_id,name,prize,points,weight) values(v_id,'Sem prêmio',0,0,70),(v_id,'Prêmio padrão',0,c.points_reward,30);
   update scratch_math_versions set status='PUBLISHED',published_at=now() where id=v_id;
 end loop;
end $$;
revoke all on function public.play_scratchcard(uuid) from public,anon,authenticated;
revoke all on function public.redeem_item(uuid) from public,anon,authenticated;
