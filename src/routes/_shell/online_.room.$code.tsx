import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { unlockAudio } from "@/lib/music/audioSession";
import { ArrowLeft, Check, Crown, Loader2, LogIn, PartyPopper, Trophy, X, Zap } from "lucide-react";
import { OnlineHiddenPlayer } from "@/components/online/OnlineHiddenPlayer";
import { OnlineTimeline } from "@/components/online/OnlineTimeline";
import { BonusGuessCard, BonusGuessResult } from "@/components/online/BonusGuessCard";
import { StealPhase, useStealCountdown } from "@/components/online/StealPhase";
import { useAuth } from "@/hooks/use-auth";
import { useRoom } from "@/lib/online/useRoom";
import { errorMessage } from "@/lib/online/errors";
import {
  joinRoom,
  leaveRoom,
  nextTurn,
  placeCard,
  resolveSteal,
  restartToLobby,
  setReady,
  setStealReady,
  skipBonusGuess,
  skipCurrentCard,
  submitBonusGuess,
  submitSteal,
  startGame,
} from "@/lib/online/online-api";
import { qrToDataUrl } from "@/lib/qr";
import type { Player } from "@/lib/online/types";

export const Route = createFileRoute("/_shell/online_/room/$code")({
  head: ({ params }) => ({
    meta: [
      { title: `Room ${params.code} — HiddenHits Online` },
      {
        name: "description",
        content: `Live HiddenHits Online room ${params.code}. Hidden songs, shared timelines, real-time scores.`,
      },
      { property: "og:title", content: `HiddenHits Online — room ${params.code}` },
      {
        property: "og:description",
        content: "Join this live music timeline game with the 4-digit room code.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RoomPage,
});

function RoomPage() {
  const { code } = useParams({ from: "/_shell/online_/room/$code" });
  const { room, players, me, loading, error, canAttemptJoin, refresh } = useRoom(code);

  if (loading) {
    return (
        <div className="flex min-h-[60svh] items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-[var(--neon-pink)]" />
        </div>
    );
  }

  // Deep-link / non-member: RLS hides the room row, so offer join instead of
  // treating a missing SELECT as "Room not found".
  if (!me && (canAttemptJoin || Boolean(room))) {
    return <JoinInline code={code} onJoined={refresh} />;
  }

  if (error || !room) {
    return (
        <div className="px-5 pt-10 text-center">
          <p className="text-lg font-semibold">{error ?? "Room not found"}</p>
          <Link
            to="/online"
            className="mt-5 inline-flex rounded-xl gradient-neon px-5 py-3 text-sm font-semibold text-white"
          >
            Back to HiddenHits Online
          </Link>
        </div>
    );
  }

  if (room.status === "finished") {
    return <WinnerScreen room={room} players={players} me={me} />;
  }

  if (room.status === "lobby") {
    return <Lobby code={code} room={room} players={players} me={me} />;
  }

  return <GameBoard room={room} players={players} me={me} />;
}

/* ------------------------------------------------------------- join inline */

function JoinInline({ code, onJoined }: { code: string; onJoined: () => Promise<void> }) {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!user) {
    return (
        <div className="px-5 pt-10 text-center">
          <h1 className="text-3xl font-bold">
            Room <span className="text-gradient-rainbow">{code}</span>
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Online games are private to their players — sign in to join this room.
          </p>
          <Link
            to="/auth"
            className="mt-6 inline-flex items-center justify-center rounded-xl gradient-neon px-5 py-3 text-sm font-semibold text-white"
          >
            Sign in
          </Link>
        </div>
    );
  }

  return (
      <div className="px-5 pt-10">
        <h1 className="text-3xl font-bold">
          Join room <span className="text-gradient-rainbow">{code}</span>
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">Pick a name your friends will see.</p>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={20}
          placeholder="Your name"
          className="mt-6 w-full rounded-xl glass px-4 py-3 text-sm outline-none"
        />
        {err && <p className="mt-3 text-sm text-[var(--neon-pink)]">{err}</p>}
        <button
          onClick={async () => {
            setBusy(true);
            setErr(null);
            try {
              await joinRoom(code, name, { userId: user?.id ?? null });
              await onJoined();
            } catch (e) {
              setErr(errorMessage(e));
            } finally {
              setBusy(false);
            }
          }}
          disabled={busy || !name.trim()}
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl gradient-neon px-6 py-4 font-semibold text-white disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogIn className="h-5 w-5" />}
          Join
        </button>
      </div>
  );
}

/* -------------------------------------------------------------------- lobby */

function Lobby({
  code,
  room,
  players,
  me,
}: {
  code: string;
  room: ReturnType<typeof useRoom>["room"] & object;
  players: Player[];
  me: Player;
}) {
  const [qr, setQr] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const url = `${window.location.origin}/online/room/${code}`;
    void qrToDataUrl(url, 320).then(setQr);
  }, [code]);

  const allReady = players.length >= 2 && players.every((p) => p.is_ready);

  return (
      <div className="px-5 pt-8 pb-10">
        <Link
          to="/online"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground"
          onClick={() => void leaveRoom(code, me.id)}
        >
          <ArrowLeft className="h-4 w-4" /> Leave
        </Link>

        <div className="mt-4 rounded-3xl glass-strong p-6 text-center">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Room code</div>
          <div className="mt-1 text-5xl font-bold tracking-[0.3em] text-gradient-rainbow">
            {code}
          </div>
          {qr && (
            <img
              src={qr}
              alt={`QR code to join room ${code}`}
              className="mx-auto mt-4 h-36 w-36 rounded-xl bg-white p-2"
            />
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Deck: {room.deck_name ?? "—"} · {room.deck.length} songs · first to {room.target_score}{" "}
            wins
          </p>
        </div>

        {/* Card stack */}
        <div className="relative mx-auto mt-8 h-28 w-24">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="absolute inset-0 rounded-2xl glass shadow-card"
              style={{ transform: `translateY(${i * -5}px) rotate(${(i - 1) * 4}deg)` }}
            />
          ))}
          <div className="absolute inset-0 flex items-center justify-center rounded-2xl gradient-rainbow opacity-90">
            <span className="text-2xl font-bold text-white">?</span>
          </div>
        </div>

        <h2 className="mt-8 text-sm uppercase tracking-widest text-muted-foreground">
          Players ({players.length})
        </h2>
        <ul className="mt-3 space-y-2">
          {players.map((p) => (
            <li key={p.id} className="flex items-center justify-between rounded-xl glass px-4 py-3">
              <span className="flex items-center gap-2 text-sm font-medium">
                {p.is_host && <Crown className="h-4 w-4 text-[var(--neon-yellow,var(--neon-pink))]" />}
                {p.name}
                {p.id === me.id && <span className="text-xs text-muted-foreground">(you)</span>}
              </span>
              <span
                className={
                  "flex items-center gap-1 text-xs " +
                  (p.is_ready ? "text-[var(--neon-green)]" : "text-muted-foreground")
                }
              >
                {p.is_ready ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                {p.is_ready ? "Ready" : "Not ready"}
              </span>
            </li>
          ))}
        </ul>

        <h2 className="mt-8 text-sm uppercase tracking-widest text-muted-foreground">
          Your timeline
        </h2>
        <div className="mt-3">
          <OnlineTimeline timeline={me.timeline} />
        </div>

        {err && <p className="mt-4 text-sm text-[var(--neon-pink)]">{err}</p>}

        <button
          onClick={() => void setReady(me.id, !me.is_ready)}
          className="mt-6 inline-flex w-full items-center justify-center rounded-2xl glass px-6 py-3.5 text-sm font-semibold"
        >
          {me.is_ready ? "Not ready" : "I'm ready"}
        </button>

        {me.is_host && (
          <button
            onClick={async () => {
              setErr(null);
              try {
                await startGame(room, players);
              } catch (e) {
                setErr(errorMessage(e));
              }
            }}
            disabled={!allReady}
            className="mt-3 inline-flex w-full items-center justify-center rounded-2xl gradient-neon px-6 py-4 font-semibold text-white disabled:opacity-50"
          >
            Start game
          </button>
        )}
        {!me.is_host && (
          <p className="mt-3 text-center text-xs text-muted-foreground">
            Waiting for the host to start…
          </p>
        )}
      </div>
  );
}

/* ---------------------------------------------------------------- gameplay */

function GameBoard({
  room,
  players,
  me,
}: {
  room: NonNullable<ReturnType<typeof useRoom>["room"]>;
  players: Player[];
  me: Player;
}) {
  const [busy, setBusy] = useState(false);
  const resolvingRef = useRef(false);
  const active = players.find((p) => p.id === room.current_player_id) ?? null;
  const isMyTurn = active?.id === me.id;
  const revealed = room.phase === "revealed";
  const stealing = room.phase === "stealing";
  const result = room.last_result;
  const bonus = room.bonus_guess;
  const { msLeft, seconds, armed } = useStealCountdown(
    stealing ? (room.steal_ends_at ?? `${room.id}:steal`) : null,
  );

  // One client (active player, or the host as a fallback) resolves the steal
  // window once the timer runs out — or as soon as every player has tapped
  // Ready. resolveSteal is single-flight and re-fetches the room; phase claim
  // makes concurrent callers harmless.
  const allStealReady = players.length > 0 && players.every((p) => p.steal_ready);
  const serverExpired =
    Boolean(room.steal_ends_at) && Date.parse(room.steal_ends_at) <= Date.now();
  useEffect(() => {
    if (!stealing || !armed) return;
    if (!isMyTurn && !me.is_host) return;
    if (msLeft > 0 && !serverExpired && !allStealReady) return;
    if (resolvingRef.current) return;
    resolvingRef.current = true;
    void resolveSteal(room).finally(() => {
      resolvingRef.current = false;
    });
  }, [stealing, armed, isMyTurn, me.is_host, room, msLeft, allStealReady, serverExpired]);



  const place = async (slotIndex: number) => {
    if (!room.current_card || busy || !room.bonus_guess || room.phase !== "playing") return;
    setBusy(true);
    try {
      await placeCard(room, me, slotIndex);
    } finally {
      setBusy(false);
    }
  };

  return (
      <div className="px-5 pt-8 pb-10">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-widest text-muted-foreground">
            Room {room.code}
          </span>
          <span className="text-xs text-muted-foreground">
            {room.deck.length - room.draw_index} cards left
          </span>
        </div>

        {/* Scores */}
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {[...players]
            .sort((a, b) => a.turn_order - b.turn_order)
            .map((p) => (
              <div
                key={p.id}
                className={
                  "flex min-w-[84px] shrink-0 flex-col items-center rounded-xl px-3 py-2 " +
                  (p.id === active?.id ? "glass-strong ring-2 ring-[var(--neon-pink)]" : "glass")
                }
              >
                <span className="line-clamp-1 text-[11px] text-muted-foreground">{p.name}</span>
                <span className="text-lg font-bold text-gradient-neon">{p.score}</span>
                <span className="flex items-center gap-0.5 text-[10px] text-[var(--neon-blue,var(--neon-pink))]">
                  <Zap className="h-3 w-3" /> {p.steal_tokens ?? 0}
                </span>
              </div>
            ))}
        </div>

        {/* Turn / playback */}
        <div className="mt-6 rounded-3xl glass p-5">
          {revealed && result ? (
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
              {result.steal && (
                <p
                  className={
                    "mt-2 flex items-center gap-1.5 rounded-xl glass px-3 py-2 text-xs font-semibold " +
                    (result.steal.stolen
                      ? "text-[var(--neon-green)]"
                      : "text-muted-foreground")
                  }
                >
                  <Zap className="h-3.5 w-3.5" />
                  {result.steal.stolen
                    ? `${result.steal.playerName} stole the card!`
                    : `${result.steal.playerName}'s steal failed — token lost.`}
                </p>
              )}

              {(isMyTurn || me.is_host) && (
                <button
                  onClick={async () => {
                    // Carry this tap's user activation into the next song.
                    unlockAudio();
                    setBusy(true);
                    try {
                      await nextTurn(room, players);
                    } finally {
                      setBusy(false);
                    }
                  }}
                  disabled={busy}
                  className="mt-5 inline-flex w-full items-center justify-center rounded-2xl gradient-neon px-6 py-3.5 font-semibold text-white disabled:opacity-50"
                >
                  Next turn
                </button>
              )}
            </div>
          ) : room.current_card ? (
            <>
              <p className="text-center text-xs uppercase tracking-widest text-[var(--neon-pink)]">
                {isMyTurn ? "Your turn" : `${active?.name ?? "Someone"} is guessing…`}
              </p>
              <div className="mt-4">
                <OnlineHiddenPlayer
                  card={room.current_card}
                  onSkip={isMyTurn ? () => void skipCurrentCard(room) : undefined}
                />
              </div>

              {isMyTurn && !bonus && (
                <BonusGuessCard
                  onSubmit={async (title, artist) => {
                    await submitBonusGuess(room, me, title, artist);
                  }}
                  onSkip={async () => {
                    await skipBonusGuess(room, me);
                  }}
                />
              )}
              {bonus && <BonusGuessResult guess={bonus} mine={bonus.playerId === me.id} />}
              {!isMyTurn && !bonus && (
                <p className="mt-4 text-center text-xs text-muted-foreground">
                  They can name the song for a bonus Steal Token before placing it.
                </p>
              )}

              {stealing && (
                <StealPhase
                  room={room}
                  me={me}
                  players={players}
                  activeName={active?.name ?? "Someone"}
                  seconds={seconds}
                  msLeft={msLeft}
                  onSteal={async (slotIndex) => {
                    await submitSteal(room, me, slotIndex);
                  }}
                  onReady={async () => {
                    await setStealReady(me.id);
                  }}
                />

              )}

              {isMyTurn && bonus && !stealing && (
                <>
                  <div
                    draggable
                    className="mx-auto mt-5 flex h-20 w-16 cursor-grab select-none items-center justify-center rounded-xl gradient-rainbow text-2xl font-bold text-white active:cursor-grabbing"
                    aria-label="Hidden song card — drag onto your timeline"
                  >
                    ?
                  </div>
                  <p className="mt-2 text-center text-xs text-muted-foreground">
                    Drag the card onto your timeline — or tap a slot.
                  </p>
                </>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center py-4 text-center">
              <div className="relative mx-auto h-24 w-20">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="absolute inset-0 rounded-2xl glass"
                    style={{ transform: `translateY(${i * -4}px) rotate(${(i - 1) * 4}deg)` }}
                  />
                ))}
                <div className="absolute inset-0 flex items-center justify-center rounded-2xl gradient-rainbow opacity-90 text-xl font-bold text-white">
                  ?
                </div>
              </div>
              <p className="mt-4 text-sm font-semibold">{active?.name ?? "Someone"} is guessing…</p>
              <p className="mt-1 text-xs text-muted-foreground">
                The song is hidden and only playing on their device.
              </p>
            </div>
          )}
        </div>

        {/* Active player's timeline (interactive when it's mine) */}
        <h2 className="mt-8 text-sm uppercase tracking-widest text-muted-foreground">
          {isMyTurn ? "Your timeline" : `${active?.name ?? "Player"}'s timeline`}
        </h2>
        {stealing && room.steal && (
          <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-[var(--neon-green)]">
            <Zap className="h-3.5 w-3.5 animate-pulse" /> {room.steal.playerName} placed a Steal
            Token
          </p>
        )}
        <div className="mt-3">
          <OnlineTimeline
            timeline={isMyTurn ? me.timeline : (active?.timeline ?? [])}
            onPlace={
              isMyTurn && room.phase === "playing" && Boolean(bonus)
                ? (i) => void place(i)
                : undefined
            }
            highlightCardId={revealed && result?.correct ? result.card.id : null}
          />
        </div>

        {/* Everyone else */}
        <h2 className="mt-8 text-sm uppercase tracking-widest text-muted-foreground">
          All timelines
        </h2>
        <div className="mt-3 space-y-4">
          {players.map((p) => (
            <div key={p.id} className="rounded-2xl glass p-3">
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="font-medium">
                  {p.name} {p.id === me.id && <span className="text-muted-foreground">(you)</span>}
                </span>
                <span className="flex items-center gap-2 text-muted-foreground">
                  <span>{p.score} pts</span>
                  <span className="flex items-center gap-0.5">
                    <Zap className="h-3 w-3" /> {p.steal_tokens ?? 0}
                  </span>
                </span>
              </div>
              <OnlineTimeline timeline={p.timeline} compact />
            </div>
          ))}
        </div>
      </div>
  );
}

/* ------------------------------------------------------------------ winner */

function WinnerScreen({
  room,
  players,
  me,
}: {
  room: NonNullable<ReturnType<typeof useRoom>["room"]>;
  players: Player[];
  me: Player;
}) {
  const winner = players.find((p) => p.id === room.winner_player_id) ?? null;
  const ranked = [...players].sort((a, b) => b.score - a.score);

  return (
      <div className="relative px-5 pt-12 pb-10 text-center">
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          {Array.from({ length: 18 }).map((_, i) => (
            <span
              key={i}
              className="absolute bottom-0 h-2 w-2 rounded-full animate-drift"
              style={{
                left: `${(i * 53) % 100}%`,
                background: ["var(--neon-pink)", "var(--neon-blue)", "var(--neon-green)"][i % 3],
                animationDelay: `${(i * 0.4) % 6}s`,
                // @ts-expect-error css var
                "--dx": `${((i * 41) % 80) - 40}px`,
              }}
            />
          ))}
        </div>

        <PartyPopper className="mx-auto h-12 w-12 text-[var(--neon-pink)]" />
        <h1 className="mt-4 text-4xl font-bold">
          {winner?.id === me.id ? "You win!" : `${winner?.name ?? "Nobody"} wins!`}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {winner?.score ?? 0} points · deck {room.deck_name ?? ""}
        </p>

        <ul className="mt-8 space-y-2 text-left">
          {ranked.map((p, i) => (
            <li
              key={p.id}
              className={
                "flex items-center justify-between rounded-xl px-4 py-3 " +
                (i === 0 ? "glass-strong ring-2 ring-[var(--neon-green)]" : "glass")
              }
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                {i === 0 && <Trophy className="h-4 w-4 text-[var(--neon-green)]" />}
                {i + 1}. {p.name}
              </span>
              <span className="text-sm font-bold text-gradient-neon">{p.score}</span>
            </li>
          ))}
        </ul>

        {me.is_host && (
          <button
            onClick={() => void restartToLobby(room)}
            className="mt-8 inline-flex w-full items-center justify-center rounded-2xl gradient-neon px-6 py-4 font-semibold text-white"
          >
            Play again
          </button>
        )}
        <Link
          to="/online"
          className="mt-3 inline-flex w-full items-center justify-center rounded-2xl glass px-6 py-3.5 text-sm"
        >
          Back to HiddenHits Online
        </Link>
      </div>
  );
}
