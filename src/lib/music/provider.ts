// Provider-agnostic music playback interface.
// Concrete implementations: deezerPreviewProvider, spotifyProvider (and later appleProvider).

export type ProviderId = "spotify" | "deezer-preview" | "apple";

export type TrackMeta = {
  id: number;
  title: string;
  artist: string;
  album: string;
  cover: string;
  previewUrl: string;
  releaseYear: number | null;
  deezerUrl: string;
};

export type ResolvedTrack = {
  providerId: ProviderId;
  uri: string; // spotify:track:xxx OR preview URL for deezer-preview
  durationMs?: number;
  meta: TrackMeta;
};

export type PlayerState = {
  isPlaying: boolean;
  positionMs: number;
  durationMs: number;
  /** The provider is rebuilding its playback pipeline and will retry automatically. */
  recovering?: boolean;
  needsUserGesture?: boolean;
  /** The source can't be decoded/played at all — offer a "Skip song" action. */
  unplayable?: boolean;
  error?: string | null;
};


export interface MusicProvider {
  id: ProviderId;
  displayName: string;
  init(): Promise<void>;
  destroy(): Promise<void>;
  resolveTrack(trackId: string, meta: TrackMeta): Promise<ResolvedTrack | null>;
  /**
   * Prepare a track WITHOUT starting playback. Used on mobile where browsers
   * block programmatic .play() outside a user gesture — the UI shows a Play
   * button and calls resume() directly from the click handler.
   */
  load?(track: ResolvedTrack): Promise<void>;
  /**
   * Tear down and rebuild the underlying media pipeline. Called after a failed
   * track (and from the "Skip" gesture) so a stuck Safari audio element can't
   * poison every subsequent song.
   */
  reset?(): Promise<void>;
  play(track: ResolvedTrack): Promise<void>;
  pause(): Promise<void>;
  /** Must be safe to call synchronously from inside a click handler. */
  resume(): Promise<void>;
  seek(ms: number): Promise<void>;
  onStateChange(cb: (s: PlayerState) => void): () => void;
}
