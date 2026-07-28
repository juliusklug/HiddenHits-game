// Guest mode local statistics, kept in localStorage so guests can play without
// an account and optionally migrate their progress on sign-up.

const KEY = "hitster.guest.stats.v1";

export type GuestStats = {
  games_played: number;
  songs_played: number;
  correct_guesses: number;
  total_guesses: number;
  decade_counts: Record<string, number>;
};

const empty = (): GuestStats => ({
  games_played: 0,
  songs_played: 0,
  correct_guesses: 0,
  total_guesses: 0,
  decade_counts: {},
});

export function readGuestStats(): GuestStats {
  if (typeof window === "undefined") return empty();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    return { ...empty(), ...JSON.parse(raw) };
  } catch {
    return empty();
  }
}

export function writeGuestStats(s: GuestStats) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(s));
}

export function clearGuestStats() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY);
}

export function hasGuestProgress(): boolean {
  const s = readGuestStats();
  return s.games_played + s.songs_played + s.total_guesses > 0;
}

export function favoriteDecade(counts: Record<string, number>): string | null {
  let best: string | null = null;
  let max = 0;
  for (const [k, v] of Object.entries(counts)) {
    if (v > max) {
      max = v;
      best = k;
    }
  }
  return best;
}

export function computeAccuracy(correct: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((correct / total) * 10000) / 100;
}
