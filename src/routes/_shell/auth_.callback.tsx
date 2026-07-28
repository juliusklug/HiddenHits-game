import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { hasGuestProgress } from "@/lib/guest-stats";

export const Route = createFileRoute("/_shell/auth_/callback")({
  head: () => ({
    meta: [{ title: "Completing sign in — HiddenHits" }],
  }),
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  const nav = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const completeOAuth = async () => {
      try {
        const url = new URL(window.location.href);
        const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
        const query = url.searchParams;
        const oauthError = hash.get("error_description") || query.get("error_description") || hash.get("error") || query.get("error");
        if (oauthError) throw new Error(oauthError);

        const accessToken = hash.get("access_token") || query.get("access_token");
        const refreshToken = hash.get("refresh_token") || query.get("refresh_token");
        console.info("[auth] OAuth callback received", {
          hasAccessToken: Boolean(accessToken),
          hasRefreshToken: Boolean(refreshToken),
          hasCode: Boolean(query.get("code")),
        });

        if (accessToken && refreshToken) {
          const { data, error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          console.info("[auth] callback setSession result", {
            hasSession: Boolean(data.session),
            userId: data.session?.user?.id,
            email: data.session?.user?.email,
            error: sessionError?.message,
          });
          if (sessionError) throw sessionError;
        } else if (query.get("code")) {
          const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(window.location.href);
          console.info("[auth] callback code exchange result", {
            hasSession: Boolean(data.session),
            userId: data.session?.user?.id,
            email: data.session?.user?.email,
            error: exchangeError?.message,
          });
          if (exchangeError) throw exchangeError;
        }

        const { data, error: currentError } = await supabase.auth.getSession();
        console.info("[auth] callback final session", {
          hasSession: Boolean(data.session),
          userId: data.session?.user?.id,
          email: data.session?.user?.email,
          error: currentError?.message,
        });
        if (currentError) throw currentError;
        if (!data.session) throw new Error("OAuth completed, but no Supabase session was created.");

        nav({
          to: "/profile",
          search: hasGuestProgress() ? ({ welcome: 1, migrate: 1 } as never) : ({ welcome: 1 } as never),
          replace: true,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[auth] OAuth callback failed", err);
        setError(message);
      }
    };

    void completeOAuth();
  }, [nav]);

  return (
      <div className="flex min-h-[70svh] flex-col items-center justify-center px-6 text-center">
        {error ? (
          <div className="max-w-sm rounded-2xl glass p-5 text-left">
            <div className="flex items-center gap-2 text-base font-semibold text-[var(--neon-green)]">
              <AlertCircle className="h-5 w-5" /> Google sign-in failed
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
            <button
              onClick={() => nav({ to: "/auth", replace: true })}
              className="mt-4 w-full rounded-xl gradient-neon px-4 py-3 text-sm font-semibold text-[oklch(0.15_0_0)]"
            >
              Back to sign in
            </button>
          </div>
        ) : (
          <>
            <Loader2 className="h-7 w-7 animate-spin text-[var(--neon-green)]" />
            <p className="mt-4 text-sm text-muted-foreground">Completing Google sign-in…</p>
          </>
        )}
      </div>
  );
}