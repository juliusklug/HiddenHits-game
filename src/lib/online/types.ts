export type OnlineCard = {
  id: string;
  trackId: string;
  title: string;
  artist: string;
  album: string | null;
  cover: string | null;
  previewUrl: string | null;
  year: number | null;
};

export type RoomStatus = "lobby" | "playing" | "finished";
export type RoomPhase = "idle" | "playing" | "stealing" | "revealed";

export type PendingPlacement = {
  playerId: string;
  playerName: string;
  slotIndex: number;
  correct: boolean;
};

export type StealAttempt = {
  playerId: string;
  playerName: string;
  slotIndex: number;
  correct: boolean;
};

export type LastResult = {
  correct: boolean;
  card: OnlineCard;
  playerId: string;
  playerName: string;
  slotIndex: number;
  steal?: {
    playerName: string;
    slotIndex: number;
    correct: boolean;
    /** True when the stealer took the card off the active player. */
    stolen: boolean;
  } | null;
};

export type BonusGuess = {
  playerId: string;
  playerName: string;
  skipped: boolean;
  titleCorrect: boolean;
  artistCorrect: boolean;
  correct: boolean;
  guessedTitle: string;
  guessedArtist: string;
};

export type Room = {
  id: string;
  code: string;
  host_user_id: string | null;
  deck_id: string | null;
  deck_name: string | null;
  status: RoomStatus;
  phase: RoomPhase;
  deck: OnlineCard[];
  draw_index: number;
  current_card: OnlineCard | null;
  current_player_id: string | null;
  target_score: number;
  winner_player_id: string | null;
  last_result: LastResult | null;
  bonus_guess: BonusGuess | null;
  pending_placement: PendingPlacement | null;
  steal: StealAttempt | null;
  steal_ends_at: string | null;
  created_at: string;
};

export type Player = {
  id: string;
  room_id: string;
  user_id: string | null;
  name: string;
  turn_order: number;
  score: number;
  is_ready: boolean;
  is_host: boolean;
  timeline: OnlineCard[];
  steal_tokens: number;
  steal_ready: boolean;
  created_at: string;
};
