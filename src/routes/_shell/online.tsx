import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Camera, Crown, Loader2, LogIn, Users } from "lucide-react";
import { QrScanner } from "@/components/QrScanner";
import { useAuth } from "@/hooks/use-auth";
import { listDecks, listDeckCardCounts, type Deck } from "@/lib/cards-api";
import { createRoom, joinRoom } from "@/lib/online/online-api";
import { errorMessage } from "@/lib/online/errors";

export const Route = createFileRoute("/_shell/online")({
  head: () => ({
    meta: [
      { title: "HiddenHits Online — real-time music multiplayer" },
      {
        name: "description",
        content:
          "Host or join a real-time HiddenHits game. Digital cards, hidden songs, shared timelines — no printing needed.",
      },
      { property: "og:title", content: "HiddenHits Online" },
      {
        property: "og:description",
        content: "Host a room, share a 4-digit code, and guess the year together in real time.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: OnlinePage,
});

function OnlinePage() {
  const [tab, setTab] = useState<"host" | "join">("host");

  return (
      <div className="px-5 pt-8">
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>

        <h1 className="mt-4 text-4xl font-bold leading-tight tracking-tight">
          HiddenHits <span className="text-gradient-rainbow">Online</span>
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Digital cards only. One room, one code, everyone plays on their own phone.
        </p>

        <div className="mt-6 grid grid-cols-2 gap-2 rounded-2xl glass p-1.5">
          {(
            [
              ["host", "Host Game", Crown],
              ["join", "Join Game", LogIn],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={
                "flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-semibold transition-colors " +
                (tab === key ? "gradient-neon text-white" : "text-muted-foreground")
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        {tab === "host" ? <HostPanel /> : <JoinPanel />}
      </div>
  );
}

/* ------------------------------------------------------------------ host */

function HostPanel() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [decks, setDecks] = useState<Deck[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [deckId, setDeckId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setName((n) => n || (user.email?.split("@")[0] ?? "Host"));
    void (async () => {
      const d = await listDecks();
      setDecks(d);
      setCounts(await listDeckCardCounts());
      setDeckId((cur) => cur ?? d[0]?.id ?? null);
    })();
  }, [user]);

  if (authLoading) {
    return <Loader2 className="mx-auto mt-10 h-6 w-6 animate-spin text-muted-foreground" />;
  }

  if (!user) {
    return (
      <div className="mt-6 rounded-2xl glass p-6 text-center">
        <p className="font-semibold">Sign in to host</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Hosting uses your saved decks, so you need an account. Joining a game never does.
        </p>
        <Link
          to="/auth"
          className="mt-4 inline-flex items-center justify-center rounded-xl gradient-neon px-5 py-3 text-sm font-semibold text-white"
        >
          Sign in
        </Link>
      </div>
    );
  }

  const start = async () => {
    const deck = decks.find((d) => d.id === deckId);
    if (!deck) return;
    setBusy(true);
    setError(null);
    try {
      const { room } = await createRoom({
        hostUserId: user.id,
        hostName: name || "Host",
        deckId: deck.id,
        deckName: deck.name,
      });
      void navigate({ to: "/online/room/$code", params: { code: room.code } });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-6 space-y-5 pb-10">
      <Field label="Your name">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={20}
          className="w-full rounded-xl glass px-4 py-3 text-sm outline-none"
          placeholder="Host name"
        />
      </Field>

      <Field label="Song deck">
        {decks.length === 0 ? (
          <div className="rounded-xl glass p-4 text-sm text-muted-foreground">
            You have no decks yet.{" "}
            <Link to="/cards" className="text-[var(--neon-pink)]">
              Create one in Cards
            </Link>
            .
          </div>
        ) : (
          <div className="space-y-2">
            {decks.map((d) => (
              <button
                key={d.id}
                onClick={() => setDeckId(d.id)}
                className={
                  "flex w-full items-center justify-between rounded-xl px-4 py-3 text-left text-sm transition-all " +
                  (deckId === d.id
                    ? "glass-strong ring-2 ring-[var(--neon-pink)]"
                    : "glass text-muted-foreground")
                }
              >
                <span className="font-medium text-foreground">{d.name}</span>
                <span className="text-xs">{counts[d.id] ?? 0} songs</span>
              </button>
            ))}
          </div>
        )}
      </Field>

      {error && <p className="text-sm text-[var(--neon-pink)]">{error}</p>}

      <button
        onClick={start}
        disabled={busy || !deckId}
        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl gradient-neon px-6 py-4 text-base font-semibold text-white disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Users className="h-5 w-5" />}
        Create room
      </button>
      <p className="text-center text-xs text-muted-foreground">
        First player to 10 points wins. 2–8 players.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ join */

function JoinPanel() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  const join = async (roomCode: string) => {
    if (!/^\d{4}$/.test(roomCode)) {
      setError("Enter the 4-digit room code.");
      return;
    }
    if (!name.trim()) {
      setError("Enter your player name.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await joinRoom(roomCode, name, { userId: user?.id ?? null });
      void navigate({ to: "/online/room/$code", params: { code: roomCode } });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (!user) {
    return (
      <div className="mt-6 rounded-2xl glass p-6 text-center">
        <p className="font-semibold">Sign in to join</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Online games are private to their players, so you need an account to join one.
        </p>
        <Link
          to="/auth"
          className="mt-4 inline-flex items-center justify-center rounded-xl gradient-neon px-5 py-3 text-sm font-semibold text-white"
        >
          Sign in
        </Link>
      </div>
    );
  }

  if (scanning) {

    return (
      <div className="fixed inset-0 z-50 bg-black">
        <QrScanner
          onDetected={(text) => {
            setScanning(false);
            const match = text.match(/(\d{4})(?!.*\d{4})/);
            if (match) {
              setCode(match[1]);
              void join(match[1]);
            } else {
              setError("That QR code isn't a room code.");
            }
          }}
          onClose={() => setScanning(false)}
        />
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-5 pb-10">
      <Field label="Your name">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={20}
          className="w-full rounded-xl glass px-4 py-3 text-sm outline-none"
          placeholder="e.g. Alex"
        />
      </Field>

      <Field label="Room code">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
          inputMode="numeric"
          className="w-full rounded-xl glass px-4 py-4 text-center text-3xl font-bold tracking-[0.5em] outline-none"
          placeholder="0000"
        />
      </Field>

      {error && <p className="text-sm text-[var(--neon-pink)]">{error}</p>}

      <button
        onClick={() => void join(code)}
        disabled={busy}
        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl gradient-neon px-6 py-4 text-base font-semibold text-white disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogIn className="h-5 w-5" />}
        Join game
      </button>

      <button
        onClick={() => setScanning(true)}
        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl glass px-6 py-3.5 text-sm"
      >
        <Camera className="h-4 w-4" />
        Scan room QR code
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}
