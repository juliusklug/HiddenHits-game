-- Helper: is the current user a participant (host or player) of a room?
CREATE OR REPLACE FUNCTION public.is_online_room_member(_room_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.online_rooms r
    WHERE r.id = _room_id AND r.host_user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.online_players p
    WHERE p.room_id = _room_id AND p.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_online_room_host(_room_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.online_rooms r
    WHERE r.id = _room_id AND r.host_user_id = auth.uid()
  );
$$;

-- Secure join: resolves the room by code and inserts the caller as a player.
CREATE OR REPLACE FUNCTION public.join_online_room(p_code text, p_name text)
RETURNS public.online_players
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.online_rooms;
  v_count int;
  v_existing public.online_players;
  v_player public.online_players;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to play online.';
  END IF;

  SELECT * INTO v_room FROM public.online_rooms WHERE code = upper(p_code);
  IF v_room IS NULL THEN
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

  SELECT count(*) INTO v_count FROM public.online_players WHERE room_id = v_room.id;
  IF v_count >= 8 THEN
    RAISE EXCEPTION 'That game is full (8 players max).';
  END IF;

  INSERT INTO public.online_players (room_id, user_id, name, is_host, is_ready, turn_order)
  VALUES (
    v_room.id,
    auth.uid(),
    COALESCE(NULLIF(left(btrim(p_name), 20), ''), 'Player'),
    v_room.host_user_id = auth.uid(),
    v_room.host_user_id = auth.uid(),
    v_count
  )
  RETURNING * INTO v_player;

  RETURN v_player;
END;
$$;

REVOKE ALL ON FUNCTION public.join_online_room(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.join_online_room(text, text) TO authenticated;

-- Rooms policies
DROP POLICY IF EXISTS "Anyone can view rooms" ON public.online_rooms;
DROP POLICY IF EXISTS "Anyone can create rooms" ON public.online_rooms;
DROP POLICY IF EXISTS "Anyone can update rooms" ON public.online_rooms;

CREATE POLICY "Participants can view their rooms" ON public.online_rooms
  FOR SELECT TO authenticated
  USING (public.is_online_room_member(id));

CREATE POLICY "Signed-in users can host rooms" ON public.online_rooms
  FOR INSERT TO authenticated
  WITH CHECK (host_user_id = auth.uid());

CREATE POLICY "Participants can update their rooms" ON public.online_rooms
  FOR UPDATE TO authenticated
  USING (public.is_online_room_member(id))
  WITH CHECK (public.is_online_room_member(id));

REVOKE ALL ON public.online_rooms FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.online_rooms TO authenticated;

-- Players policies
DROP POLICY IF EXISTS "Anyone can view players" ON public.online_players;
DROP POLICY IF EXISTS "Anyone can join as player" ON public.online_players;
DROP POLICY IF EXISTS "Anyone can update players" ON public.online_players;
DROP POLICY IF EXISTS "Anyone can remove players" ON public.online_players;

CREATE POLICY "Participants can view players in their room" ON public.online_players
  FOR SELECT TO authenticated
  USING (public.is_online_room_member(room_id));

CREATE POLICY "Participants can update players in their room" ON public.online_players
  FOR UPDATE TO authenticated
  USING (public.is_online_room_member(room_id))
  WITH CHECK (public.is_online_room_member(room_id));

CREATE POLICY "Players can leave and hosts can remove" ON public.online_players
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_online_room_host(room_id));

REVOKE ALL ON public.online_players FROM anon;
GRANT SELECT, UPDATE, DELETE ON public.online_players TO authenticated;