ALTER TABLE public.online_rooms
  ADD COLUMN IF NOT EXISTS pending_placement jsonb,
  ADD COLUMN IF NOT EXISTS steal jsonb,
  ADD COLUMN IF NOT EXISTS steal_ends_at timestamptz;