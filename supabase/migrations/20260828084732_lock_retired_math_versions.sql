create or replace function public.guard_math_version_lifecycle()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if tg_op = 'UPDATE' and old.status = 'PUBLISHED' then
    if new.status = 'RETIRED'
       and (to_jsonb(new) - 'status') = (to_jsonb(old) - 'status') then
      return new;
    end if;
    raise exception 'Versão matemática publicada é imutável; crie uma nova DRAFT';
  end if;

  if tg_op = 'UPDATE' and old.status = 'RETIRED' then
    raise exception 'Versão matemática aposentada é imutável';
  end if;

  if new.status = 'PUBLISHED' then
    if not exists(
      select 1 from public.scratch_outcomes where math_version_id = new.id
    ) then
      raise exception 'Não é possível publicar versão sem resultados';
    end if;
    if exists(
      select 1 from public.scratch_outcomes
      where math_version_id = new.id and weight <= 0
    ) then
      raise exception 'Todos os resultados precisam ter peso positivo';
    end if;
    new.published_at := coalesce(new.published_at, now());
    new.published_by := coalesce(new.published_by, auth.uid());
  end if;

  return new;
end;
$function$;

create or replace function public.guard_published_math_outcomes()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_version uuid;
begin
  v_version := case when tg_op = 'DELETE' then old.math_version_id else new.math_version_id end;

  if exists(
    select 1
    from public.scratch_math_versions
    where id = v_version
      and status in ('PUBLISHED','RETIRED')
  ) then
    raise exception 'Resultados de versão publicada ou aposentada são imutáveis';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;