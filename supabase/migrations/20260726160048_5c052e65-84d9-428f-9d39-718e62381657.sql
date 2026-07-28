CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
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

REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC;

DROP POLICY "Insert own cards" ON public.cards;
DROP POLICY "Update own or official cards" ON public.cards;
DROP POLICY "Delete own or official cards" ON public.cards;

CREATE POLICY "Insert own cards" ON public.cards
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (is_official = false OR private.has_role(auth.uid(), 'admin'))
  );

CREATE POLICY "Update own or official cards" ON public.cards
  FOR UPDATE TO authenticated
  USING (
    (auth.uid() = user_id AND is_official = false)
    OR (is_official AND private.has_role(auth.uid(), 'admin'))
  )
  WITH CHECK (
    (auth.uid() = user_id AND is_official = false)
    OR (is_official AND private.has_role(auth.uid(), 'admin'))
  );

CREATE POLICY "Delete own or official cards" ON public.cards
  FOR DELETE TO authenticated
  USING (
    (auth.uid() = user_id AND is_official = false)
    OR (is_official AND private.has_role(auth.uid(), 'admin'))
  );

DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);