-- Make the join RPC authoritative: it validates everything itself.
CREATE OR REPLACE FUNCTION public.join_online_room(p_code text, p_name text)
RETURNS public.online_players
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

  INSERT INTO public.online_players (room_id, user_id, name, is_host, is_ready, turn_order, score, steal_tokens)
  VALUES (
    v_room.id,
    auth.uid(),
    COALESCE(NULLIF(left(btrim(p_name), 20), ''), 'Player'),
    v_room.host_user_id = auth.uid(),
    v_room.host_user_id = auth.uid(),
    v_room.player_count,
    0,
    3
  )
  RETURNING * INTO v_player;

  RETURN v_player;
END;
$function$;

REVOKE ALL ON FUNCTION public.join_online_room(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_online_room(text, text) TO authenticated, service_role;

-- Simplify the direct INSERT policy so a signed-in user can always add themselves.
DROP POLICY IF EXISTS "Players can join a lobby as themselves" ON public.online_players;
CREATE POLICY "Players can join a lobby as themselves"
ON public.online_players FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND private.can_join_online_room(room_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.online_players TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.online_rooms TO authenticated;
GRANT ALL ON public.online_players TO service_role;
GRANT ALL ON public.online_rooms TO service_role;