create or replace function public.get_scratchcard_popularity_v1()
returns table (card_id uuid, play_count bigint)
language sql
stable
security definer
set search_path = 'public'
as $function$
  select p.card_id, count(*)::bigint as play_count
  from public.plays p
  where auth.uid() is not null
  group by p.card_id
  order by play_count desc, p.card_id
  limit 4;
$function$;

revoke all on function public.get_scratchcard_popularity_v1() from public, anon;
grant execute on function public.get_scratchcard_popularity_v1() to authenticated;
