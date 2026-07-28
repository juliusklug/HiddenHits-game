import { useEffect, useState } from "react";
import { Check, Loader2, ShieldAlert, Zap } from "lucide-react";
import { OnlineTimeline } from "./OnlineTimeline";
import type { Player, Room } from "@/lib/online/types";
import { errorMessage } from "@/lib/online/errors";

export const STEAL_WINDOW_MS = 10000;

/**
 * Anchors live at module scope so a remount of the board (realtime refresh,
 * route re-render) never restarts or truncates a running steal window.
 */
const stealAnchors = new Map<string, number>();

function deadlineFor(key: string) {
  let d = stealAnchors.get(key);
  if (d === undefined) {
    d = Date.now() + STEAL_WINDOW_MS;
    stealAnchors.set(key, d);
    // keep the map small
    if (stealAnchors.size > 20) {
      const first = stealAnchors.keys().next().value as string | undefined;
      if (first && first !== key) stealAnchors.delete(first);
    }
  }
  return d;
}

/**
 * Counts down the steal window. The deadline is anchored to the LOCAL clock the
 * first time this device sees a given steal phase, because device clocks are
 * frequently offset by seconds against the writer's clock — comparing the raw
 * `steal_ends_at` timestamp against `Date.now()` made the window expire
 * instantly on skewed devices.
 */
export function useStealCountdown(endsAt: string | null | undefined) {
  const [msLeft, setMsLeft] = useState(() =>
    endsAt ? Math.max(0, deadlineFor(endsAt) - Date.now()) : STEAL_WINDOW_MS,
  );

  useEffect(() => {
    if (!endsAt) {
      setMsLeft(STEAL_WINDOW_MS);
      return;
    }
    const deadline = deadlineFor(endsAt);
    const tick = () => setMsLeft(Math.max(0, deadline - Date.now()));
    tick();
    const id = window.setInterval(tick, 100);
    return () => window.clearInterval(id);
  }, [endsAt]);

  // `armed` guards resolvers: never treat the pre-mount value as "expired".
  return { msLeft, seconds: Math.max(0, Math.ceil(msLeft / 1000)), armed: Boolean(endsAt) };
}



type Props = {
  room: Room;
  me: Player;
  players: Player[];
  activeName: string;
  seconds: number;
  msLeft?: number;
  onSteal: (slotIndex: number) => Promise<void>;
  onReady: () => Promise<void>;
};

export function StealPhase({
  room,
  me,
  players,
  activeName,
  seconds,
  msLeft,
  onSteal,
  onReady,
}: Props) {
  const [picking, setPicking] = useState(false);
  const [slot, setSlot] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const steal = room.steal;
  const isActive = room.current_player_id === me.id;
  const tokens = me.steal_tokens ?? 0;
  const mySteal = steal?.playerId === me.id;
  const remaining = msLeft ?? seconds * 1000;
  const pct = Math.min(100, Math.max(0, (remaining / STEAL_WINDOW_MS) * 100));
  const readyCount = players.filter((p) => p.steal_ready).length;
  const imReady = Boolean(me.steal_ready);


  const confirm = () => {
    if (busy || slot === null) return;
    setBusy(true);
    setErr(null);
    void onSteal(slot)
      .catch((e) => setErr(errorMessage(e)))
      .finally(() => {
        setBusy(false);
        setPicking(false);
        setSlot(null);
      });
  };

  return (
    <div className="mt-4 rounded-3xl glass-strong p-5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-[var(--neon-pink)]">
          <ShieldAlert className="h-4 w-4" /> Steal phase
        </span>
        <span className="text-2xl font-bold text-gradient-neon">{seconds}s</span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full gradient-neon transition-[width] duration-200 ease-linear"
          style={{ width: `${pct}%` }}
        />
      </div>

      <p className="mt-2 text-center text-xs font-semibold text-muted-foreground">
        {seconds} second{seconds === 1 ? "" : "s"} remaining
      </p>
      <p className="mt-1 text-center text-xs text-muted-foreground">
        {activeName} locked in a spot — the year is still hidden.
      </p>

      {steal ? (
        <p className="mt-3 flex items-center justify-center gap-1.5 rounded-xl glass px-3 py-2 text-center text-sm font-semibold text-[var(--neon-green)]">
          <Zap className="h-4 w-4" />
          {mySteal ? "You spent a token to steal!" : `${steal.playerName} is stealing this card!`}
        </p>
      ) : isActive ? (
        <p className="mt-3 text-center text-xs text-muted-foreground">
          Others can spend a Steal Token to grab this card…
        </p>
      ) : tokens < 1 ? (
        <p className="mt-3 text-center text-xs text-muted-foreground">
          No Steal Tokens left — sit this one out.
        </p>
      ) : picking ? (
        <div className="mt-4">
          <p className="mb-2 text-center text-xs text-muted-foreground">
            Use your Steal Token to steal this card if you know where it belongs. Tap the spot on{" "}
            <span className="font-semibold text-foreground">your</span> timeline, then confirm.
          </p>
          <OnlineTimeline
            timeline={me.timeline}
            compact
            selectedSlot={slot}
            onPlace={(i) => {
              if (!busy) setSlot(i);
            }}
          />
          <div className="mt-3 flex gap-2">
            <button
              onClick={confirm}
              disabled={busy || slot === null}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl gradient-neon px-4 py-3 font-semibold text-white disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              Place Token
            </button>
            <button
              onClick={() => {
                setPicking(false);
                setSlot(null);
              }}
              disabled={busy}
              className="rounded-2xl glass px-4 py-3 font-semibold text-muted-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setPicking(true)}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl gradient-neon px-6 py-4 font-semibold text-white"
        >
          <Zap className="h-5 w-5" /> Steal · 1 token ({tokens} left)
        </button>
      )}

      <button
        onClick={() => {
          if (imReady) return;
          void onReady().catch((e) => setErr(errorMessage(e)));
        }}
        disabled={imReady}
        className={
          "mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-3 text-sm font-semibold " +
          (imReady ? "glass text-[var(--neon-green)]" : "glass text-foreground")
        }
      >
        {imReady ? <Check className="h-4 w-4" /> : null}
        {imReady ? "Ready — waiting for others" : "Ready · skip waiting"}
      </button>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        {readyCount}/{players.length} players ready
      </p>

      {err && <p className="mt-3 text-center text-sm text-[var(--neon-pink)]">{err}</p>}
    </div>
  );
}
