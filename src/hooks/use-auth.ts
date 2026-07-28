import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AuthState = {
  user: User | null;
  session: Session | null;
  loading: boolean;
};

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({ user: null, session: null, loading: true });

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      console.info("[auth] state changed", {
        event,
        hasSession: Boolean(session),
        userId: session?.user?.id,
        email: session?.user?.email,
      });
      setState({ user: session?.user ?? null, session, loading: false });
    });
    supabase.auth.getSession().then(({ data, error }) => {
      console.info("[auth] restored session", {
        hasSession: Boolean(data.session),
        userId: data.session?.user?.id,
        email: data.session?.user?.email,
        error: error?.message,
      });
      setState({ user: data.session?.user ?? null, session: data.session, loading: false });
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return state;
}
