import { supabase } from "@/integrations/supabase/client";
import { buildDeezerQR } from "@/lib/card-payload";

export type Card = {
  id: string;
  user_id: string;
  title: string;
  artist: string;
  release_year: number | null;
  track_id: string;
  cover_url: string | null;
  preview_url: string | null;
  album: string | null;
  qr_payload: string;
  card_number: number;
  source: string;
  /** Official songs are part of the shared global library and visible to everyone. */
  is_official: boolean;
  created_at: string;
};

/** Official songs may only be changed by admins; private songs only by their owner. */
export function canManageCard(card: Card, userId: string | null, isAdmin: boolean) {
  return card.is_official ? isAdmin : card.user_id === userId;
}


export type Deck = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  created_at: string;
};

export type DeezerTrackMeta = {
  id: number;
  title: string;
  artist: string;
  album: string;
  cover: string;
  previewUrl: string;
  releaseYear: number | null;
};

export async function fetchDeezerTrack(trackId: string | number): Promise<DeezerTrackMeta> {
  const r = await fetch(`/api/deezer/track/${trackId}`);
  if (!r.ok) throw new Error(`Deezer track ${trackId} not found`);
  return (await r.json()) as DeezerTrackMeta;
}

export async function searchDeezer(q: string) {
  const r = await fetch(`/api/deezer/search?q=${encodeURIComponent(q)}`);
  if (!r.ok) throw new Error("Search failed");
  const json = (await r.json()) as { data: Array<DeezerTrackMeta & { id: number }> };
  return json.data ?? [];
}

export async function listCards(): Promise<Card[]> {
  const { data, error } = await supabase
    .from("cards")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Card[];
}

/**
 * Look up the saved card for a Deezer track id so manually edited metadata
 * (notably a corrected release year) wins over raw provider metadata.
 * Official cards take precedence, then the most recently created match.
 */
export async function fetchCardByTrackId(trackId: string): Promise<Card | null> {
  const { data, error } = await supabase
    .from("cards")
    .select("*")
    .eq("track_id", String(trackId))
    .order("is_official", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) {
    console.warn("[cards] track lookup failed", error);
    return null;
  }
  return ((data ?? [])[0] as Card | undefined) ?? null;
}

export async function listDecks(): Promise<Deck[]> {
  const { data, error } = await supabase
    .from("decks")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Deck[];
}

export async function listDeckCardIds(deckId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("deck_cards")
    .select("card_id, position")
    .eq("deck_id", deckId)
    .order("position", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => r.card_id as string);
}

/** Single round-trip card counts for every deck the caller can see. */
export async function listDeckCardCounts(): Promise<Record<string, number>> {
  const { data, error } = await supabase.from("deck_cards").select("deck_id");
  if (error) throw error;
  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    const id = row.deck_id as string;
    counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}

export type NewCardInput = {
  title: string;
  artist: string;
  release_year: number | null;
  track_id: string;
  cover_url?: string | null;
  preview_url?: string | null;
  album?: string | null;
  source?: string;
  /** Only admins may set this — the database rejects it for everyone else. */
  is_official?: boolean;
};

export async function createCard(userId: string, input: NewCardInput): Promise<Card> {
  const payload = {
    user_id: userId,
    title: input.title,
    artist: input.artist,
    release_year: input.release_year,
    track_id: input.track_id,
    cover_url: input.cover_url ?? null,
    preview_url: input.preview_url ?? null,
    album: input.album ?? null,
    qr_payload: buildDeezerQR(input.track_id),
    source: input.source ?? "deezer",
    is_official: input.is_official ?? false,
  };
  const { data, error } = await supabase.from("cards").insert(payload).select("*").single();
  if (error) throw error;
  return data as Card;
}

export async function updateCard(id: string, patch: Partial<NewCardInput>): Promise<void> {
  const { error } = await supabase.from("cards").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteCard(id: string): Promise<void> {
  const { error } = await supabase.from("cards").delete().eq("id", id);
  if (error) throw error;
}

export async function duplicateCard(
  userId: string,
  card: Card,
  opts?: { isOfficial?: boolean },
): Promise<Card> {
  return createCard(userId, {
    title: card.title,
    artist: card.artist,
    release_year: card.release_year,
    track_id: card.track_id,
    cover_url: card.cover_url,
    preview_url: card.preview_url,
    album: card.album,
    source: card.source,
    is_official: opts?.isOfficial ?? false,
  });
}


export async function createDeck(userId: string, name: string, description?: string): Promise<Deck> {
  const { data, error } = await supabase
    .from("decks")
    .insert({ user_id: userId, name, description: description ?? null })
    .select("*")
    .single();
  if (error) throw error;
  return data as Deck;
}

export async function renameDeck(id: string, name: string): Promise<void> {
  const { error } = await supabase.from("decks").update({ name }).eq("id", id);
  if (error) throw error;
}

export async function deleteDeck(id: string): Promise<void> {
  const { error } = await supabase.from("decks").delete().eq("id", id);
  if (error) throw error;
}

export async function addCardToDeck(deckId: string, cardId: string): Promise<void> {
  const { error } = await supabase
    .from("deck_cards")
    .insert({ deck_id: deckId, card_id: cardId, position: Date.now() % 1_000_000 });
  if (error && error.code !== "23505") throw error; // ignore unique-conflict
}

export async function bulkAddCardsToDeck(deckId: string, cardIds: string[]): Promise<void> {
  if (cardIds.length === 0) return;
  const rows = cardIds.map((card_id, i) => ({ deck_id: deckId, card_id, position: i }));
  const { error } = await supabase.from("deck_cards").insert(rows);
  if (error) throw error;
}

export async function removeCardFromDeck(deckId: string, cardId: string): Promise<void> {
  const { error } = await supabase
    .from("deck_cards")
    .delete()
    .eq("deck_id", deckId)
    .eq("card_id", cardId);
  if (error) throw error;
}
