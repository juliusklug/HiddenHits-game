import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Mail, Lock, ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { hasGuestProgress } from "@/lib/guest-stats";

export const Route = createFileRoute("/_shell/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — HiddenHits" },
      { name: "description", content: "Sign in or create an account to sync your stats, cards, and history." },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): { next?: string } => ({
    next: typeof s.next === "string" ? s.next : undefined,
  }),
  component: AuthPage,
});

function sanitizeNext(next: string | undefined): string | null {
  if (!next) return null;
  // same-origin relative path only
  if (!next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}


type Mode = "signin" | "signup" | "forgot";

function AuthPage() {
  const nav = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const { next } = Route.useSearch();
  const nextSafe = sanitizeNext(next);

  useEffect(() => {

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        if (nextSafe) window.location.href = nextSafe;
        else nav({ to: "/profile" });
      }
    });
  }, [nav, nextSafe]);

  function goPostAuth(extra: Record<string, unknown> = {}) {
    if (nextSafe) {
      window.location.href = nextSafe;
      return;
    }
    nav({ to: "/profile", search: { welcome: 1, ...extra } as never });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back!");
        goPostAuth();
      } else if (mode === "signup") {
        const emailRedirectTo = nextSafe
          ? `${window.location.origin}${nextSafe}`
          : `${window.location.origin}/profile`;
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo },
        });
        if (error) throw error;
        toast.success("Account created");
        goPostAuth(hasGuestProgress() ? { migrate: 1 } : {});
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast.success("Reset link sent — check your inbox.");
        setMode("signin");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function onGoogle() {
    setLoading(true);
    try {
      const callbackUrl = nextSafe
        ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextSafe)}`
        : `${window.location.origin}/auth/callback`;
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: callbackUrl,
      });
      console.info("[auth] Google OAuth initiate result", {
        redirected: Boolean(result.redirected),
        hasTokens: Boolean("tokens" in result && result.tokens),
        error: result.error?.message,
      });
      if (result.error) throw result.error;
      if (result.redirected) return;
      const { data, error } = await supabase.auth.getSession();
      console.info("[auth] session after Google popup", {
        hasSession: Boolean(data.session),
        userId: data.session?.user?.id,
        email: data.session?.user?.email,
        error: error?.message,
      });
      if (error) throw error;
      goPostAuth();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Google sign-in failed");
      setLoading(false);
    }
  }


  return (
      <div className="px-5 pt-10 pb-16">
        <Link to="/" className="text-xs uppercase tracking-widest text-muted-foreground">
          HiddenHits
        </Link>
        <h1 className="mt-4 text-4xl font-bold leading-tight">
          {mode === "signup" ? "Create account" : mode === "forgot" ? "Reset password" : "Sign in"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {mode === "forgot"
            ? "We'll email you a secure link to set a new password."
            : "Save your stats, cards and history across every device."}
        </p>

        {mode !== "forgot" && (
          <button
            onClick={onGoogle}
            disabled={loading}
            className="mt-6 inline-flex w-full items-center justify-center gap-3 rounded-2xl glass-strong px-5 py-4 text-base font-semibold transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            <GoogleMark />
            Continue with Google
          </button>
        )}

        {mode !== "forgot" && (
          <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-white/10" />
            or with email
            <div className="h-px flex-1 bg-white/10" />
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-3">
          <label className="block">
            <span className="sr-only">Email</span>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-2xl glass px-12 py-4 text-base outline-none focus:ring-2 focus:ring-[var(--neon-green)]"
              />
            </div>
          </label>

          {mode !== "forgot" && (
            <label className="block">
              <span className="sr-only">Password</span>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="password"
                  required
                  minLength={8}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password (min 8 chars)"
                  className="w-full rounded-2xl glass px-12 py-4 text-base outline-none focus:ring-2 focus:ring-[var(--neon-green)]"
                />
              </div>
            </label>
          )}

          <button
            type="submit"
            disabled={loading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl gradient-neon px-5 py-4 text-base font-semibold text-[oklch(0.15_0_0)] glow-green transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowRight className="h-5 w-5" />}
            {mode === "signup" ? "Create account" : mode === "forgot" ? "Send reset link" : "Sign in"}
          </button>
        </form>

        <div className="mt-6 space-y-2 text-sm text-muted-foreground">
          {mode === "signin" && (
            <>
              <button onClick={() => setMode("forgot")} className="underline">
                Forgot your password?
              </button>
              <div>
                New here?{" "}
                <button onClick={() => setMode("signup")} className="text-[var(--neon-green)] underline">
                  Create an account
                </button>
              </div>
            </>
          )}
          {mode === "signup" && (
            <div>
              Already have an account?{" "}
              <button onClick={() => setMode("signin")} className="text-[var(--neon-green)] underline">
                Sign in
              </button>
            </div>
          )}
          {mode === "forgot" && (
            <button onClick={() => setMode("signin")} className="underline">
              Back to sign in
            </button>
          )}
        </div>

        <div className="mt-8 rounded-2xl glass p-4 text-xs text-muted-foreground">
          Prefer to keep playing as a guest? Your scans and stats are saved on this device.{" "}
          <Link to="/" className="text-[var(--neon-green)] underline">
            Back to home
          </Link>
          .
        </div>
      </div>
  );
}

function GoogleMark() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.4 6.1 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.4 7.1 29.5 5 24 5 16.3 5 9.7 9.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.3 0 10.1-2 13.7-5.3l-6.3-5.3C29.2 35 26.7 36 24 36c-5.3 0-9.7-3.1-11.3-7.5l-6.5 5C9.6 39.7 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.6l6.3 5.3c-.4.4 6.7-4.9 6.7-14.9 0-1.3-.1-2.3-.4-3.5z" />
    </svg>
  );
}
