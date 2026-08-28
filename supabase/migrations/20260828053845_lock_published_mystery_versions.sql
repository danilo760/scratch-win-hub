create or replace function public.prevent_published_mystery_mutation() returns trigger language plpgsql set search_path=public as $$
begin
  if tg_table_name = 'mystery_versions' and old.status = 'PUBLISHED' then
    raise exception 'Versão misteriosa publicada é imutável';
  end if;
  if tg_table_name = 'mystery_version_entries' and exists (
    select 1 from mystery_versions where id=coalesce(old.mystery_version_id,new.mystery_version_id) and status='PUBLISHED'
  ) then
    raise exception 'Participantes de versão misteriosa publicada são imutáveis';
  end if;
  return coalesce(new,old);
end; $$;
drop trigger if exists mystery_version_immutable on public.mystery_versions;
create trigger mystery_version_immutable before update or delete on public.mystery_versions for each row execute function public.prevent_published_mystery_mutation();
drop trigger if exists mystery_entries_immutable on public.mystery_version_entries;
create trigger mystery_entries_immutable before insert or update or delete on public.mystery_version_entries for each row execute function public.prevent_published_mystery_mutation();
