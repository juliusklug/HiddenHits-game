import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2, Pencil, Check, X, Shuffle } from "lucide-react";
import {
  createDeck,
  deleteDeck,
  renameDeck,
  listDeckCardIds,
  listDeckCardCounts,
  addCardToDeck,
  removeCardFromDeck,
  bulkAddCardsToDeck,
  type Card,
  type Deck,
} from "@/lib/cards-api";

export function DeckManager({
  userId,
  decks,
  cards,
  onDecksChange,
}: {
  userId: string;
  decks: Deck[];
  cards: Card[];
  onDecksChange: (decks: Deck[]) => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeDeck, setActiveDeck] = useState<Deck | null>(null);
  const [shuffleOpen, setShuffleOpen] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [countsLoaded, setCountsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setCountsLoaded(false);
    listDeckCardCounts()
      .then((c) => {
        if (!cancelled) {
          setCounts(c);
          setCountsLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCounts({});
          setCountsLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [decks]);

  async function refreshCounts() {
    try {
      setCounts(await listDeckCardCounts());
      setCountsLoaded(true);
    } catch {
      /* keep last known counts */
    }
  }

  async function handleCreate() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const d = await createDeck(userId, name.trim());
      onDecksChange([d, ...decks]);
      setName("");
    } finally {
      setBusy(false);
    }
  }

  const cardsWithYear = cards.filter((c) => c.release_year != null);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New deck name…"
          className="flex-1 rounded-xl border border-border bg-[var(--surface)] p-3 text-sm outline-none focus:ring-2 focus:ring-[var(--neon-green)]"
        />
        <button
          onClick={handleCreate}
          disabled={busy || !name.trim()}
          className="rounded-xl gradient-neon px-4 font-semibold text-[oklch(0.15_0_0)] disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-5 w-5" />}
        </button>
      </div>

      <button
        onClick={() => setShuffleOpen(true)}
        disabled={cardsWithYear.length < 2}
        className="flex w-full items-center justify-center gap-2 rounded-xl glass-strong px-4 py-3 text-sm font-semibold disabled:opacity-50"
      >
        <Shuffle className="h-4 w-4" />
        Create random deck
        <span className="text-xs text-muted-foreground">
          ({cardsWithYear.length} eligible)
        </span>
      </button>

      {decks.length === 0 && (
        <p className="rounded-xl glass p-4 text-center text-sm text-muted-foreground">
          No decks yet. Group your cards into themed collections.
        </p>
      )}

      <ul className="space-y-2">
        {decks.map((d) => (
          <DeckRow
            key={d.id}
            deck={d}
            count={counts[d.id] ?? 0}
            countReady={countsLoaded}
            onRename={(name) => onDecksChange(decks.map((x) => (x.id === d.id ? { ...x, name } : x)))}
            onDelete={() => onDecksChange(decks.filter((x) => x.id !== d.id))}
            onOpen={() => setActiveDeck(d)}
          />
        ))}
      </ul>

      {activeDeck && (
        <DeckCardPicker
          deck={activeDeck}
          cards={cards}
          onClose={() => {
            setActiveDeck(null);
            void refreshCounts();
          }}
        />
      )}

      {shuffleOpen && (
        <ShuffleDeckDialog
          userId={userId}
          cards={cardsWithYear}
          onClose={() => setShuffleOpen(false)}
          onCreated={(d) => {
            onDecksChange([d, ...decks]);
            setShuffleOpen(false);
            void refreshCounts();
          }}
        />
      )}
    </div>
  );
}

const SHUFFLE_SIZES = [50, 80, 100, 120, 150] as const;

function ShuffleDeckDialog({
  userId,
  cards,
  onClose,
  onCreated,
}: {
  userId: string;
  cards: Card[];
  onClose: () => void;
  onCreated: (deck: Deck) => void;
}) {
  const [size, setSize] = useState<(typeof SHUFFLE_SIZES)[number]>(100);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setError(null);
    setBusy(true);
    try {
      const picked = pickBalancedByDecade(cards, size);
      const ordered = arrangeNoAdjacentYear(picked);
      const date = new Date().toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
      const name = `Random Deck - ${ordered.length} Cards - ${date}`;
      const deck = await createDeck(userId, name);
      await bulkAddCardsToDeck(deck.id, ordered.map((c) => c.id));
      onCreated(deck);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate deck");
      setBusy(false);
    }
  }

  const preview = pickBalancedByDecade(cards, size);
  const decadeCounts = decadeBreakdown(preview);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center">
      <div className="glass-strong relative w-full max-w-md rounded-t-3xl sm:rounded-3xl p-5">
        <button onClick={onClose} className="absolute right-3 top-3 rounded-full p-2 text-muted-foreground">
          <X className="h-5 w-5" />
        </button>
        <h3 className="flex items-center gap-2 text-lg font-bold">
          <Shuffle className="h-5 w-5" /> Shuffle deck generator
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Balanced across decades. No two consecutive cards share the same year.
        </p>

        <p className="mt-4 text-xs font-medium text-muted-foreground">Deck size</p>
        <div className="mt-2 grid grid-cols-5 gap-2">
          {SHUFFLE_SIZES.map((n) => (
            <button
              key={n}
              onClick={() => setSize(n)}
              className={
                "rounded-xl py-2 text-sm font-semibold transition-colors " +
                (size === n
                  ? "gradient-neon text-[oklch(0.15_0_0)]"
                  : "bg-[var(--surface)] text-muted-foreground")
              }
            >
              {n}
            </button>
          ))}
        </div>

        <div className="mt-4 rounded-xl bg-[var(--surface)] p-3 text-xs">
          <p className="font-medium">
            Will generate {preview.length} card{preview.length === 1 ? "" : "s"}
            {preview.length < size && ` (only ${cards.length} eligible in pool)`}
          </p>
          {decadeCounts.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {decadeCounts.map(([d, n]) => (
                <span key={d} className="rounded-md bg-black/30 px-2 py-0.5 text-[10px]">
                  {d}s · {n}
                </span>
              ))}
            </div>
          )}
        </div>

        {error && (
          <p className="mt-3 rounded-xl bg-destructive/15 p-2 text-xs text-destructive">
            {error}
          </p>
        )}

        <button
          onClick={handleGenerate}
          disabled={busy || preview.length === 0}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl gradient-neon px-4 py-3 font-semibold text-[oklch(0.15_0_0)] disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shuffle className="h-4 w-4" />}
          Generate deck
        </button>
      </div>
    </div>
  );
}

function decadeOf(year: number) {
  return Math.floor(year / 10) * 10;
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickBalancedByDecade(pool: Card[], target: number): Card[] {
  const byDecade = new Map<number, Card[]>();
  for (const c of pool) {
    if (c.release_year == null) continue;
    const d = decadeOf(c.release_year);
    if (!byDecade.has(d)) byDecade.set(d, []);
    byDecade.get(d)!.push(c);
  }
  // shuffle each bucket for randomness
  const buckets = Array.from(byDecade.entries())
    .map(([d, cards]) => ({ decade: d, cards: shuffle(cards) }))
    .sort((a, b) => a.decade - b.decade);

  const picked: Card[] = [];
  let remaining = Math.min(target, pool.length);
  // Round-robin draw: gives even distribution, auto-adjusts when a bucket runs out.
  while (remaining > 0) {
    let drewAny = false;
    for (const b of buckets) {
      if (remaining === 0) break;
      const c = b.cards.pop();
      if (c) {
        picked.push(c);
        remaining--;
        drewAny = true;
      }
    }
    if (!drewAny) break;
  }
  return picked;
}

function decadeBreakdown(cards: Card[]): [number, number][] {
  const m = new Map<number, number>();
  for (const c of cards) {
    if (c.release_year == null) continue;
    const d = decadeOf(c.release_year);
    m.set(d, (m.get(d) ?? 0) + 1);
  }
  return Array.from(m.entries()).sort((a, b) => a[0] - b[0]);
}

/** Shuffle and ensure no two adjacent cards share the same release year. */
function arrangeNoAdjacentYear(cards: Card[]): Card[] {
  if (cards.length <= 1) return cards.slice();
  const arr = shuffle(cards);
  const n = arr.length;
  for (let i = 1; i < n; i++) {
    if (arr[i].release_year !== arr[i - 1].release_year) continue;
    // find a later card whose year differs from both neighbors and whose
    // current position's neighbors accept arr[i]'s year.
    let swapped = false;
    for (let j = i + 1; j < n; j++) {
      const yj = arr[j].release_year;
      const yi = arr[i].release_year;
      const prev = arr[i - 1].release_year;
      const jPrev = arr[j - 1].release_year;
      const jNext = j + 1 < n ? arr[j + 1].release_year : null;
      const okAtI = yj !== prev;
      const okAtJ =
        (j === i + 1 ? yi !== prev : yi !== jPrev) &&
        (jNext == null || yi !== jNext);
      if (okAtI && okAtJ) {
        [arr[i], arr[j]] = [arr[j], arr[i]];
        swapped = true;
        break;
      }
    }
    // last resort: swap with previous non-conflicting position walking back
    if (!swapped) {
      for (let j = i - 2; j >= 0; j--) {
        const yj = arr[j].release_year;
        const yi = arr[i].release_year;
        const before = j > 0 ? arr[j - 1].release_year : null;
        const after = arr[j + 1].release_year; // != i since j<i-1
        const iPrev = arr[i - 1].release_year;
        const iNext = i + 1 < n ? arr[i + 1].release_year : null;
        const okAtJ = (before == null || yi !== before) && yi !== after;
        const okAtI = yj !== iPrev && (iNext == null || yj !== iNext);
        if (okAtJ && okAtI) {
          [arr[i], arr[j]] = [arr[j], arr[i]];
          swapped = true;
          break;
        }
      }
    }
  }
  return arr;
}

function DeckRow({
  deck,
  count,
  countReady,
  onRename,
  onDelete,
  onOpen,
}: {
  deck: Deck;
  count: number;
  countReady: boolean;
  onRename: (n: string) => void;
  onDelete: () => void;
  onOpen: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(deck.name);

  async function save() {
    if (name.trim() && name !== deck.name) {
      await renameDeck(deck.id, name.trim());
      onRename(name.trim());
    }
    setEditing(false);
  }
  async function remove() {
    if (!confirm(`Delete deck "${deck.name}"?`)) return;
    await deleteDeck(deck.id);
    onDelete();
  }

  return (
    <li className="flex items-center gap-2 rounded-xl glass p-3">
      {editing ? (
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 rounded-md bg-[var(--surface)] p-2 text-sm"
        />
      ) : (
        <button onClick={onOpen} className="flex-1 text-left">
          <p className="text-sm font-medium">{deck.name}</p>
          <p className="text-xs text-muted-foreground">{countReady ? count : "…"} cards</p>
        </button>
      )}
      {editing ? (
        <>
          <button onClick={save} className="p-2 text-[var(--neon-green)]"><Check className="h-4 w-4" /></button>
          <button onClick={() => setEditing(false)} className="p-2 text-muted-foreground"><X className="h-4 w-4" /></button>
        </>
      ) : (
        <>
          <button onClick={() => setEditing(true)} className="p-2 text-muted-foreground hover:text-foreground"><Pencil className="h-4 w-4" /></button>
          <button onClick={remove} className="p-2 text-destructive"><Trash2 className="h-4 w-4" /></button>
        </>
      )}
    </li>
  );
}

function DeckCardPicker({ deck, cards, onClose }: { deck: Deck; cards: Card[]; onClose: () => void }) {
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listDeckCardIds(deck.id).then((ids) => {
      setMemberIds(new Set(ids));
      setLoading(false);
    });
  }, [deck.id]);

  async function toggle(card: Card) {
    const has = memberIds.has(card.id);
    const next = new Set(memberIds);
    if (has) {
      next.delete(card.id);
      setMemberIds(next);
      await removeCardFromDeck(deck.id, card.id);
    } else {
      next.add(card.id);
      setMemberIds(next);
      await addCardToDeck(deck.id, card.id);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center">
      <div className="glass-strong relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-5">
        <button onClick={onClose} className="absolute right-3 top-3 rounded-full p-2 text-muted-foreground">
          <X className="h-5 w-5" />
        </button>
        <h3 className="text-lg font-bold">{deck.name}</h3>
        <p className="mt-1 text-xs text-muted-foreground">Tap to add or remove cards.</p>
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (
          <ul className="mt-3 space-y-2">
            {cards.map((c) => {
              const has = memberIds.has(c.id);
              return (
                <li key={c.id}>
                  <button
                    onClick={() => toggle(c)}
                    className={
                      "flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors " +
                      (has ? "bg-[var(--neon-green)]/15 ring-1 ring-[var(--neon-green)]" : "bg-[var(--surface)]")
                    }
                  >
                    {c.cover_url ? (
                      <img src={c.cover_url} alt="" className="h-10 w-10 rounded-md object-cover" />
                    ) : (
                      <div className="h-10 w-10 rounded-md bg-muted" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{c.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{c.artist}</p>
                    </div>
                    <span className="text-xs">{has ? "✓" : "+"}</span>
                  </button>
                </li>
              );
            })}
            {cards.length === 0 && (
              <p className="py-4 text-center text-xs text-muted-foreground">
                No cards yet. Create some first.
              </p>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
