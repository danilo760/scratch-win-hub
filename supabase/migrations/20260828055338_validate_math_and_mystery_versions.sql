create or replace function public.guard_math_version_lifecycle() returns trigger language plpgsql set search_path=public as $$
begin
 if tg_op='UPDATE' and old.status='PUBLISHED' then
   if new.status='RETIRED' and (to_jsonb(new)-'status'-'published_at')=(to_jsonb(old)-'status'-'published_at') then return new; end if;
   raise exception 'Versão matemática publicada é imutável; crie uma nova DRAFT';
 end if;
 if new.status='PUBLISHED' then
   if not exists(select 1 from scratch_outcomes where math_version_id=new.id) then raise exception 'Não é possível publicar versão sem resultados'; end if;
   if exists(select 1 from scratch_outcomes where math_version_id=new.id and weight<=0) then raise exception 'Todos os resultados precisam ter peso positivo'; end if;
   new.published_at:=coalesce(new.published_at,now()); new.published_by:=coalesce(new.published_by,auth.uid());
 end if;
 return new;
end; $$;
create or replace function public.guard_published_math_outcomes() returns trigger language plpgsql set search_path=public as $$
declare v_version uuid;
begin
 v_version:=case when tg_op='DELETE' then old.math_version_id else new.math_version_id end;
 if exists(select 1 from scratch_math_versions where id=v_version and status='PUBLISHED') then raise exception 'Resultados de versão publicada são imutáveis'; end if;
 if tg_op='DELETE' then return old; end if; return new;
end; $$;
drop trigger if exists math_version_lifecycle on public.scratch_math_versions;
create trigger math_version_lifecycle before update on public.scratch_math_versions for each row execute function public.guard_math_version_lifecycle();
drop trigger if exists published_math_outcomes_immutable on public.scratch_outcomes;
create trigger published_math_outcomes_immutable before insert or update or delete on public.scratch_outcomes for each row execute function public.guard_published_math_outcomes();
create or replace function public.guard_mystery_version_publish() returns trigger language plpgsql set search_path=public as $$
begin
 if new.status='PUBLISHED' then
   if not exists(select 1 from mystery_version_entries where mystery_version_id=new.id) then raise exception 'Não é possível publicar pool misterioso vazio'; end if;
   if exists(select 1 from mystery_version_entries e where e.mystery_version_id=new.id and (e.weight<=0 or not exists(select 1 from scratch_math_versions m where m.scratchcard_id=e.scratchcard_id and m.status='PUBLISHED'))) then raise exception 'Pool misterioso possui participante inválido'; end if;
   new.published_at:=coalesce(new.published_at,now()); new.published_by:=coalesce(new.published_by,auth.uid());
 end if;
 return new;
end; $$;
drop trigger if exists mystery_version_publish_guard on public.mystery_versions;
create trigger mystery_version_publish_guard before update on public.mystery_versions for each row execute function public.guard_mystery_version_publish();
