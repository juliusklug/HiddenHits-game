import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { unlockAudio } from "@/lib/music/audioSession";
import {
  ArrowLeft,
  Loader2,
  Play,
  Plus,
  Smartphone,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { MusicProviderSection } from "@/components/MusicProviderSection";
import { OnlineHiddenPlayer } from "@/components/online/OnlineHiddenPlayer";
import { OnlineTimeline } from "@/components/online/OnlineTimeline";
import { useAuth } from "@/hooks/use-auth";
import { listDecks, listDeckCardCounts, type Deck } from "@/lib/cards-api";
import { loadDeckCards } from "@/lib/online/online-api";
import { errorMessage } from "@/lib/online/errors";
import {
  createPassGame,
  loadPassGame,
  nextTurn,
  placeCard,
  savePassGame,
  skipCard,

  startTurn,
  type PassGame,
} from "@/lib/passplay/engine";

export const Route = createFileRoute("/_shell/pass-play")({
  head: () => ({
    meta: [
      { title: "Pass & Play — HiddenHits party mode" },
      {
        name: "description",
        content:
          "Play HiddenHits on one phone. Add 2–8 players, pass the device around and build your music timelines together.",
      },
      { property: "og:title", content: "HiddenHits Pass & Play" },
      {
        property: "og:description",
        content: "One device, up to 8 players. Hear a hidden song, place it on your timeline.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PassPlayPage,
});

function PassPlayPage() {
  const [game, setGame] = useState<PassGame | null>(null);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    setGame(loadPassGame());
    setRestored(true);
  }, []);

  const update = (next: PassGame | null) => {
    setGame(next);
    savePassGame(next);
  };

  if (!restored) {
    return (
        <div className="flex min-h-[60svh] items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-[var(--neon-pink)]" />
        </div>
    );
  }

  if (!game) return <Setup onStart={update} />;
  if (game.phase === "finished") return <Winner game={game} onExit={() => update(null)} />;
  return <Board game={game} onChange={update} onExit={() => update(null)} />;
}

/* ------------------------------------------------------------------ setup */

function Setup({ onStart }: { onStart: (g: PassGame) => void }) {
  const { user, loading: authLoading } = useAuth();
  const [names, setNames] = useState<string[]>(["", ""]);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [deckId, setDeckId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      const d = await listDecks();
      setDecks(d);
      setCounts(await listDeckCardCounts());
      setDeckId((cur) => cur ?? d[0]?.id ?? null);
    })();
  }, [user]);

  const filled = names.map((n) => n.trim()).filter(Boolean);

  const begin = async () => {
    const deck = decks.find((d) => d.id === deckId);
    if (!deck) return;
    setBusy(true);
    setError(null);
    try {
      const cards = await loadDeckCards(deck.id);
      const game = createPassGame({ names: filled, deckName: deck.name, cards });
      onStart(game);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
      <div className="px-5 pt-8 pb-12">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>

        <h1 className="mt-4 text-4xl font-bold leading-tight tracking-tight">
          Pass <span className="text-gradient-rainbow">&amp; Play</span>
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          One phone, 2–8 players. Hear the song, place it, hand the device to the next player.
        </p>

        {authLoading ? (
          <Loader2 className="mx-auto mt-10 h-6 w-6 animate-spin text-muted-foreground" />
        ) : !user ? (
          <div className="mt-6 rounded-2xl glass p-6 text-center">
            <p className="font-semibold">Sign in to start a party</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Pass &amp; Play uses your saved decks and your Spotify connection on this device.
            </p>
            <Link
              to="/auth"
              className="mt-4 inline-flex items-center justify-center rounded-xl gradient-neon px-5 py-3 text-sm font-semibold text-white"
            >
              Sign in
            </Link>
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            <section>
              <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-widest text-muted-foreground">
                <span>Players ({filled.length})</span>
                <span>Max 8</span>
              </div>
              <div className="space-y-2">
                {names.map((n, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full gradient-rainbow text-sm font-bold text-white">
                      {n.trim() ? n.trim()[0].toUpperCase() : i + 1}
                    </span>
                    <input
                      value={n}
                      maxLength={20}
                      placeholder={`Player ${i + 1}`}
                      onChange={(e) =>
                        setNames((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))
                      }
                      className="w-full rounded-xl glass px-4 py-3 text-sm outline-none"
                    />
                    {names.length > 2 && (
                      <button
                        onClick={() => setNames((prev) => prev.filter((_, j) => j !== i))}
                        aria-label={`Remove player ${i + 1}`}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full glass text-muted-foreground"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {names.length < 8 && (
                <button
                  onClick={() => setNames((prev) => [...prev, ""])}
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl glass px-4 py-3 text-sm font-semibold"
                >
                  <Plus className="h-4 w-4" /> Add player
                </button>
              )}
            </section>

            <section>
              <div className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">
                Song deck
              </div>
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
            </section>

            <section>
              <div className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">
                Playback on this device
              </div>
              <MusicProviderSection />
              <p className="mt-2 text-xs text-muted-foreground">
                Connect Spotify Premium for full tracks — otherwise everyone hears a 30s preview.
              </p>
            </section>

            {error && <p className="text-sm text-[var(--neon-pink)]">{error}</p>}

            <button
              onClick={() => void begin()}
              disabled={busy || !deckId || filled.length < 2}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl gradient-neon px-6 py-4 text-base font-semibold text-white disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Users className="h-5 w-5" />}
              Start party
            </button>
            <p className="text-center text-xs text-muted-foreground">
              First player to 10 correct placements wins.
            </p>
          </div>
        )}
      </div>
  );
}

/* ------------------------------------------------------------------ board */

function Board({
  game,
  onChange,
  onExit,
}: {
  game: PassGame;
  onChange: (g: PassGame) => void;
  onExit: () => void;
}) {
  const active = game.players[game.currentIndex];
  const result = game.lastResult;

  return (
      <div className="px-5 pt-8 pb-10">
        <div className="flex items-center justify-between">
          <button onClick={onExit} className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <ArrowLeft className="h-4 w-4" /> End game
          </button>
          <span className="text-xs text-muted-foreground">
            {game.deck.length - game.drawIndex} cards left
          </span>
        </div>

        {/* Scores */}
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {game.players.map((p) => (
            <div
              key={p.id}
              className={
                "flex min-w-[84px] shrink-0 flex-col items-center rounded-xl px-3 py-2 " +
                (p.id === active.id ? "glass-strong ring-2 ring-[var(--neon-pink)]" : "glass")
              }
            >
              <span className="line-clamp-1 text-[11px] text-muted-foreground">{p.name}</span>
              <span className="text-lg font-bold text-gradient-neon">{p.score}</span>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-3xl glass p-5">
          {game.phase === "handoff" ? (
            <div className="flex flex-col items-center py-4 text-center">
              <Smartphone className="h-10 w-10 text-[var(--neon-blue,var(--neon-pink))]" />
              <p className="mt-4 text-2xl font-bold">
                It&apos;s <span className="text-gradient-rainbow">{active.name}</span>&apos;s turn!
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Pass the phone to {active.name}, then start the song.
              </p>
              <button
                onClick={() => onChange(startTurn(game))}
                className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl gradient-neon px-6 py-4 font-semibold text-white"
              >
                <Play className="h-5 w-5" /> Play song
              </button>
            </div>
          ) : game.phase === "revealed" && result ? (
            <div className="flex flex-col items-center text-center animate-flip-in">
              <p
                className={
                  "text-sm font-semibold " +
                  (result.correct ? "text-[var(--neon-green)]" : "text-[var(--neon-pink)]")
                }
              >
                {result.correct ? "Correct!" : "Wrong spot — card discarded"}
              </p>
              {result.card.cover && (
                <img
                  src={result.card.cover}
                  alt=""
                  className="mt-3 h-32 w-32 rounded-2xl object-cover shadow-card"
                />
              )}
              <div className="mt-3 text-4xl font-bold text-gradient-neon">
                {result.card.year ?? "—"}
              </div>
              <div className="mt-1 text-lg font-semibold">{result.card.title}</div>
              <div className="text-sm text-muted-foreground">{result.card.artist}</div>
              <p className="mt-2 text-xs text-muted-foreground">Placed by {result.playerName}</p>
              <button
                onClick={() => {
                  // Carry this tap's user activation into the next song.
                  unlockAudio();
                  onChange(nextTurn(game));
                }}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl gradient-neon px-6 py-3.5 font-semibold text-white"
              >
                <Smartphone className="h-5 w-5" /> Pass the phone
              </button>
            </div>
          ) : game.currentCard ? (
            <>
              <p className="text-center text-xs uppercase tracking-widest text-[var(--neon-pink)]">
                {active.name}&apos;s turn
              </p>
              <div className="mt-4">
                <OnlineHiddenPlayer
                  card={game.currentCard}
                  onSkip={() => onChange(skipCard(game))}
                />
              </div>
              <div
                draggable
                className="mx-auto mt-5 flex h-20 w-16 cursor-grab select-none items-center justify-center rounded-xl gradient-rainbow text-2xl font-bold text-white active:cursor-grabbing"
                aria-label="Hidden song card — drag onto the timeline"
              >
                ?
              </div>
              <p className="mt-2 text-center text-xs text-muted-foreground">
                Drag the card onto your timeline — or tap a slot.
              </p>
            </>
          ) : null}
        </div>

        <h2 className="mt-8 text-sm uppercase tracking-widest text-muted-foreground">
          {active.name}&apos;s timeline
        </h2>
        <div className="mt-3">
          <OnlineTimeline
            timeline={active.timeline}
            onPlace={
              game.phase === "playing" && game.currentCard
                ? (i) => onChange(placeCard(game, i))
                : undefined
            }
            highlightCardId={
              game.phase === "revealed" && result?.correct ? result.card.id : null
            }
          />
        </div>

        <h2 className="mt-8 text-sm uppercase tracking-widest text-muted-foreground">
          All timelines
        </h2>
        <div className="mt-3 space-y-4">
          {game.players.map((p) => (
            <div key={p.id} className="rounded-2xl glass p-3">
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="font-medium">{p.name}</span>
                <span className="text-muted-foreground">{p.score} pts</span>
              </div>
              <OnlineTimeline timeline={p.timeline} compact />
            </div>
          ))}
        </div>
      </div>
  );
}

/* ----------------------------------------------------------------- winner */

function Winner({ game, onExit }: { game: PassGame; onExit: () => void }) {
  const winner = game.players.find((p) => p.id === game.winnerId) ?? null;
  const ranked = [...game.players].sort((a, b) => b.score - a.score);

  return (
      <div className="px-5 pt-12 pb-10 text-center">
        <Trophy className="mx-auto h-14 w-14 text-[var(--neon-green)]" />
        <h1 className="mt-4 text-3xl font-bold">
          {winner ? (
            <>
              <span className="text-gradient-rainbow">{winner.name}</span> wins!
            </>
          ) : (
            "Game over"
          )}
        </h1>

        <ul className="mt-8 space-y-2 text-left">
          {ranked.map((p, i) => (
            <li key={p.id} className="flex items-center justify-between rounded-xl glass px-4 py-3">
              <span className="text-sm font-medium">
                {i + 1}. {p.name}
              </span>
              <span className="text-sm text-muted-foreground">{p.score} pts</span>
            </li>
          ))}
        </ul>

        <button
          onClick={onExit}
          className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-2xl gradient-neon px-6 py-4 font-semibold text-white"
        >
          <Users className="h-5 w-5" /> New party
        </button>
      </div>
  );
}
