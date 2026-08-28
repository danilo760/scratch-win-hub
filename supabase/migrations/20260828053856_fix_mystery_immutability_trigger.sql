create or replace function public.prevent_published_mystery_mutation() returns trigger language plpgsql set search_path=public as $$
declare v_version uuid;
begin
  if tg_table_name = 'mystery_versions' and old.status = 'PUBLISHED' then
    raise exception 'Versão misteriosa publicada é imutável';
  end if;
  if tg_table_name = 'mystery_version_entries' then
    v_version := case when tg_op = 'DELETE' then old.mystery_version_id else new.mystery_version_id end;
    if exists (select 1 from mystery_versions where id=v_version and status='PUBLISHED') then
      raise exception 'Participantes de versão misteriosa publicada são imutáveis';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end; $$;
