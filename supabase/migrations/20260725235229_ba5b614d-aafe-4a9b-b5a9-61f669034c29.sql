CREATE TABLE public.online_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  host_user_id uuid,
  deck_id uuid,
  deck_name text,
  status text NOT NULL DEFAULT 'lobby',
  phase text NOT NULL DEFAULT 'idle',
  deck jsonb NOT NULL DEFAULT '[]'::jsonb,
  draw_index integer NOT NULL DEFAULT 0,
  current_card jsonb,
  current_player_id uuid,
  target_score integer NOT NULL DEFAULT 10,
  winner_player_id uuid,
  last_result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.online_rooms TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.online_rooms TO anon;
GRANT ALL ON public.online_rooms TO service_role;

ALTER TABLE public.online_rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view rooms" ON public.online_rooms FOR SELECT USING (true);
CREATE POLICY "Anyone can create rooms" ON public.online_rooms FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update rooms" ON public.online_rooms FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Host can delete own rooms" ON public.online_rooms FOR DELETE TO authenticated USING (host_user_id = auth.uid());

CREATE TABLE public.online_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.online_rooms(id) ON DELETE CASCADE,
  user_id uuid,
  name text NOT NULL,
  turn_order integer NOT NULL DEFAULT 0,
  score integer NOT NULL DEFAULT 0,
  is_ready boolean NOT NULL DEFAULT false,
  is_host boolean NOT NULL DEFAULT false,
  timeline jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.online_players TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.online_players TO anon;
GRANT ALL ON public.online_players TO service_role;

ALTER TABLE public.online_players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view players" ON public.online_players FOR SELECT USING (true);
CREATE POLICY "Anyone can join as player" ON public.online_players FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update players" ON public.online_players FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can remove players" ON public.online_players FOR DELETE USING (true);

CREATE INDEX online_players_room_idx ON public.online_players(room_id);
CREATE INDEX online_rooms_code_idx ON public.online_rooms(code);

CREATE TRIGGER online_rooms_touch BEFORE UPDATE ON public.online_rooms
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER online_players_touch BEFORE UPDATE ON public.online_players
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.online_rooms REPLICA IDENTITY FULL;
ALTER TABLE public.online_players REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.online_rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.online_players;