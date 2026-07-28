import { useEffect, useRef, useState } from "react";
import type { MusicProvider, PlayerState, ProviderId, ResolvedTrack, TrackMeta } from "./provider";
import { createDeezerPreviewProvider } from "./deezerPreviewProvider";
import { createSpotifyProvider, SPOTIFY_REAUTH } from "./spotifyProvider";
import { getSpotifyConnection } from "./spotify.functions";
import { resumeAudioContext, unlockAudio } from "./audioSession";
import { useAuth } from "@/hooks/use-auth";

export type UseMusicPlayerResult = {
  state: PlayerState;
  activeProvider: ProviderId | null;
  /** Resolved provider URI for the current track (used for Spotify attribution links). */
  trackUri: string | null;
  fallbackReason: string | null;
  loading: boolean;
  ready: boolean;
  /** Spotify is connected but its session died and couldn't be refreshed. */
  needsSpotifyReconnect: boolean;
  /** No provider can play this track — the UI should offer "skip song". */
  unplayable: boolean;
  /** The active provider is rebuilding its playback pipeline. */
  recovering: boolean;
  play: () => Promise<void>;
  pause: () => void;
  resume: () => Promise<void>;
  replay: () => Promise<void>;
  /** Rebuild only the music provider and retry the same track. */
  retryCurrent: () => Promise<void>;
  /** Rebuild only the active music provider without touching game state (SDK reset, not OAuth). */
  reconnectProvider: () => Promise<void>;
  /**
   * Call synchronously from a tap ("Skip song" / "Next card"): re-unlocks the
   * audio session and tears down the current media pipeline so the next track
   * starts clean.
   */
  resetAudio: () => void;
};

// Module-level singletons — persist across route changes / card scans so we do
// NOT tear down and re-initialize the Spotify Web Playback SDK on every card.
// The SDK is expensive to boot, and the second boot in the same tab is fragile
// (device-transfer, script re-load, event listener races). Keeping one instance
// per browser tab makes every scan behave like the first one.
type Cached = {
  provider: MusicProvider;
  initPromise: Promise<void>;
};
let spotifySingleton: Cached | null = null;
let deezerSingleton: Cached | null = null;
// Session-level decision: once we've confirmed Spotify Premium works, stay on it.
let sessionPreferredProvider: ProviderId | null = null;

function log(...args: unknown[]) {
  console.info("[music]", ...args);
}

function getSpotify(): Cached {
  if (spotifySingleton) return spotifySingleton;
  const provider = createSpotifyProvider();
  spotifySingleton = { provider, initPromise: provider.init() };
  return spotifySingleton;
}

function getDeezer(): Cached {
  if (deezerSingleton) return deezerSingleton;
  const provider = createDeezerPreviewProvider();
  deezerSingleton = { provider, initPromise: provider.init() };
  return deezerSingleton;
}

/** Tear down the Spotify Web Playback singleton (e.g. after account disconnect). */
export async function destroySpotifyPlayback() {
  if (!spotifySingleton) {
    sessionPreferredProvider = null;
    return;
  }
  const cached = spotifySingleton;
  spotifySingleton = null;
  sessionPreferredProvider = null;
  await cached.provider.destroy().catch(() => {});
}

/**
 * Loads track through the user's preferred provider (Spotify Premium if connected),
 * automatically falling back to Deezer Preview on any failure.
 */
export function useMusicPlayer(trackId: string, meta: TrackMeta | null): UseMusicPlayerResult {
  const { user } = useAuth();
  const [state, setState] = useState<PlayerState>({ isPlaying: false, positionMs: 0, durationMs: 0 });
  const [activeProvider, setActiveProvider] = useState<ProviderId | null>(null);
  const [trackUri, setTrackUri] = useState<string | null>(null);
  const [fallbackReason, setFallbackReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [needsSpotifyReconnect, setNeedsSpotifyReconnect] = useState(false);
  const [unplayable, setUnplayable] = useState(false);
  const activeRef = useRef<MusicProvider | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);
  const currentTrackRef = useRef<ResolvedTrack | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setReady(false);
    setFallbackReason(null);
    setUnplayable(false);
    setTrackUri(null);
    currentTrackRef.current = null;

    async function pauseOther(keep: MusicProvider) {
      if (spotifySingleton && spotifySingleton.provider !== keep) {
        await spotifySingleton.provider.pause().catch(() => {});
      }
      if (deezerSingleton && deezerSingleton.provider !== keep) {
        await deezerSingleton.provider.pause().catch(() => {});
      }
    }

    async function attach(p: MusicProvider): Promise<() => void> {
      const unsub = p.onStateChange((s) => {
        if (cancelled) return;
        setState(s);
        if (p.id === "spotify" && s.error) {
          const msg = s.error;
          if (msg.includes(SPOTIFY_REAUTH) || /auth|token|expired|401|403/i.test(msg)) {
            setNeedsSpotifyReconnect(true);
          }
        }
      });
      return unsub;
    }

    async function playWith(p: MusicProvider): Promise<boolean> {
      const track = await p.resolveTrack(trackId, meta!);
      log("resolve", { provider: p.id, trackId, resolved: !!track, uri: track?.uri });
      if (!track) return false;
      currentTrackRef.current = track;
      if (!cancelled) setTrackUri(track.uri);
      await pauseOther(p);
      if (p.load) {
        // Mobile browsers refuse programmatic .play() outside a user gesture.
        // Just buffer the audio; the visible Play button starts it.
        await p.load(track);
      } else {
        await p.play(track);
      }
      return true;
    }

    async function setup() {
      if (!meta) return;

      // A previous track may have left the audio session suspended.
      await resumeAudioContext();

      // Detach previous listener (but keep providers alive!).
      unsubRef.current?.();
      unsubRef.current = null;

      // Decide whether to attempt Spotify. Once we've confirmed Premium in
      // this session we skip the round-trip; otherwise re-check every card so
      // a fresh connection is picked up without a page reload.
      let attemptSpotify = sessionPreferredProvider === "spotify";
      let spotifyConnected = attemptSpotify;
      if (!attemptSpotify && user) {
        try {
          const conn = await getSpotifyConnection();
          log("connection check", { connected: !!conn, product: conn?.product });
          spotifyConnected = !!conn;
          if (conn?.product === "premium") {
            attemptSpotify = true;
          } else if (conn) {
            setFallbackReason("Spotify Free — using 30s preview");
          }
        } catch (e) {
          log("connection check failed", e);
        }
      }

      if (attemptSpotify) {
        try {
          const { provider, initPromise } = getSpotify();
          await initPromise;
          const unsub = await attach(provider);
          const ok = await playWith(provider);
          if (cancelled) return;
          if (!ok) throw new Error("Track not available on Spotify");
          unsubRef.current = unsub;
          activeRef.current = provider;
          sessionPreferredProvider = "spotify";
          setActiveProvider("spotify");
          setNeedsSpotifyReconnect(false);
          setReady(true);
          setLoading(false);
          log("active: spotify");
          return;
        } catch (err) {
          log("Spotify failed, falling back:", err);
          const msg = err instanceof Error ? err.message : String(err);
          const reauth = msg.includes(SPOTIFY_REAUTH) || /auth|token|expired|401/i.test(msg);
          setFallbackReason(
            /premium/i.test(msg)
              ? "Premium required — using 30s preview"
              : /not available/i.test(msg)
                ? "Track not on Spotify — using 30s preview"
                : reauth
                  ? "Spotify session expired — using 30s preview"
                  : "Spotify unavailable — using 30s preview",
          );
          if (reauth && spotifyConnected) setNeedsSpotifyReconnect(true);
          // Reset singleton on hard failures so a future card (or a fresh
          // reconnect) can retry from scratch.
          if (/init|auth|connect|Premium|token|expired/i.test(msg) && spotifySingleton) {
            await spotifySingleton.provider.destroy().catch(() => {});
            spotifySingleton = null;
            if (reauth) sessionPreferredProvider = null;
          }
        }
      }

      // Fallback: Deezer preview (per-track; do NOT lock the session to Deezer
      // if Spotify is connected — the next card should retry Spotify).
      try {
        const { provider, initPromise } = getDeezer();
        await initPromise;
        const unsub = await attach(provider);
        const ok = await playWith(provider);
        if (cancelled) return;
        if (!ok) throw new Error("Preview not available");
        unsubRef.current = unsub;
        activeRef.current = provider;
        setActiveProvider("deezer-preview");
        setReady(true);
        log("active: deezer-preview");
      } catch (err) {
        // Nothing can play this track — surface a skip affordance, not a raw error.
        setUnplayable(true);
        setState((s) => ({
          ...s,
          isPlaying: false,
          unplayable: true,
          error: "This song's audio isn't available — skip to the next card.",
        }));
      } finally {
        setLoading(false);
      }
    }

    void setup();
    return () => {
      cancelled = true;
      unsubRef.current?.();
      unsubRef.current = null;
      // Pause but do NOT destroy — keep providers alive for the next card.
      activeRef.current?.pause().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackId, meta?.previewUrl, user?.id]);

  return {
    state,
    activeProvider,
    trackUri,
    fallbackReason,
    loading,
    ready,
    needsSpotifyReconnect,
    unplayable: unplayable || !!state.unplayable,
    recovering: !!state.recovering,

    // NOTE: these must stay synchronous up to the underlying .play() call so
    // they can be invoked directly from a click handler.
    play() {
      return activeRef.current?.resume() ?? Promise.resolve();
    },
    pause() {
      activeRef.current?.pause();
    },
    resume() {
      return activeRef.current?.resume() ?? Promise.resolve();
    },
    replay() {
      const p = activeRef.current;
      if (!p) return Promise.resolve();
      // Don't await the seek — resume() must run inside the same user gesture.
      void p.seek(0);
      return p.resume();
    },
    async retryCurrent() {
      unlockAudio();
      const p = activeRef.current;
      if (!p) return;
      setUnplayable(false);
      setState((s) => ({ ...s, recovering: true, unplayable: false, error: null }));
      try {
        if (p.id === "spotify" && p.reset) {
          await p.reset();
          const track = currentTrackRef.current;
          if (track) await p.play(track);
          setNeedsSpotifyReconnect(false);
          return;
        }
        const track = currentTrackRef.current;
        if (track) {
          await p.play(track);
          return;
        }
        void p.seek(0);
        await p.resume();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes(SPOTIFY_REAUTH) || /auth|token|expired|401|403/i.test(msg)) {
          setNeedsSpotifyReconnect(true);
        }
        setState((s) => ({ ...s, isPlaying: false, recovering: false, error: msg }));
      } finally {
        setState((s) => ({ ...s, recovering: false }));
      }
    },
    async reconnectProvider() {
      unlockAudio();
      const p = activeRef.current;
      if (!p?.reset) return;
      setState((s) => ({ ...s, isPlaying: false, recovering: true, error: null }));
      try {
        await p.reset();
        if (p.id === "spotify") setNeedsSpotifyReconnect(false);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes(SPOTIFY_REAUTH) || /auth|token|expired|401|403/i.test(msg)) {
          setNeedsSpotifyReconnect(true);
        }
        setState((s) => ({ ...s, isPlaying: false, recovering: false, error: msg }));
      } finally {
        setState((s) => ({ ...s, recovering: false }));
      }
    },
    resetAudio() {
      // Must stay synchronous: the browser only grants the activation flag to
      // work started inside the tap itself.
      unlockAudio();
      void spotifySingleton?.provider.reset?.().catch(() => {
        void spotifySingleton?.provider.pause().catch(() => {});
      });
      void deezerSingleton?.provider.reset?.().catch(() => {});
      setUnplayable(false);
      setState((s) => ({ ...s, isPlaying: false, unplayable: false, error: null }));
    },
  };
}
