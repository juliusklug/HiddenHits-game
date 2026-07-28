import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  User as UserIcon,
  LogIn,
  LogOut,
  Sparkles,
  Loader2,
  Mail,
  Save,
  Music2,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { MusicProviderSection } from "@/components/MusicProviderSection";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useIsAdmin } from "@/hooks/use-is-admin";

import {
  readGuestStats,
  clearGuestStats,
  hasGuestProgress,
  favoriteDecade,
  computeAccuracy,
  type GuestStats,
} from "@/lib/guest-stats";

type SearchParams = { welcome?: number; migrate?: number };

export const Route = createFileRoute("/_shell/profile")({
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    welcome: search.welcome ? 1 : undefined,
    migrate: search.migrate ? 1 : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Profile — HiddenHits" },
      { name: "description", content: "Your stats, cards and account settings." },
    ],
  }),
  component: ProfilePage,
});

type ProfileRow = {
  display_name: string | null;
  avatar_url: string | null;
  email: string | null;
  created_at: string;
};


function ProfilePage() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
        <div className="flex h-[60vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--neon-green)]" />
        </div>
    );
  }

  return user ? <SignedIn /> : <SignedOut />;
}

function SignedOut() {
  return (
    <div className="px-5 pt-12">
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full glass-strong">
          <UserIcon className="h-8 w-8 text-[var(--neon-green)]" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Guest player</h1>
          <p className="text-sm text-muted-foreground">Sign in to sync across devices</p>
        </div>
      </div>

      <Link
        to="/auth"
        className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-2xl gradient-neon px-5 py-4 text-base font-semibold text-[oklch(0.15_0_0)] glow-green transition-transform active:scale-[0.98]"
      >
        <LogIn className="h-5 w-5" />
        Sign in or create account
      </Link>
    </div>
  );
}

function SignedIn() {
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin(user?.id);

  const nav = useNavigate();
  const search = Route.useSearch();
  const [tab, setTab] = useState<"music" | "account">("music");
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [showWelcome, setShowWelcome] = useState(Boolean(search.welcome));
  const [migratePrompt, setMigratePrompt] = useState(Boolean(search.migrate) && hasGuestProgress());

  useEffect(() => {
    if (!user) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    if (!showWelcome) return;
    const t = setTimeout(() => {
      setShowWelcome(false);
      nav({ to: "/profile", search: {} as never, replace: true });
    }, 2600);
    return () => clearTimeout(t);
  }, [showWelcome, nav]);

  async function load() {
    const { data: p } = await supabase
      .from("profiles")
      .select("display_name, avatar_url, email, created_at")
      .maybeSingle();
    setProfile(p ?? null);
  }

  async function migrate(keep: boolean) {
    setMigratePrompt(false);
    if (!user) return;
    if (!keep) {
      clearGuestStats();
      return;
    }
    const g: GuestStats = readGuestStats();
    const fav = favoriteDecade(g.decade_counts);
    const acc = computeAccuracy(g.correct_guesses, g.total_guesses);
    const { error } = await supabase
      .from("user_statistics")
      .update({
        games_played: g.games_played,
        songs_played: g.songs_played,
        correct_guesses: g.correct_guesses,
        total_guesses: g.total_guesses,
        accuracy: acc,
        favorite_decade: fav,
      })
      .eq("user_id", user.id);
    if (error) {
      toast.error("Could not migrate guest progress");
      return;
    }
    clearGuestStats();
    toast.success("Guest progress merged");
    void load();
  }

  const displayName = profile?.display_name || user?.email?.split("@")[0] || "Player";
  const joined = profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : "—";
  const initials = useMemo(
    () => displayName.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase(),
    [displayName],
  );

  return (
    <div className="px-5 pt-10 pb-8">
      {showWelcome && (
        <div className="mb-5 overflow-hidden rounded-2xl glass-strong p-4 animate-[flip-in_0.5s_ease-out]">
          <div className="flex items-center gap-3">
            <Sparkles className="h-5 w-5 text-[var(--neon-green)]" />
            <div>
              <div className="text-base font-semibold text-gradient-neon">Welcome back, {displayName}</div>
              <div className="text-xs text-muted-foreground">Cloud sync is on</div>
            </div>
          </div>
        </div>
      )}

      {migratePrompt && (
        <div className="mb-5 rounded-2xl glass-strong p-5">
          <h3 className="text-base font-semibold">Keep your guest progress?</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            We found stats saved on this device. Merge them into your account or start fresh.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => migrate(true)}
              className="flex-1 rounded-xl gradient-neon px-4 py-2.5 text-sm font-semibold text-[oklch(0.15_0_0)]"
            >
              Merge guest data
            </button>
            <button onClick={() => migrate(false)} className="flex-1 rounded-xl glass px-4 py-2.5 text-sm">
              Start fresh
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full glass-strong text-lg font-bold text-[var(--neon-green)] overflow-hidden">
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
          ) : (
            initials || <UserIcon className="h-8 w-8" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-bold">{displayName}</h1>
          <p className="truncate text-sm text-muted-foreground">{profile?.email ?? user?.email}</p>
          <p className="text-xs text-muted-foreground">Joined {joined}</p>
        </div>
      </div>

      {isAdmin && (
        <section className="mt-5 rounded-2xl glass-strong p-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-[var(--neon-green)]" />
            <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              Administrator account
            </h2>
          </div>
          <p className="mt-2 text-sm font-medium">Status: Official Library Administrator</p>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            <li>· Manage Official Song Library</li>
            <li>· Manage your Private Library</li>
            <li>· Add Global Songs for all users</li>
          </ul>
        </section>
      )}



      {/* Tabs */}
      <div className="mt-6 grid grid-cols-2 gap-1 rounded-2xl glass p-1 text-xs">
        {(["music", "account"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-xl px-2 py-2 capitalize transition ${
              tab === t ? "gradient-neon text-[oklch(0.15_0_0)] font-semibold" : "text-muted-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === "music" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 px-1">
              <Music2 className="h-4 w-4 text-[var(--neon-green)]" />
              <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                Music provider
              </h2>
            </div>
            <MusicProviderSection />
          </div>
        )}
        {tab === "account" && <AccountTab profile={profile} email={user?.email ?? ""} onSaved={load} />}
      </div>
    </div>
  );
}

function AccountTab({
  profile,
  email,
  onSaved,
}: {
  profile: ProfileRow | null;
  email: string;
  onSaved: () => void;
}) {
  const [name, setName] = useState(profile?.display_name ?? "");
  const [saving, setSaving] = useState(false);
  const nav = useNavigate();

  useEffect(() => setName(profile?.display_name ?? ""), [profile?.display_name]);

  async function saveName() {
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const { error } = await supabase
        .from("profiles")
        .update({ display_name: name })
        .eq("user_id", u.user.id);
      if (error) throw error;
      toast.success("Username updated");
      onSaved();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  async function changeEmail() {
    const next = prompt("New email", email);
    if (!next || next === email) return;
    const { error } = await supabase.auth.updateUser({ email: next });
    if (error) toast.error(error.message);
    else toast.success("Confirmation link sent to the new address");
  }

  async function resetPwd() {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) toast.error(error.message);
    else toast.success("Reset email sent");
  }

  async function signOut() {
    await supabase.auth.signOut();
    nav({ to: "/" });
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl glass p-5">
        <label className="text-xs uppercase tracking-widest text-muted-foreground">Username</label>
        <div className="mt-2 flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 rounded-xl glass-strong px-4 py-3 text-base outline-none focus:ring-2 focus:ring-[var(--neon-green)]"
          />
          <button
            onClick={saveName}
            disabled={saving || name === (profile?.display_name ?? "")}
            className="inline-flex items-center gap-1 rounded-xl gradient-neon px-4 py-3 text-sm font-semibold text-[oklch(0.15_0_0)] disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
          </button>
        </div>
      </div>

      <button
        onClick={changeEmail}
        className="flex w-full items-center justify-between rounded-2xl glass p-5 text-left"
      >
        <div>
          <div className="text-sm font-semibold">Change email</div>
          <div className="text-xs text-muted-foreground">{email}</div>
        </div>
        <Mail className="h-5 w-5 text-[var(--neon-green)]" />
      </button>

      <button
        onClick={resetPwd}
        className="flex w-full items-center justify-between rounded-2xl glass p-5 text-left"
      >
        <div className="text-sm font-semibold">Reset password</div>
        <Sparkles className="h-5 w-5 text-[var(--neon-green)]" />
      </button>

      <button
        onClick={signOut}
        className="flex w-full items-center justify-center gap-2 rounded-2xl glass-strong p-4 text-base font-semibold text-red-400"
      >
        <LogOut className="h-5 w-5" /> Sign out
      </button>
    </div>
  );
}
