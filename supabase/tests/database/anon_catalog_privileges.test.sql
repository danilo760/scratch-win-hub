begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(1);

do $$
begin
  if has_table_privilege('anon', 'public.scratchcards', 'SELECT') then
    raise exception 'anon can still select public.scratchcards directly';
  end if;

  if has_table_privilege('anon', 'public.achievements', 'SELECT') then
    raise exception 'anon can still select public.achievements directly';
  end if;

  if not has_table_privilege('authenticated', 'public.scratchcards', 'SELECT') then
    raise exception 'authenticated lost select on public.scratchcards';
  end if;

  if has_table_privilege('authenticated', 'public.achievements', 'SELECT') then
    raise exception 'authenticated can still select public.achievements directly';
  end if;

  if not has_function_privilege('anon', 'public.get_transparency_v1()', 'EXECUTE') then
    raise exception 'anon lost public transparency RPC access';
  end if;

  if not has_function_privilege('anon', 'public.get_public_profile(text)', 'EXECUTE') then
    raise exception 'anon lost public profile RPC access';
  end if;

  if not has_function_privilege('authenticated', 'public.get_admin_operations_v1()', 'EXECUTE') then
    raise exception 'authenticated lost protected admin RPC access';
  end if;
end $$;

select extensions.pass('catalog grants match the rebuilt schema while public and protected RPC access remains available');
select * from extensions.finish();
rollback;
