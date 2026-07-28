-- Harden online multiplayer: game mutations go through SECURITY DEFINER RPCs.
-- Clients lose direct UPDATE on rooms/players and direct INSERT on players
-- (join remains via join_online_room). Room creation INSERT stays host-scoped
-- but locked to a clean lobby row.

/* ------------------------------------------------------------------ helpers */

CREATE OR REPLACE FUNCTION private.online_require_auth()
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to play online.';
  END IF;
  RETURN uid;
END;
$$;

CREATE OR REPLACE FUNCTION private.online_my_player(p_room_id uuid)
RETURNS public.online_players
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_player public.online_players;
BEGIN
  SELECT * INTO v_player
  FROM public.online_players
  WHERE room_id = p_room_id AND user_id = auth.uid()
  LIMIT 1;
  IF v_player.id IS NULL THEN
    RAISE EXCEPTION 'You are not in this game.';
  END IF;
  RETURN v_player;
END;
$$;

CREATE OR REPLACE FUNCTION private.online_card_year(p_card jsonb)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_card IS NULL OR p_card ->> 'year' IS NULL OR btrim(p_card ->> 'year') = '' THEN NULL
    ELSE (p_card ->> 'year')::integer
  END;
$$;

CREATE OR REPLACE FUNCTION private.online_is_placement_correct(
  p_timeline jsonb,
  p_card jsonb,
  p_slot_index integer
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  year integer := private.online_card_year(p_card);
  before_year integer;
  after_year integer;
  len integer;
BEGIN
  IF year IS NULL THEN
    RETURN false;
  END IF;
  len := COALESCE(jsonb_array_length(p_timeline), 0);
  IF p_slot_index < 0 OR p_slot_index > len THEN
    RETURN false;
  END IF;
  before_year := CASE
    WHEN p_slot_index > 0 THEN private.online_card_year(p_timeline -> (p_slot_index - 1))
    ELSE NULL
  END;
  after_year := CASE
    WHEN p_slot_index < len THEN private.online_card_year(p_timeline -> p_slot_index)
    ELSE NULL
  END;
  IF before_year IS NOT NULL AND year < before_year THEN
    RETURN false;
  END IF;
  IF after_year IS NOT NULL AND year > after_year THEN
    RETURN false;
  END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION private.online_normalize_guess(value text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  s text := lower(COALESCE(value, ''));
BEGIN
  s := translate(
    s,
    'àáâãäåāăąèéêëēĕėęěìíîïĩīĭįıòóôõöøōŏőùúûüũūŭůűųýÿŷñçćčďđłńňřśšťžźż',
    'aaaaaaaaaeeeeeeeeeeiiiiiiiiiooooooooouuuuuuuuuuyyyncccdlnnrssstzzz'
  );
  s := regexp_replace(s, '\([^)]*\)|\[[^\]]*\]', ' ', 'g');
  s := regexp_replace(s, '\s-\s.*$', ' ');
  s := regexp_replace(s, '\m(feat|ft|featuring|with)\M.*$', ' ', 'i');
  s := replace(s, '&', ' and ');
  s := regexp_replace(s, '[^a-z0-9]+', ' ', 'g');
  RETURN btrim(s);
END;
$$;

CREATE OR REPLACE FUNCTION private.online_is_guess_correct(p_guess text, p_truth text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT length(private.online_normalize_guess(p_guess)) > 0
     AND private.online_normalize_guess(p_guess) = private.online_normalize_guess(p_truth);
$$;

CREATE OR REPLACE FUNCTION private.online_sort_timeline(p_timeline jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    jsonb_agg(elem ORDER BY private.online_card_year(elem) NULLS LAST),
    '[]'::jsonb
  )
  FROM jsonb_array_elements(COALESCE(p_timeline, '[]'::jsonb)) AS elem;
$$;

CREATE OR REPLACE FUNCTION private.online_shuffle_jsonb(p_arr jsonb)
RETURNS jsonb
LANGUAGE sql
VOLATILE
AS $$
  SELECT COALESCE(
    jsonb_agg(elem ORDER BY random()),
    '[]'::jsonb
  )
  FROM jsonb_array_elements(COALESCE(p_arr, '[]'::jsonb)) AS elem;
$$;

REVOKE ALL ON FUNCTION private.online_require_auth() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.online_my_player(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.online_card_year(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.online_is_placement_correct(jsonb, jsonb, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.online_normalize_guess(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.online_is_guess_correct(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.online_sort_timeline(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.online_shuffle_jsonb(jsonb) FROM PUBLIC;

/* -------------------------------------------------------------- lobby ready */

CREATE OR REPLACE FUNCTION public.online_set_ready(p_player_id uuid, p_ready boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_player public.online_players;
  v_room public.online_rooms;
BEGIN
  PERFORM private.online_require_auth();

  SELECT * INTO v_player FROM public.online_players WHERE id = p_player_id;
  IF v_player.id IS NULL OR v_player.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'You can only update your own ready status.';
  END IF;

  SELECT * INTO v_room FROM public.online_rooms WHERE id = v_player.room_id FOR UPDATE;
  IF v_room.id IS NULL THEN
    RAISE EXCEPTION 'Room not found.';
  END IF;
  IF v_room.status <> 'lobby' THEN
    RAISE EXCEPTION 'Ready status can only change in the lobby.';
  END IF;

  UPDATE public.online_players
  SET is_ready = COALESCE(p_ready, false)
  WHERE id = v_player.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.online_set_steal_ready(p_player_id uuid, p_ready boolean DEFAULT true)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_player public.online_players;
  v_room public.online_rooms;
BEGIN
  PERFORM private.online_require_auth();

  SELECT * INTO v_player FROM public.online_players WHERE id = p_player_id;
  IF v_player.id IS NULL OR v_player.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'You can only mark yourself ready.';
  END IF;

  SELECT * INTO v_room FROM public.online_rooms WHERE id = v_player.room_id FOR UPDATE;
  IF v_room.id IS NULL OR v_room.phase <> 'stealing' THEN
    RAISE EXCEPTION 'Steal ready is only valid during the steal phase.';
  END IF;

  UPDATE public.online_players
  SET steal_ready = COALESCE(p_ready, true)
  WHERE id = v_player.id;
END;
$$;

/* ---------------------------------------------------------------- start game */

CREATE OR REPLACE FUNCTION public.online_start_game(p_room_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_room public.online_rooms;
  v_me public.online_players;
  v_count integer;
  v_not_ready integer;
  v_deck jsonb;
  v_player_ids uuid[];
  v_id uuid;
  v_i integer := 0;
  v_cursor integer := 0;
  v_start jsonb;
  v_first jsonb;
  v_len integer;
BEGIN
  PERFORM private.online_require_auth();

  SELECT * INTO v_room FROM public.online_rooms WHERE id = p_room_id FOR UPDATE;
  IF v_room.id IS NULL THEN
    RAISE EXCEPTION 'Room not found.';
  END IF;
  IF v_room.host_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the host can start the game.';
  END IF;
  IF v_room.status <> 'lobby' THEN
    RAISE EXCEPTION 'That game has already started.';
  END IF;

  v_me := private.online_my_player(p_room_id);

  SELECT count(*)::int,
         count(*) FILTER (WHERE NOT is_ready)::int
    INTO v_count, v_not_ready
  FROM public.online_players
  WHERE room_id = p_room_id;

  IF v_count < 2 THEN
    RAISE EXCEPTION 'You need at least 2 players.';
  END IF;
  IF v_not_ready > 0 THEN
    RAISE EXCEPTION 'All players must be ready.';
  END IF;

  v_deck := COALESCE(v_room.deck, '[]'::jsonb);
  v_len := jsonb_array_length(v_deck);
  IF v_len < v_count + 1 THEN
    RAISE EXCEPTION 'Not enough cards in the deck to start.';
  END IF;

  SELECT array_agg(id ORDER BY random())
    INTO v_player_ids
  FROM public.online_players
  WHERE room_id = p_room_id;

  FOREACH v_id IN ARRAY v_player_ids LOOP
    v_start := v_deck -> v_cursor;
    v_cursor := v_cursor + 1;
    UPDATE public.online_players
    SET turn_order = v_i,
        score = 0,
        steal_tokens = 3,
        steal_ready = false,
        timeline = CASE WHEN v_start IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(v_start) END
    WHERE id = v_id;
    v_i := v_i + 1;
  END LOOP;

  v_first := v_deck -> v_cursor;
  v_cursor := v_cursor + 1;

  UPDATE public.online_rooms
  SET status = 'playing',
      phase = 'playing',
      draw_index = v_cursor,
      current_card = v_first,
      current_player_id = v_player_ids[1],
      last_result = NULL,
      bonus_guess = NULL,
      pending_placement = NULL,
      steal = NULL,
      steal_ends_at = NULL,
      winner_player_id = NULL
  WHERE id = p_room_id;
END;
$$;

/* ---------------------------------------------------------------- place card */

CREATE OR REPLACE FUNCTION public.online_place_card(p_room_id uuid, p_slot_index integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_room public.online_rooms;
  v_me public.online_players;
  v_correct boolean;
  v_pending jsonb;
BEGIN
  PERFORM private.online_require_auth();

  SELECT * INTO v_room FROM public.online_rooms WHERE id = p_room_id FOR UPDATE;
  IF v_room.id IS NULL THEN
    RAISE EXCEPTION 'Room not found.';
  END IF;
  IF v_room.status <> 'playing' OR v_room.phase <> 'playing' THEN
    RAISE EXCEPTION 'You cannot place a card right now.';
  END IF;
  IF v_room.current_card IS NULL THEN
    RAISE EXCEPTION 'No song in play.';
  END IF;
  IF v_room.bonus_guess IS NULL THEN
    RAISE EXCEPTION 'Bonus guess required before placing.';
  END IF;

  v_me := private.online_my_player(p_room_id);
  IF v_room.current_player_id IS DISTINCT FROM v_me.id THEN
    RAISE EXCEPTION 'It is not your turn.';
  END IF;

  v_correct := private.online_is_placement_correct(v_me.timeline, v_room.current_card, p_slot_index);
  v_pending := jsonb_build_object(
    'playerId', v_me.id,
    'playerName', v_me.name,
    'slotIndex', p_slot_index,
    'correct', v_correct
  );

  UPDATE public.online_players
  SET steal_ready = false
  WHERE room_id = p_room_id;

  UPDATE public.online_rooms
  SET phase = 'stealing',
      pending_placement = v_pending,
      steal = NULL,
      steal_ends_at = now() + interval '10 seconds'
  WHERE id = p_room_id
    AND phase = 'playing';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'You cannot place a card right now.';
  END IF;
END;
$$;

/* ------------------------------------------------------------------- steal */

CREATE OR REPLACE FUNCTION public.online_submit_steal(p_room_id uuid, p_slot_index integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_room public.online_rooms;
  v_me public.online_players;
  v_correct boolean;
  v_attempt jsonb;
  v_updated integer;
BEGIN
  PERFORM private.online_require_auth();

  SELECT * INTO v_room FROM public.online_rooms WHERE id = p_room_id FOR UPDATE;
  IF v_room.id IS NULL THEN
    RAISE EXCEPTION 'Room not found.';
  END IF;
  IF v_room.phase <> 'stealing' OR v_room.current_card IS NULL THEN
    RAISE EXCEPTION 'No song in play.';
  END IF;

  v_me := private.online_my_player(p_room_id);
  IF v_room.current_player_id = v_me.id THEN
    RAISE EXCEPTION 'The active player cannot steal.';
  END IF;
  IF COALESCE(v_me.steal_tokens, 0) < 1 THEN
    RAISE EXCEPTION 'You have no steal tokens left.';
  END IF;
  IF v_room.steal IS NOT NULL THEN
    RAISE EXCEPTION 'Someone stole first!';
  END IF;

  v_correct := private.online_is_placement_correct(v_me.timeline, v_room.current_card, p_slot_index);
  v_attempt := jsonb_build_object(
    'playerId', v_me.id,
    'playerName', v_me.name,
    'slotIndex', p_slot_index,
    'correct', v_correct
  );

  UPDATE public.online_rooms
  SET steal = v_attempt
  WHERE id = p_room_id
    AND phase = 'stealing'
    AND steal IS NULL;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'Someone stole first!';
  END IF;

  UPDATE public.online_players
  SET steal_tokens = GREATEST(0, steal_tokens - 1),
      steal_ready = true
  WHERE id = v_me.id;

  RETURN v_attempt;
END;
$$;

CREATE OR REPLACE FUNCTION public.online_resolve_steal(p_room_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_room public.online_rooms;
  v_me public.online_players;
  v_pending jsonb;
  v_steal jsonb;
  v_card jsonb;
  v_stolen boolean;
  v_result jsonb;
  v_winner_id uuid;
  v_winner public.online_players;
  v_updated integer;
BEGIN
  PERFORM private.online_require_auth();

  SELECT * INTO v_room FROM public.online_rooms WHERE id = p_room_id FOR UPDATE;
  IF v_room.id IS NULL THEN
    RETURN;
  END IF;
  IF v_room.phase <> 'stealing' THEN
    RETURN;
  END IF;

  v_me := private.online_my_player(p_room_id);
  -- Active player or host may resolve (matches client authority).
  IF v_room.current_player_id IS DISTINCT FROM v_me.id AND NOT v_me.is_host THEN
    RAISE EXCEPTION 'Only the active player or host can resolve the steal.';
  END IF;

  v_card := v_room.current_card;
  v_pending := v_room.pending_placement;
  IF v_card IS NULL OR v_pending IS NULL THEN
    RETURN;
  END IF;

  v_steal := v_room.steal;
  v_stolen := (NOT COALESCE((v_pending ->> 'correct')::boolean, false))
              AND COALESCE((v_steal ->> 'correct')::boolean, false);

  v_result := jsonb_build_object(
    'correct', COALESCE((v_pending ->> 'correct')::boolean, false),
    'card', v_card,
    'playerId', v_pending ->> 'playerId',
    'playerName', v_pending ->> 'playerName',
    'slotIndex', COALESCE((v_pending ->> 'slotIndex')::integer, 0),
    'steal', CASE
      WHEN v_steal IS NULL THEN NULL
      ELSE jsonb_build_object(
        'playerName', v_steal ->> 'playerName',
        'slotIndex', COALESCE((v_steal ->> 'slotIndex')::integer, 0),
        'correct', COALESCE((v_steal ->> 'correct')::boolean, false),
        'stolen', v_stolen
      )
    END
  );

  UPDATE public.online_rooms
  SET phase = 'revealed',
      last_result = v_result,
      steal_ends_at = NULL
  WHERE id = p_room_id
    AND phase = 'stealing';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RETURN;
  END IF;

  IF COALESCE((v_pending ->> 'correct')::boolean, false) THEN
    v_winner_id := (v_pending ->> 'playerId')::uuid;
  ELSIF v_stolen THEN
    v_winner_id := (v_steal ->> 'playerId')::uuid;
  ELSE
    RETURN;
  END IF;

  SELECT * INTO v_winner FROM public.online_players WHERE id = v_winner_id FOR UPDATE;
  IF v_winner.id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.online_players
  SET timeline = private.online_sort_timeline(COALESCE(timeline, '[]'::jsonb) || jsonb_build_array(v_card)),
      score = score + 1
  WHERE id = v_winner.id;
END;
$$;

/* -------------------------------------------------------------- bonus guess */

CREATE OR REPLACE FUNCTION public.online_submit_bonus_guess(
  p_room_id uuid,
  p_guessed_title text,
  p_guessed_artist text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_room public.online_rooms;
  v_me public.online_players;
  v_title_ok boolean;
  v_artist_ok boolean;
  v_correct boolean;
  v_guess jsonb;
  v_updated integer;
BEGIN
  PERFORM private.online_require_auth();

  SELECT * INTO v_room FROM public.online_rooms WHERE id = p_room_id FOR UPDATE;
  IF v_room.id IS NULL THEN
    RAISE EXCEPTION 'Room not found.';
  END IF;
  IF v_room.phase <> 'playing' OR v_room.current_card IS NULL THEN
    RAISE EXCEPTION 'No song in play.';
  END IF;
  IF v_room.bonus_guess IS NOT NULL THEN
    RAISE EXCEPTION 'You already guessed this round.';
  END IF;

  v_me := private.online_my_player(p_room_id);
  IF v_room.current_player_id IS DISTINCT FROM v_me.id THEN
    RAISE EXCEPTION 'Only the active player may bonus-guess.';
  END IF;

  v_title_ok := private.online_is_guess_correct(p_guessed_title, v_room.current_card ->> 'title');
  v_artist_ok := private.online_is_guess_correct(p_guessed_artist, v_room.current_card ->> 'artist');
  v_correct := v_title_ok AND v_artist_ok;

  v_guess := jsonb_build_object(
    'playerId', v_me.id,
    'playerName', v_me.name,
    'skipped', false,
    'titleCorrect', v_title_ok,
    'artistCorrect', v_artist_ok,
    'correct', v_correct,
    'guessedTitle', btrim(COALESCE(p_guessed_title, '')),
    'guessedArtist', btrim(COALESCE(p_guessed_artist, ''))
  );

  UPDATE public.online_rooms
  SET bonus_guess = v_guess
  WHERE id = p_room_id
    AND bonus_guess IS NULL
    AND phase = 'playing';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'You already guessed this round.';
  END IF;

  IF v_correct THEN
    UPDATE public.online_players
    SET steal_tokens = steal_tokens + 1
    WHERE id = v_me.id;
  END IF;

  RETURN v_guess;
END;
$$;

CREATE OR REPLACE FUNCTION public.online_skip_bonus_guess(p_room_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_room public.online_rooms;
  v_me public.online_players;
  v_guess jsonb;
  v_updated integer;
BEGIN
  PERFORM private.online_require_auth();

  SELECT * INTO v_room FROM public.online_rooms WHERE id = p_room_id FOR UPDATE;
  IF v_room.id IS NULL THEN
    RAISE EXCEPTION 'Room not found.';
  END IF;
  IF v_room.bonus_guess IS NOT NULL THEN
    RETURN;
  END IF;
  IF v_room.phase <> 'playing' THEN
    RAISE EXCEPTION 'Bonus guess is not available right now.';
  END IF;

  v_me := private.online_my_player(p_room_id);
  IF v_room.current_player_id IS DISTINCT FROM v_me.id THEN
    RAISE EXCEPTION 'Only the active player may skip the bonus guess.';
  END IF;

  v_guess := jsonb_build_object(
    'playerId', v_me.id,
    'playerName', v_me.name,
    'skipped', true,
    'titleCorrect', false,
    'artistCorrect', false,
    'correct', false,
    'guessedTitle', '',
    'guessedArtist', ''
  );

  UPDATE public.online_rooms
  SET bonus_guess = v_guess
  WHERE id = p_room_id
    AND bonus_guess IS NULL
    AND phase = 'playing';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  -- Concurrent skip/guess: treat as already handled.
  IF v_updated = 0 THEN
    RETURN;
  END IF;
END;
$$;

/* ---------------------------------------------------------- skip / next turn */

CREATE OR REPLACE FUNCTION public.online_skip_current_card(p_room_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_room public.online_rooms;
  v_me public.online_players;
  v_next jsonb;
BEGIN
  PERFORM private.online_require_auth();

  SELECT * INTO v_room FROM public.online_rooms WHERE id = p_room_id FOR UPDATE;
  IF v_room.id IS NULL THEN
    RAISE EXCEPTION 'Room not found.';
  END IF;
  IF v_room.status <> 'playing' OR v_room.phase <> 'playing' THEN
    RAISE EXCEPTION 'You cannot skip right now.';
  END IF;

  v_me := private.online_my_player(p_room_id);
  IF v_room.current_player_id IS DISTINCT FROM v_me.id THEN
    RAISE EXCEPTION 'It is not your turn.';
  END IF;

  v_next := COALESCE(v_room.deck, '[]'::jsonb) -> v_room.draw_index;
  IF v_next IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.online_rooms
  SET phase = 'playing',
      current_card = v_next,
      draw_index = draw_index + 1,
      last_result = NULL,
      bonus_guess = NULL,
      pending_placement = NULL,
      steal = NULL,
      steal_ends_at = NULL
  WHERE id = p_room_id
    AND phase = 'playing'
    AND draw_index = v_room.draw_index;
END;
$$;

CREATE OR REPLACE FUNCTION public.online_next_turn(p_room_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_room public.online_rooms;
  v_me public.online_players;
  v_winner public.online_players;
  v_best public.online_players;
  v_next jsonb;
  v_next_player uuid;
  v_updated integer;
BEGIN
  PERFORM private.online_require_auth();

  SELECT * INTO v_room FROM public.online_rooms WHERE id = p_room_id FOR UPDATE;
  IF v_room.id IS NULL THEN
    RAISE EXCEPTION 'Room not found.';
  END IF;
  IF v_room.phase <> 'revealed' THEN
    RETURN;
  END IF;

  v_me := private.online_my_player(p_room_id);
  -- Same authority as the UI: active player or host.
  IF v_room.current_player_id IS DISTINCT FROM v_me.id AND NOT v_me.is_host THEN
    RAISE EXCEPTION 'Only the active player or host can advance the turn.';
  END IF;

  SELECT * INTO v_winner
  FROM public.online_players
  WHERE room_id = p_room_id AND score >= v_room.target_score
  ORDER BY score DESC, turn_order ASC
  LIMIT 1;

  v_next := COALESCE(v_room.deck, '[]'::jsonb) -> v_room.draw_index;

  IF v_winner.id IS NOT NULL OR v_next IS NULL THEN
    SELECT * INTO v_best
    FROM public.online_players
    WHERE room_id = p_room_id
    ORDER BY score DESC, turn_order ASC
    LIMIT 1;

    UPDATE public.online_rooms
    SET status = 'finished',
        phase = 'idle',
        current_card = NULL,
        winner_player_id = COALESCE(v_winner.id, v_best.id)
    WHERE id = p_room_id
      AND phase = 'revealed';
    RETURN;
  END IF;

  SELECT id INTO v_next_player
  FROM public.online_players
  WHERE room_id = p_room_id
  ORDER BY
    CASE
      WHEN turn_order > (
        SELECT turn_order FROM public.online_players WHERE id = v_room.current_player_id
      ) THEN 0
      ELSE 1
    END,
    turn_order ASC
  LIMIT 1;

  UPDATE public.online_rooms
  SET phase = 'playing',
      current_card = v_next,
      draw_index = draw_index + 1,
      current_player_id = v_next_player,
      last_result = NULL,
      bonus_guess = NULL,
      pending_placement = NULL,
      steal = NULL,
      steal_ends_at = NULL
  WHERE id = p_room_id
    AND phase = 'revealed'
    AND draw_index = v_room.draw_index;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  -- Concurrent nextTurn: first writer wins.
  IF v_updated = 0 THEN
    RETURN;
  END IF;
END;
$$;

/* ----------------------------------------------------------- restart lobby */

CREATE OR REPLACE FUNCTION public.online_restart_to_lobby(p_room_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_room public.online_rooms;
BEGIN
  PERFORM private.online_require_auth();

  SELECT * INTO v_room FROM public.online_rooms WHERE id = p_room_id FOR UPDATE;
  IF v_room.id IS NULL THEN
    RAISE EXCEPTION 'Room not found.';
  END IF;
  IF v_room.host_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the host can restart the lobby.';
  END IF;

  UPDATE public.online_rooms
  SET status = 'lobby',
      phase = 'idle',
      deck = private.online_shuffle_jsonb(v_room.deck),
      draw_index = 0,
      current_card = NULL,
      current_player_id = NULL,
      last_result = NULL,
      bonus_guess = NULL,
      pending_placement = NULL,
      steal = NULL,
      steal_ends_at = NULL,
      winner_player_id = NULL
  WHERE id = p_room_id;

  UPDATE public.online_players
  SET score = 0,
      steal_tokens = 3,
      timeline = '[]'::jsonb,
      is_ready = false,
      steal_ready = false
  WHERE room_id = p_room_id;
END;
$$;

/* ----------------------------------------------------------- grants / revoke */

REVOKE ALL ON FUNCTION public.online_set_ready(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.online_set_steal_ready(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.online_start_game(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.online_place_card(uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.online_submit_steal(uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.online_resolve_steal(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.online_submit_bonus_guess(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.online_skip_bonus_guess(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.online_skip_current_card(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.online_next_turn(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.online_restart_to_lobby(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.online_set_ready(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.online_set_steal_ready(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.online_start_game(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.online_place_card(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.online_submit_steal(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.online_resolve_steal(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.online_submit_bonus_guess(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.online_skip_bonus_guess(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.online_skip_current_card(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.online_next_turn(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.online_restart_to_lobby(uuid) TO authenticated, service_role;

/* ------------------------------------------------------------------- RLS */

-- No direct client UPDATEs; all gameplay goes through the RPCs above.
DROP POLICY IF EXISTS "Participants can update their rooms" ON public.online_rooms;
DROP POLICY IF EXISTS "Hosts can update own rooms" ON public.online_rooms;
DROP POLICY IF EXISTS "Participants can update players in their room" ON public.online_players;

REVOKE UPDATE ON public.online_rooms FROM authenticated, anon;
REVOKE UPDATE ON public.online_players FROM authenticated, anon;

-- Players may only join via join_online_room (SECURITY DEFINER).
DROP POLICY IF EXISTS "Players can join a lobby as themselves" ON public.online_players;
REVOKE INSERT ON public.online_players FROM authenticated, anon;

-- Tighten room creation: host may only insert a clean lobby row.
DROP POLICY IF EXISTS "Signed-in users can host rooms" ON public.online_rooms;
DROP POLICY IF EXISTS "Hosts can create rooms" ON public.online_rooms;
DROP POLICY IF EXISTS "Anyone can create rooms" ON public.online_rooms;

CREATE POLICY "Hosts can create lobby rooms"
ON public.online_rooms
FOR INSERT
TO authenticated
WITH CHECK (
  host_user_id = auth.uid()
  AND status = 'lobby'
  AND phase = 'idle'
  AND draw_index = 0
  AND current_card IS NULL
  AND current_player_id IS NULL
  AND winner_player_id IS NULL
  AND last_result IS NULL
  AND bonus_guess IS NULL
  AND pending_placement IS NULL
  AND steal IS NULL
  AND steal_ends_at IS NULL
);

-- Keep SELECT + DELETE as before; service_role retains full access.
GRANT SELECT, INSERT, DELETE ON public.online_rooms TO authenticated;
GRANT SELECT, DELETE ON public.online_players TO authenticated;
GRANT ALL ON public.online_rooms TO service_role;
GRANT ALL ON public.online_players TO service_role;
