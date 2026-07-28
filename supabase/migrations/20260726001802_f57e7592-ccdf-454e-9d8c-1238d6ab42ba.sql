ALTER TABLE public.online_players ADD COLUMN IF NOT EXISTS steal_tokens integer NOT NULL DEFAULT 3;
ALTER TABLE public.online_rooms ADD COLUMN IF NOT EXISTS bonus_guess jsonb;