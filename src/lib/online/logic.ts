import type { OnlineCard } from "./types";

/**
 * A card is playable when we can both score it (release year) and actually
 * produce audio for it (a usable preview stream + a numeric track id we can
 * resolve on Spotify/Deezer). Unplayable cards are filtered out of decks so
 * the game loop never gets stuck on a silent card.
 */
export function isPlayableCard(card: OnlineCard): boolean {
  if (card.year == null) return false;
  if (!/^\d+$/.test(String(card.trackId ?? ""))) return false;
  const url = card.previewUrl ?? "";
  return /^https?:\/\//i.test(url);
}

export function playableCards(cards: readonly OnlineCard[]): OnlineCard[] {
  return cards.filter(isPlayableCard);
}


export function shuffle<T>(items: readonly T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function sortTimeline(cards: OnlineCard[]): OnlineCard[] {
  return [...cards].sort((a, b) => (a.year ?? 0) - (b.year ?? 0));
}

/**
 * A placement is correct when the card's year fits between its neighbours
 * at the chosen slot (slot i sits before timeline[i]).
 */
export function isPlacementCorrect(
  timeline: OnlineCard[],
  card: OnlineCard,
  slotIndex: number,
): boolean {
  const year = card.year;
  if (year == null) return false;
  const before = slotIndex > 0 ? timeline[slotIndex - 1]?.year ?? null : null;
  const after = slotIndex < timeline.length ? timeline[slotIndex]?.year ?? null : null;
  if (before != null && year < before) return false;
  if (after != null && year > after) return false;
  return true;
}

export function nextPlayerId(
  players: { id: string; turn_order: number }[],
  currentId: string | null,
): string | null {
  if (players.length === 0) return null;
  const ordered = [...players].sort((a, b) => a.turn_order - b.turn_order);
  const idx = ordered.findIndex((p) => p.id === currentId);
  return ordered[(idx + 1) % ordered.length].id;
}

export function makeRoomCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

/* --------------------------------------------------- bonus guess matching */

/** Normalises a title/artist for comparison: no case, accents, punctuation,
 * bracketed suffixes ("(Remastered)") or feature credits. */
export function normalizeGuess(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\((?:[^)]*)\)|\[(?:[^\]]*)\]/g, " ")
    .replace(/\s-\s.*$/, " ")
    .replace(/\b(?:feat|ft|featuring|with)\b.*$/, " ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function isGuessCorrect(guess: string, truth: string): boolean {
  const g = normalizeGuess(guess);
  const t = normalizeGuess(truth);
  return g.length > 0 && g === t;
}
