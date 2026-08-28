create or replace function public.enforce_redemption_item_snapshot()
returns trigger
language plpgsql
set search_path to ''
as $$
declare
  v_title text;
  v_image text;
begin
  select s.title, s.image_url
  into v_title, v_image
  from public.store_items s
  where s.id = new.item_id;

  if not found then
    raise exception 'Item do resgate inexistente';
  end if;

  new.item_title_snapshot := v_title;
  new.item_image_url_snapshot := v_image;
  return new;
end;
$$;

drop trigger if exists enforce_redemption_item_snapshot_before_insert on public.redemptions;
create trigger enforce_redemption_item_snapshot_before_insert
before insert on public.redemptions
for each row
execute function public.enforce_redemption_item_snapshot();
