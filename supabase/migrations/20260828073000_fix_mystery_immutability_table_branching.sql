create or replace function public.prevent_published_mystery_mutation()
returns trigger
language plpgsql
set search_path = 'public'
as $function$
declare
  v_version uuid;
begin
  if tg_table_name = 'mystery_versions' then
    if old.status = 'PUBLISHED' then
      raise exception 'Versão misteriosa publicada é imutável';
    end if;

    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_table_name = 'mystery_version_entries' then
    if tg_op = 'DELETE' then
      v_version := old.mystery_version_id;
      if exists (
        select 1 from public.mystery_versions
        where id = v_version and status = 'PUBLISHED'
      ) then
        raise exception 'Participantes de versão misteriosa publicada são imutáveis';
      end if;
      return old;
    end if;

    if tg_op = 'INSERT' then
      v_version := new.mystery_version_id;
      if exists (
        select 1 from public.mystery_versions
        where id = v_version and status = 'PUBLISHED'
      ) then
        raise exception 'Participantes de versão misteriosa publicada são imutáveis';
      end if;
      return new;
    end if;

    if tg_op = 'UPDATE' then
      if exists (
        select 1 from public.mystery_versions
        where id in (old.mystery_version_id, new.mystery_version_id)
          and status = 'PUBLISHED'
      ) then
        raise exception 'Participantes de versão misteriosa publicada são imutáveis';
      end if;
      return new;
    end if;
  end if;

  raise exception 'Tabela/operação inesperada no guard de Misteriosa: %.%', tg_table_name, tg_op;
end;
$function$;
