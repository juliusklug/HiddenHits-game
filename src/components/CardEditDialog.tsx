import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { updateCard, type Card } from "@/lib/cards-api";

export function CardEditDialog({
  card,
  isAdmin = false,
  onClose,
  onSaved,
}: {
  card: Card;
  /** Admins can move a card between the official and their private library. */
  isAdmin?: boolean;
  onClose: () => void;
  onSaved: (updated: Card) => void;
}) {
  const [year, setYear] = useState<string>(
    card.release_year != null ? String(card.release_year) : "",
  );
  const [official, setOfficial] = useState(card.is_official);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentYear = new Date().getFullYear();

  async function handleSave() {
    setError(null);
    const trimmed = year.trim();
    let parsed: number | null = null;
    if (trimmed !== "") {
      if (!/^\d{4}$/.test(trimmed)) {
        setError("Please enter a valid four-digit year.");
        return;
      }
      const n = Number(trimmed);
      if (n < 1900 || n > currentYear + 1) {
        setError(`Year must be between 1900 and ${currentYear + 1}.`);
        return;
      }
      parsed = n;
    }
    setSaving(true);
    try {
      const patch: { release_year: number | null; is_official?: boolean } = {
        release_year: parsed,
      };
      if (isAdmin && official !== card.is_official) patch.is_official = official;
      await updateCard(card.id, patch);
      onSaved({ ...card, release_year: parsed, is_official: isAdmin ? official : card.is_official });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }


  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md rounded-t-3xl border border-border bg-[var(--surface)] p-5 sm:rounded-3xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Edit card</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-3 flex items-center gap-3 rounded-2xl bg-[var(--surface-elevated)] p-3">
          {card.cover_url ? (
            <img
              src={card.cover_url}
              alt=""
              className="h-14 w-14 rounded-md object-cover"
            />
          ) : (
            <div className="h-14 w-14 rounded-md bg-muted" />
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{card.title}</p>
            <p className="truncate text-xs text-muted-foreground">
              {card.artist}
            </p>
          </div>
        </div>

        <div className="mt-5">
          <label
            htmlFor="release-year"
            className="block text-sm font-medium"
          >
            Release year
          </label>
          <p className="mt-1 text-xs text-muted-foreground">
            The year used for gameplay, printing and reveal. Override the
            imported year if it's wrong (e.g. remasters, re-releases).
          </p>
          <input
            id="release-year"
            inputMode="numeric"
            pattern="\d{4}"
            maxLength={4}
            value={year}
            onChange={(e) =>
              setYear(e.target.value.replace(/[^\d]/g, "").slice(0, 4))
            }
            placeholder="e.g. 1982"
            className="mt-2 w-full rounded-xl border border-border bg-[var(--surface-elevated)] px-3 py-3 text-base outline-none focus:ring-2 focus:ring-[var(--neon-green)]"
          />
          {isAdmin && (
            <div className="mt-5">
              <p className="text-sm font-medium">Library</p>
              <div className="mt-2 flex rounded-2xl border border-border bg-[var(--surface-elevated)] p-1">
                <button
                  type="button"
                  onClick={() => setOfficial(true)}
                  aria-pressed={official}
                  className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
                    official ? "gradient-neon text-[oklch(0.15_0_0)]" : "text-muted-foreground"
                  }`}
                >
                  Official Library
                </button>
                <button
                  type="button"
                  onClick={() => setOfficial(false)}
                  aria-pressed={!official}
                  className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
                    !official ? "gradient-neon text-[oklch(0.15_0_0)]" : "text-muted-foreground"
                  }`}
                >
                  My Private Library
                </button>
              </div>
            </div>
          )}
          {error && (
            <p className="mt-2 text-xs text-destructive">{error}</p>
          )}
        </div>


        <div className="mt-6 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-2xl glass-strong px-4 py-3 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl gradient-neon px-4 py-3 text-sm font-semibold text-[oklch(0.15_0_0)] disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
