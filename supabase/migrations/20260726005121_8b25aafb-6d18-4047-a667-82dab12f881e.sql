REVOKE ALL ON FUNCTION public.is_online_room_member(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.is_online_room_host(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.join_online_room(text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_online_room_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_online_room_host(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_online_room(text, text) TO authenticated;