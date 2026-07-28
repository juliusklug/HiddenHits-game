import type { OnlineCard } from "@/lib/online/types";
import { isPlacementCorrect, playableCards, shuffle, sortTimeline } from "@/lib/online/logic";


/** A player on this single device. */
export type PassPlayer = {
  id: string;
  name: string;
  score: number;
  timeline: OnlineCard[];
};

export type PassPhase = "handoff" | "playing" | "revealed" | "finished";

export type PassResult = {
  correct: boolean;
  card: OnlineCard;
  playerId: string;
  playerName: string;
  slotIndex: number;
};

export type PassGame = {
  deckName: string;
  deck: OnlineCard[];
  drawIndex: number;
  currentCard: OnlineCard | null;
  players: PassPlayer[];
  currentIndex: number;
  phase: PassPhase;
  lastResult: PassResult | null;
  targetScore: number;
  winnerId: string | null;
};

export const PASS_PLAY_TARGET = 10;

export function createPassGame(opts: {
  names: string[];
  deckName: string;
  cards: OnlineCard[];
  targetScore?: number;
}): PassGame {
  // Only cards with a release year AND a working audio preview can be drawn.
  const playable = shuffle(playableCards(opts.cards));
  const names = opts.names.map((n) => n.trim()).filter(Boolean);
  if (names.length < 2) throw new Error("Add at least 2 players.");
  if (playable.length < names.length + 4) {
    throw new Error("This deck needs more songs with a release year and playable audio.");
  }


  let index = 0;
  const players: PassPlayer[] = names.map((name, i) => ({
    id: `p${i + 1}`,
    name,
    score: 0,
    // Everyone starts with one revealed anchor card.
    timeline: [playable[index++]],
  }));

  return {
    deckName: opts.deckName,
    deck: playable,
    drawIndex: index,
    currentCard: null,
    players,
    currentIndex: 0,
    phase: "handoff",
    lastResult: null,
    targetScore: opts.targetScore ?? PASS_PLAY_TARGET,
    winnerId: null,
  };
}

/** Discards an unplayable card and deals the next one to the same player. */
export function skipCard(game: PassGame): PassGame {
  if (game.phase !== "playing") return game;
  if (game.drawIndex >= game.deck.length) {
    return { ...game, currentCard: null, phase: "finished", winnerId: leaderId(game) };
  }
  return {
    ...game,
    currentCard: game.deck[game.drawIndex],
    drawIndex: game.drawIndex + 1,
    lastResult: null,
  };
}



/** Deals the next hidden card to the active player. */
export function startTurn(game: PassGame): PassGame {
  if (game.drawIndex >= game.deck.length) {
    return { ...game, phase: "finished", winnerId: leaderId(game) };
  }
  return {
    ...game,
    currentCard: game.deck[game.drawIndex],
    drawIndex: game.drawIndex + 1,
    phase: "playing",
    lastResult: null,
  };
}

/** Places the current card at slotIndex on the active player's timeline. */
export function placeCard(game: PassGame, slotIndex: number): PassGame {
  const card = game.currentCard;
  const player = game.players[game.currentIndex];
  if (!card || !player || game.phase !== "playing") return game;

  const correct = isPlacementCorrect(player.timeline, card, slotIndex);
  const players = game.players.map((p) =>
    p.id === player.id
      ? {
          ...p,
          score: correct ? p.score + 1 : p.score,
          timeline: correct ? sortTimeline([...p.timeline, card]) : p.timeline,
        }
      : p,
  );

  const updated = players[game.currentIndex];
  const won = updated.score >= game.targetScore;

  return {
    ...game,
    players,
    phase: won ? "finished" : "revealed",
    winnerId: won ? updated.id : null,
    lastResult: {
      correct,
      card,
      playerId: player.id,
      playerName: player.name,
      slotIndex,
    },
  };
}

/** Passes the phone to the next player. */
export function nextTurn(game: PassGame): PassGame {
  if (game.phase === "finished") return game;
  const nextIndex = (game.currentIndex + 1) % game.players.length;
  if (game.drawIndex >= game.deck.length) {
    return { ...game, phase: "finished", winnerId: leaderId(game), currentCard: null };
  }
  return {
    ...game,
    currentIndex: nextIndex,
    currentCard: null,
    phase: "handoff",
    lastResult: null,
  };
}

export function leaderId(game: PassGame): string | null {
  const sorted = [...game.players].sort((a, b) => b.score - a.score);
  return sorted[0]?.id ?? null;
}

/* ------------------------------------------------------------- persistence */

const STORAGE_KEY = "hu_pass_play_game";

export function savePassGame(game: PassGame | null) {
  try {
    if (!game) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(game));
  } catch {
    /* ignore */
  }
}

export function loadPassGame(): PassGame | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PassGame;
    if (!parsed?.players?.length) return null;
    return parsed;
  } catch {
    return null;
  }
}
