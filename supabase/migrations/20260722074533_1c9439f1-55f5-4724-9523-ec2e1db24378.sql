
CREATE TABLE public.spotify_connections (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  spotify_user_id TEXT,
  display_name TEXT,
  product TEXT,
  scope TEXT,
  refresh_token_ciphertext TEXT NOT NULL,
  access_token_ciphertext TEXT,
  expires_at TIMESTAMPTZ,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.spotify_connections TO authenticated;
GRANT ALL ON public.spotify_connections TO service_role;

ALTER TABLE public.spotify_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own spotify connection select" ON public.spotify_connections
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own spotify connection insert" ON public.spotify_connections
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own spotify connection update" ON public.spotify_connections
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own spotify connection delete" ON public.spotify_connections
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER trg_spotify_connections_touch
  BEFORE UPDATE ON public.spotify_connections
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS spotify_uri TEXT;
ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS spotify_resolved_at TIMESTAMPTZ;
