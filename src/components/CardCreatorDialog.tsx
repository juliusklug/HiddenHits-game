import { useState, useRef, useEffect } from "react";
import { Loader2, Search, X } from "lucide-react";
import {
  fetchDeezerTrack,
  searchDeezer,
  createCard,
  type DeezerTrackMeta,
  type Card,
} from "@/lib/cards-api";

export function CardCreatorDialog({
  userId,
  isAdmin = false,
  onClose,
  onCreated,
}: {
  userId: string;
  /** Admins add songs straight to the shared official library. */
  isAdmin?: boolean;
  onClose: () => void;
  onCreated: (cards: Card[]) => void;
}) {
  // Admins choose where the song lands; everyone else writes to their own library.
  const [official, setOfficial] = useState(isAdmin);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="glass-strong relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-3xl p-5">
        <button
          aria-label="Close"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-full p-2 text-muted-foreground hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="text-center">
          <h2 className="text-xl font-bold">New card</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {isAdmin
              ? official
                ? "Search for a song to add to the official library."
                : "Search for a song to add to your private library."
              : "Search for a song to add to your private library."}
          </p>
        </div>

        {isAdmin && (
          <div className="mt-4">
            <p className="mb-2 text-center text-xs font-medium text-muted-foreground">
              Save to
            </p>
            <div className="flex rounded-2xl border border-border bg-[var(--surface)] p-1">
              <button
                type="button"
                onClick={() => setOfficial(true)}
                aria-pressed={official}
                className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
                  official
                    ? "gradient-neon text-[oklch(0.15_0_0)]"
                    : "text-muted-foreground"
                }`}
              >
                Official Library
              </button>
              <button
                type="button"
                onClick={() => setOfficial(false)}
                aria-pressed={!official}
                className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
                  !official
                    ? "gradient-neon text-[oklch(0.15_0_0)]"
                    : "text-muted-foreground"
                }`}
              >
                My Private Library
              </button>
            </div>
          </div>
        )}

        <div className="mt-6">
          <SearchTab userId={userId} official={isAdmin && official} onCreated={onCreated} />
        </div>
      </div>
    </div>
  );
}

function SearchTab({
  userId,
  official,
  onCreated,
}: {
  userId: string;
  official: boolean;
  onCreated: (c: Card[]) => void;
}) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<DeezerTrackMeta[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Small delay helps keep the input visible when the modal opens on mobile.
    const t = setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 100);
    return () => clearTimeout(t);
  }, []);

  async function handleSearch(e?: React.FormEvent) {
    e?.preventDefault();
    if (!q.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await searchDeezer(q);
      setResults(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setBusy(false);
    }
  }

  async function handlePick(t: DeezerTrackMeta) {
    setAddingId(t.id);
    setError(null);
    try {
      const meta = await fetchDeezerTrack(t.id); // gets releaseYear too
      const card = await createCard(userId, {
        title: meta.title,
        artist: meta.artist,
        release_year: meta.releaseYear,
        track_id: String(meta.id),
        cover_url: meta.cover,
        preview_url: meta.previewUrl,
        album: meta.album,
        is_official: official,
      });
      onCreated([card]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add card");
    } finally {
      setAddingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSearch} className="flex items-center justify-center gap-2">
        <div className="flex flex-1 max-w-sm items-center gap-2 rounded-2xl border border-border bg-[var(--surface)] p-1.5 focus-within:ring-2 focus-within:ring-[var(--neon-green)]">
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search song or artist…"
            enterKeyHint="search"
            className="flex-1 bg-transparent px-3 py-2 text-sm outline-none"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-xl gradient-neon px-4 py-2 font-semibold text-[oklch(0.15_0_0)] disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Go"}
          </button>
        </div>
      </form>

      {error && <p className="text-center text-xs text-destructive">{error}</p>}

      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
        {results.map((t) => (
          <button
            key={t.id}
            onClick={() => handlePick(t)}
            disabled={addingId === t.id}
            className="flex w-full items-center gap-3 rounded-xl bg-[var(--surface)] p-2 text-left transition-colors hover:bg-[var(--surface-elevated)] disabled:opacity-50"
          >
            {t.cover ? (
              <img src={t.cover} alt="" className="h-12 w-12 rounded-md object-cover" />
            ) : (
              <div className="h-12 w-12 rounded-md bg-muted" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{t.title}</p>
              <p className="truncate text-xs text-muted-foreground">{t.artist}</p>
            </div>
            {addingId === t.id && <Loader2 className="h-4 w-4 animate-spin" />}
          </button>
        ))}
        {!busy && results.length === 0 && q && (
          <p className="text-center text-xs text-muted-foreground">
            No matches yet — try another query.
          </p>
        )}
      </div>
    </div>
  );
}
