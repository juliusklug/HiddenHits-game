-- Cards table
CREATE TABLE public.cards (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  artist text NOT NULL,
  release_year integer,
  track_id text NOT NULL,
  cover_url text,
  preview_url text,
  album text,
  qr_payload text NOT NULL,
  card_number serial,
  source text NOT NULL DEFAULT 'deezer',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cards TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.cards_card_number_seq TO authenticated;
GRANT ALL ON public.cards TO service_role;
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own cards" ON public.cards FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own cards" ON public.cards FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own cards" ON public.cards FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own cards" ON public.cards FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER cards_touch_updated BEFORE UPDATE ON public.cards FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX cards_user_id_idx ON public.cards(user_id);
CREATE INDEX cards_track_id_idx ON public.cards(track_id);

-- Decks table
CREATE TABLE public.decks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.decks TO authenticated;
GRANT ALL ON public.decks TO service_role;
ALTER TABLE public.decks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own decks" ON public.decks FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own decks" ON public.decks FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own decks" ON public.decks FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own decks" ON public.decks FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER decks_touch_updated BEFORE UPDATE ON public.decks FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX decks_user_id_idx ON public.decks(user_id);

-- Deck cards join table
CREATE TABLE public.deck_cards (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deck_id uuid NOT NULL REFERENCES public.decks(id) ON DELETE CASCADE,
  card_id uuid NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (deck_id, card_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deck_cards TO authenticated;
GRANT ALL ON public.deck_cards TO service_role;
ALTER TABLE public.deck_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own deck cards" ON public.deck_cards FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.decks d WHERE d.id = deck_id AND d.user_id = auth.uid()));
CREATE POLICY "Users insert own deck cards" ON public.deck_cards FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.decks d WHERE d.id = deck_id AND d.user_id = auth.uid()));
CREATE POLICY "Users update own deck cards" ON public.deck_cards FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.decks d WHERE d.id = deck_id AND d.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.decks d WHERE d.id = deck_id AND d.user_id = auth.uid()));
CREATE POLICY "Users delete own deck cards" ON public.deck_cards FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.decks d WHERE d.id = deck_id AND d.user_id = auth.uid()));
CREATE INDEX deck_cards_deck_id_idx ON public.deck_cards(deck_id);
CREATE INDEX deck_cards_card_id_idx ON public.deck_cards(card_id);