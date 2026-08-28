
REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.play_scratchcard(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.redeem_item(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.play_scratchcard(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_item(uuid) TO authenticated;
