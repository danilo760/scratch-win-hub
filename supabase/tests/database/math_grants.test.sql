begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(1);

do $$
declare
  t text;
  p text;
begin
  foreach t in array array['scratch_rarities','scratch_math_versions','scratch_outcomes'] loop
    foreach p in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
      if has_table_privilege('anon',format('public.%I',t),p) then
        raise exception 'anon unexpectedly has % on %',p,t;
      end if;
    end loop;

    if not has_table_privilege('authenticated',format('public.%I',t),'SELECT') then
      raise exception 'authenticated is missing SELECT on %',t;
    end if;

    foreach p in array array['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
      if has_table_privilege('authenticated',format('public.%I',t),p) then
        raise exception 'authenticated unexpectedly has % on %',p,t;
      end if;
    end loop;
  end loop;
end $$;

select extensions.pass('math tables expose read-only authenticated access and no direct anon or client mutation privileges');
select * from extensions.finish();
rollback;
