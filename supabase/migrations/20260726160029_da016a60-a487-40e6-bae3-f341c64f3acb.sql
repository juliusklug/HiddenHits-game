-- Roles
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

-- Seed the creator account as admin
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role FROM auth.users WHERE email = 'julius.klug1@gmail.com'
ON CONFLICT DO NOTHING;

-- Official library flag
ALTER TABLE public.cards ADD COLUMN is_official boolean NOT NULL DEFAULT false;
CREATE INDEX cards_is_official_idx ON public.cards (is_official);

-- Existing admin-owned cards become official
UPDATE public.cards SET is_official = true
WHERE user_id IN (SELECT user_id FROM public.user_roles WHERE role = 'admin');

-- Access rules
DROP POLICY "Users read own cards" ON public.cards;
DROP POLICY "Users insert own cards" ON public.cards;
DROP POLICY "Users update own cards" ON public.cards;
DROP POLICY "Users delete own cards" ON public.cards;

CREATE POLICY "Read official or own cards" ON public.cards
  FOR SELECT TO authenticated
  USING (is_official OR auth.uid() = user_id);

CREATE POLICY "Insert own cards" ON public.cards
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (is_official = false OR public.has_role(auth.uid(), 'admin'))
  );

CREATE POLICY "Update own or official cards" ON public.cards
  FOR UPDATE TO authenticated
  USING (
    (auth.uid() = user_id AND is_official = false)
    OR (is_official AND public.has_role(auth.uid(), 'admin'))
  )
  WITH CHECK (
    (auth.uid() = user_id AND is_official = false)
    OR (is_official AND public.has_role(auth.uid(), 'admin'))
  );

CREATE POLICY "Delete own or official cards" ON public.cards
  FOR DELETE TO authenticated
  USING (
    (auth.uid() = user_id AND is_official = false)
    OR (is_official AND public.has_role(auth.uid(), 'admin'))
  );