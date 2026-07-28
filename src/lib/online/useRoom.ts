import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "./errors";
import { getRoomByCode, listPlayers, recallPlayer, subscribeRoom } from "./online-api";
import type { Player, Room } from "./types";

/** Poll while Realtime is down or still connecting. */
const POLL_DEGRADED_MS = 2500;
/** Safety-net poll when Realtime reports SUBSCRIBED. */
const POLL_HEALTHY_MS = 15_000;
/** Slow poll while the tab is backgrounded (Realtime often sleeps too). */
const POLL_HIDDEN_MS = 30_000;

export type RoomState = {
  room: Room | null;
  players: Player[];
  me: Player | null;
  loading: boolean;
  error: string | null;
  /**
   * True when SELECT returned no row — could be a missing code or RLS hiding a
   * room from a non-member. Room page should offer JoinInline; join_online_room
   * is the source of truth for invalid codes.
   */
  canAttemptJoin: boolean;
  refresh: () => Promise<void>;
};

export function useRoom(code: string): RoomState {
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canAttemptJoin, setCanAttemptJoin] = useState(false);
  const [roomId, setRoomId] = useState<string | null>(null);
  const inflightRef = useRef<Promise<void> | null>(null);
  const pendingRefreshRef = useRef(false);

  const refresh = useCallback((): Promise<void> => {
    if (inflightRef.current) {
      pendingRefreshRef.current = true;
      return inflightRef.current;
    }

    const promise = (async () => {
      try {
        do {
          pendingRefreshRef.current = false;
          try {
            const r = await getRoomByCode(code);
            if (r) {
              setError(null);
              setCanAttemptJoin(false);
              setRoom(r);
              setRoomId(r.id);
              setPlayers(await listPlayers(r.id));
              continue;
            }

            // No row: wrong code OR RLS hid it from a non-member. Offer join UI;
            // join_online_room reports "No game found" when the code is invalid.
            setRoom(null);
            setPlayers([]);
            setRoomId(null);
            setCanAttemptJoin(true);
            setError(null);
          } catch (e) {
            setError(errorMessage(e));
            setCanAttemptJoin(false);
          }
        } while (pendingRefreshRef.current);
      } finally {
        setLoading(false);
        inflightRef.current = null;
        // A caller may have coalesced onto this promise after the loop decided to
        // stop; kick one more refresh so that update is not dropped.
        if (pendingRefreshRef.current) {
          void refresh();
        }
      }
    })();

    inflightRef.current = promise;
    return promise;
  }, [code]);

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!roomId) return;

    let realtimeHealthy = false;
    let pollId: number | null = null;

    const schedulePoll = () => {
      if (pollId != null) window.clearInterval(pollId);
      const interval = document.hidden
        ? POLL_HIDDEN_MS
        : realtimeHealthy
          ? POLL_HEALTHY_MS
          : POLL_DEGRADED_MS;
      pollId = window.setInterval(() => void refresh(), interval);
    };

    const unsub = subscribeRoom(
      roomId,
      () => {
        void refresh();
      },
      (status) => {
        realtimeHealthy = status === "SUBSCRIBED";
        schedulePoll();
      },
    );

    schedulePoll();

    const onVisibility = () => {
      if (!document.hidden) void refresh();
      schedulePoll();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      unsub();
      if (pollId != null) window.clearInterval(pollId);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [roomId, refresh]);

  const myId = typeof window === "undefined" ? null : recallPlayer(code);
  const me = players.find((p) => p.id === myId) ?? null;

  return { room, players, me, loading, error, canAttemptJoin, refresh };
}
