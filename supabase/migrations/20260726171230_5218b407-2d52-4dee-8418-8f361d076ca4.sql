REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.join_online_room(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_online_room(text, text) TO authenticated;