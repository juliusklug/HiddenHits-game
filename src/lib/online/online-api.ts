import { supabase } from "@/integrations/supabase/client";
import { errorMessage } from "./errors";

import type {
  BonusGuess,
  LastResult,
  OnlineCard,
  PendingPlacement,
  Player,
  Room,
  StealAttempt,
} from "./types";
import { makeRoomCode, playableCards, shuffle } from "./logic";

const ROOMS = "online_rooms";
const PLAYERS = "online_players";
const resolvingSteals = new Set<string>();

/* ------------------------------------------------------------------ mapping */

function asRoom(row: Record<string, unknown>): Room {
  return {
    ...(row as unknown as Room),
    deck: (row.deck as OnlineCard[]) ?? [],
    current_card: (row.current_card as OnlineCard | null) ?? null,
    last_result: (row.last_result as LastResult | null) ?? null,
    pending_placement: (row.pending_placement as PendingPlacement | null) ?? null,
    steal: (row.steal as StealAttempt | null) ?? null,
    steal_ends_at: (row.steal_ends_at as string | null) ?? null,
    bonus_guess: (row.bonus_guess as BonusGuess | null) ?? null,
  };
}

function asPlayer(row: Record<string, unknown>): Player {
  return { ...(row as unknown as Player), timeline: (row.timeline as OnlineCard[]) ?? [] };
}

/* ----------------------------------------------------------- local identity */

const key = (code: string) => `hu_online_player_${code}`;

export function rememberPlayer(code: string, playerId: string) {
  try {
    localStorage.setItem(key(code), playerId);
  } catch {
    /* ignore */
  }
}

export function recallPlayer(code: string): string | null {
  try {
    return localStorage.getItem(key(code));
  } catch {
    return null;
  }
}

export function forgetPlayer(code: string) {
  try {
    localStorage.removeItem(key(code));
  } catch {
    /* ignore */
  }
}

/* --------------------------------------------------------------- deck build */

export async function loadDeckCards(deckId: string): Promise<OnlineCard[]> {
  const { data: links, error: linkErr } = await supabase
    .from("deck_cards")
    .select("card_id, position")
    .eq("deck_id", deckId)
    .order("position", { ascending: true });
  if (linkErr) throw linkErr;
  const ids = (links ?? []).map((l) => l.card_id as string);
  if (ids.length === 0) return [];
  const { data: cards, error } = await supabase.from("cards").select("*").in("id", ids);
  if (error) throw error;
  return (cards ?? []).map((c) => ({
    id: c.id as string,
    trackId: String(c.track_id),
    title: c.title as string,
    artist: c.artist as string,
    album: (c.album as string | null) ?? null,
    cover: (c.cover_url as string | null) ?? null,
    previewUrl: (c.preview_url as string | null) ?? null,
    year: (c.release_year as number | null) ?? null,
  }));
}

/* ------------------------------------------------------------------- rooms */

export async function createRoom(opts: {
  hostUserId: string;
  hostName: string;
  deckId: string;
  deckName: string;
  targetScore?: number;
}): Promise<{ room: Room; player: Player }> {
  const cards = await loadDeckCards(opts.deckId);
  const playable = playableCards(cards);
  if (playable.length < 4)
    throw new Error("This deck needs at least 4 cards with a release year and playable audio.");

  let room: Room | null = null;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 8 && !room; attempt++) {
    const { data, error } = await supabase
      .from(ROOMS)
      .insert({
        code: makeRoomCode(),
        host_user_id: opts.hostUserId,
        deck_id: opts.deckId,
        deck_name: opts.deckName,
        status: "lobby",
        phase: "idle",
        deck: shuffle(playable) as unknown as never,
        target_score: opts.targetScore ?? 10,
      })
      .select("*")
      .single();
    if (!error && data) {
      room = asRoom(data);
      break;
    }
    lastError = error;
    console.error("[online] createRoom insert failed", { attempt, error });
    // Only a duplicate room code is worth retrying; anything else is fatal.
    if (error?.code !== "23505") break;
  }
  if (!room) throw new Error(errorMessage(lastError, "Could not create the room."));

  const player = await joinRoom(room.code, opts.hostName, { isHost: true, userId: opts.hostUserId });
  return { room, player };
}


export async function getRoomByCode(code: string): Promise<Room | null> {
  const { data, error } = await supabase.from(ROOMS).select("*").eq("code", code).maybeSingle();
  if (error) throw error;
  return data ? asRoom(data) : null;
}

export async function listPlayers(roomId: string): Promise<Player[]> {
  const { data, error } = await supabase
    .from(PLAYERS)
    .select("*")
    .eq("room_id", roomId)
    .order("turn_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(asPlayer);
}

export async function joinRoom(
  code: string,
  name: string,
  _opts: { isHost?: boolean; userId?: string | null } = {},
): Promise<Player> {
  const { data, error } = await supabase.rpc("join_online_room", {
    p_code: code,
    p_name: name,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Could not join that game.");
  const player = asPlayer(data as unknown as Record<string, unknown>);
  rememberPlayer(code, player.id);
  return player;
}


export async function setReady(playerId: string, ready: boolean) {
  const { error } = await supabase.rpc("online_set_ready", {
    p_player_id: playerId,
    p_ready: ready,
  });
  if (error) throw new Error(error.message);
}

export async function leaveRoom(code: string, playerId: string) {
  await supabase.from(PLAYERS).delete().eq("id", playerId);
  forgetPlayer(code);
}

/* -------------------------------------------------------------- game flow */

/** Host starts the game via a transactional server RPC (deal + first card). */
export async function startGame(room: Room, _players?: Player[]) {
  const { error } = await supabase.rpc("online_start_game", { p_room_id: room.id });
  if (error) throw new Error(error.message);
}

/** Steal window length in milliseconds (must match server interval). */
export const STEAL_WINDOW_MS = 10000;

/** Marks a player as done waiting during the steal phase. */
export async function setStealReady(playerId: string, ready = true) {
  const { error } = await supabase.rpc("online_set_steal_ready", {
    p_player_id: playerId,
    p_ready: ready,
  });
  if (error) throw new Error(error.message);
}

/**
 * The active player commits a placement. Scoring is deferred: the room enters
 * the steal phase so other players can spend a token to challenge.
 * Placement correctness is computed server-side.
 */
export async function placeCard(room: Room, _player: Player, slotIndex: number) {
  if (!room.current_card) return;
  const { error } = await supabase.rpc("online_place_card", {
    p_room_id: room.id,
    p_slot_index: slotIndex,
  });
  if (error) throw new Error(error.message);
}

/* -------------------------------------------------------------- steal phase */

/**
 * A non-active player spends one token to guess the slot themselves. Only the
 * first attempt of the round is accepted (guarded server-side).
 */
export async function submitSteal(
  room: Room,
  _player: Player,
  slotIndex: number,
): Promise<StealAttempt> {
  const { data, error } = await supabase.rpc("online_submit_steal", {
    p_room_id: room.id,
    p_slot_index: slotIndex,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Could not submit steal.");
  return data as unknown as StealAttempt;
}

/**
 * Resolve the steal phase on the server: award the point and reveal the card.
 */
export async function resolveSteal(room: Room) {
  if (resolvingSteals.has(room.id)) return;
  resolvingSteals.add(room.id);
  try {
    const { error } = await supabase.rpc("online_resolve_steal", { p_room_id: room.id });
    if (error) throw new Error(error.message);
  } finally {
    resolvingSteals.delete(room.id);
  }
}

/* --------------------------------------------------------- bonus guessing */

/** Optional pre-placement guess. Both title and artist must match to earn a
 * steal token. Only the active player may call this, once per round. */
export async function submitBonusGuess(
  room: Room,
  _player: Player,
  guessedTitle: string,
  guessedArtist: string,
): Promise<BonusGuess> {
  const { data, error } = await supabase.rpc("online_submit_bonus_guess", {
    p_room_id: room.id,
    p_guessed_title: guessedTitle,
    p_guessed_artist: guessedArtist,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Could not submit bonus guess.");
  return data as unknown as BonusGuess;
}

export async function skipBonusGuess(room: Room, _player?: Player) {
  if (room.bonus_guess) return;
  const { error } = await supabase.rpc("online_skip_bonus_guess", { p_room_id: room.id });
  if (error) throw new Error(error.message);
}

/** Discards an unplayable card and deals a new one to the SAME player. */
export async function skipCurrentCard(room: Room) {
  const { error } = await supabase.rpc("online_skip_current_card", { p_room_id: room.id });
  if (error) throw new Error(error.message);
}

export async function nextTurn(room: Room, _players?: Player[]) {
  const { error } = await supabase.rpc("online_next_turn", { p_room_id: room.id });
  if (error) throw new Error(error.message);
}

export async function restartToLobby(room: Room) {
  const { error } = await supabase.rpc("online_restart_to_lobby", { p_room_id: room.id });
  if (error) throw new Error(error.message);
}

/* ------------------------------------------------------------- realtime */

export function subscribeRoom(
  roomId: string,
  onChange: () => void,
  onStatus?: (status: string) => void,
): () => void {
  const channel = supabase
    .channel(`online_room_${roomId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: ROOMS, filter: `id=eq.${roomId}` },
      onChange,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: PLAYERS, filter: `room_id=eq.${roomId}` },
      onChange,
    )
    .subscribe((status) => {
      console.info("[online] realtime status", status);
      onStatus?.(status);
    });
  return () => {
    void supabase.removeChannel(channel);
  };
}
