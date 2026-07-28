import { useState } from "react";
import { Loader2, Sparkles, SkipForward, Zap } from "lucide-react";
import type { BonusGuess } from "@/lib/online/types";

type Props = {
  onSubmit: (title: string, artist: string) => Promise<void>;
  onSkip: () => Promise<void>;
};

/** Optional pre-placement bonus round: name the song + artist for a steal token. */
export function BonusGuessCard({ onSubmit, onSkip }: Props) {
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-5 rounded-2xl glass-strong p-4">
      <p className="flex items-center justify-center gap-1.5 text-sm font-bold">
        <Sparkles className="h-4 w-4 text-[var(--neon-pink)]" />
        Do you know the song?
      </p>
      <p className="mt-1 text-center text-[11px] text-muted-foreground">
        Both right = +1 Steal Token. Optional — you can skip.
      </p>

      <label className="mt-3 block text-[10px] uppercase tracking-widest text-muted-foreground">
        Song title
      </label>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Song title"
        className="mt-1 w-full rounded-xl glass px-3 py-2.5 text-sm outline-none"
      />
      <label className="mt-3 block text-[10px] uppercase tracking-widest text-muted-foreground">
        Artist
      </label>
      <input
        value={artist}
        onChange={(e) => setArtist(e.target.value)}
        placeholder="Artist"
        className="mt-1 w-full rounded-xl glass px-3 py-2.5 text-sm outline-none"
      />

      <div className="mt-4 flex gap-2">
        <button
          onClick={() => void run(() => onSubmit(title, artist))}
          disabled={busy || !title.trim() || !artist.trim()}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl gradient-neon px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
          Submit guess
        </button>
        <button
          onClick={() => void run(onSkip)}
          disabled={busy}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl glass px-4 py-3 text-sm font-semibold disabled:opacity-50"
        >
          <SkipForward className="h-4 w-4" /> Skip
        </button>
      </div>
    </div>
  );
}

/** Feedback shown after the active player guessed or skipped. */
export function BonusGuessResult({ guess, mine }: { guess: BonusGuess; mine: boolean }) {
  if (guess.skipped) {
    return (
      <p className="mt-4 text-center text-xs text-muted-foreground">
        {mine ? "You skipped the bonus guess." : `${guess.playerName} skipped the bonus guess.`}
      </p>
    );
  }
  return (
    <div
      className={
        "mt-4 rounded-2xl px-4 py-3 text-center " +
        (guess.correct
          ? "glass-strong ring-2 ring-[var(--neon-green)]"
          : "glass ring-1 ring-white/10")
      }
    >
      {guess.correct ? (
        <>
          <p className="text-sm font-bold text-[var(--neon-green)]">Congratulations!</p>
          <p className="text-xs text-muted-foreground">
            {mine ? "You" : guess.playerName} earned an extra Steal Token.
          </p>
        </>
      ) : (
        <>
          <p className="text-sm font-semibold text-[var(--neon-pink)]">Not quite — no token.</p>
          <p className="text-[11px] text-muted-foreground">
            Title {guess.titleCorrect ? "✓" : "✗"} · Artist {guess.artistCorrect ? "✓" : "✗"}
          </p>
        </>
      )}
    </div>
  );
}
