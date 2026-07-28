import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * True when the signed-in user holds the `admin` role.
 * Admin-created cards belong to the official (global) library.
 * This is a UI hint only — the database enforces the real rules.
 */
export function useIsAdmin(userId: string | null | undefined) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!userId) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setIsAdmin(Boolean(data));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { isAdmin, loading };
}
