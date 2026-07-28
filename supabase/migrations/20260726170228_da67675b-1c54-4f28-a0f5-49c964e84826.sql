CREATE POLICY "Hosts can create rooms"
ON public.online_rooms FOR INSERT TO authenticated
WITH CHECK (host_user_id = auth.uid());

CREATE POLICY "Hosts can view own rooms"
ON public.online_rooms FOR SELECT TO authenticated
USING (host_user_id = auth.uid());

CREATE POLICY "Hosts can update own rooms"
ON public.online_rooms FOR UPDATE TO authenticated
USING (host_user_id = auth.uid())
WITH CHECK (host_user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.online_rooms TO authenticated;
GRANT ALL ON public.online_rooms TO service_role;