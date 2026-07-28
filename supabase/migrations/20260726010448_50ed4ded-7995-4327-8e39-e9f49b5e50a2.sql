CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM anon, authenticated;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

-- Internal RLS helpers, moved out of the exposed API schema.
CREATE OR REPLACE FUNCTION private.is_online_room_host(_room_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.online_rooms r WHERE r.id = _room_id AND r.host_user_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION private.is_online_room_member(_room_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.online_rooms r WHERE r.id = _room_id AND r.host_user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.online_players p WHERE p.room_id = _room_id AND p.user_id = auth.uid());
$$;

-- Lobby lookup helpers used by the join flow (joining players are not members yet).
CREATE OR REPLACE FUNCTION private.online_room_for_join(_code text)
RETURNS TABLE (id uuid, host_user_id uuid, status text, player_count int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, r.host_user_id, r.status,
         (SELECT count(*)::int FROM public.online_players p WHERE p.room_id = r.id)
  FROM public.online_rooms r WHERE r.code = upper(_code);
$$;

CREATE OR REPLACE FUNCTION private.can_join_online_room(_room_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.online_rooms r
    WHERE r.id = _room_id
      AND r.status = 'lobby'
      AND (SELECT count(*) FROM public.online_players p WHERE p.room_id = r.id) < 8
  );
$$;

CREATE OR REPLACE FUNCTION private.online_room_is_host(_room_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.online_rooms r WHERE r.id = _room_id AND r.host_user_id = _user_id);
$$;

REVOKE ALL ON FUNCTION private.is_online_room_host(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_online_room_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.online_room_for_join(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.can_join_online_room(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.online_room_is_host(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_online_room_host(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_online_room_member(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.online_room_for_join(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.can_join_online_room(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.online_room_is_host(uuid, uuid) TO authenticated, service_role;

-- Repoint policies to the private helpers.
DROP POLICY IF EXISTS "Participants can view players in their room" ON public.online_players;
DROP POLICY IF EXISTS "Participants can update players in their room" ON public.online_players;
DROP POLICY IF EXISTS "Players can leave and hosts can remove" ON public.online_players;
DROP POLICY IF EXISTS "Participants can view their rooms" ON public.online_rooms;
DROP POLICY IF EXISTS "Participants can update their rooms" ON public.online_rooms;

CREATE POLICY "Participants can view players in their room" ON public.online_players
  FOR SELECT TO authenticated USING (private.is_online_room_member(room_id));
CREATE POLICY "Participants can update players in their room" ON public.online_players
  FOR UPDATE TO authenticated USING (private.is_online_room_member(room_id))
  WITH CHECK (private.is_online_room_member(room_id));
CREATE POLICY "Players can leave and hosts can remove" ON public.online_players
  FOR DELETE TO authenticated USING (user_id = auth.uid() OR private.is_online_room_host(room_id));
CREATE POLICY "Participants can view their rooms" ON public.online_rooms
  FOR SELECT TO authenticated USING (private.is_online_room_member(id));
CREATE POLICY "Participants can update their rooms" ON public.online_rooms
  FOR UPDATE TO authenticated USING (private.is_online_room_member(id))
  WITH CHECK (private.is_online_room_member(id));

-- A signed-in player may add only themselves, to a lobby that is not full.
DROP POLICY IF EXISTS "Players can join a lobby as themselves" ON public.online_players;
CREATE POLICY "Players can join a lobby as themselves" ON public.online_players
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND score = 0
    AND steal_tokens = 3
    AND private.can_join_online_room(room_id)
    AND (is_host = false OR private.online_room_is_host(room_id, auth.uid()))
  );

DROP FUNCTION IF EXISTS public.is_online_room_host(uuid);
DROP FUNCTION IF EXISTS public.is_online_room_member(uuid);

-- Join RPC now runs with the caller's own privileges (SECURITY INVOKER).
CREATE OR REPLACE FUNCTION public.join_online_room(p_code text, p_name text)
RETURNS public.online_players
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
DECLARE
  v_room record;
  v_existing public.online_players;
  v_player public.online_players;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to play online.';
  END IF;

  SELECT * INTO v_room FROM private.online_room_for_join(p_code);
  IF v_room.id IS NULL THEN
    RAISE EXCEPTION 'No game found with that code.';
  END IF;

  SELECT * INTO v_existing FROM public.online_players
   WHERE room_id = v_room.id AND user_id = auth.uid() LIMIT 1;
  IF v_existing.id IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  IF v_room.status <> 'lobby' THEN
    RAISE EXCEPTION 'That game has already started.';
  END IF;

  IF v_room.player_count >= 8 THEN
    RAISE EXCEPTION 'That game is full (8 players max).';
  END IF;

  INSERT INTO public.online_players (room_id, user_id, name, is_host, is_ready, turn_order)
  VALUES (
    v_room.id,
    auth.uid(),
    COALESCE(NULLIF(left(btrim(p_name), 20), ''), 'Player'),
    v_room.host_user_id = auth.uid(),
    v_room.host_user_id = auth.uid(),
    v_room.player_count
  )
  RETURNING * INTO v_player;

  RETURN v_player;
END;
$function$;

REVOKE ALL ON FUNCTION public.join_online_room(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_online_room(text, text) TO authenticated, service_role;