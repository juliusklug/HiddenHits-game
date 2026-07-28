import type { MusicProvider, PlayerState, ResolvedTrack, TrackMeta } from "./provider";
import { getSpotifyAccessToken, resolveSpotifyForCard } from "./spotify.functions";

/** Marker used so the UI can offer a full OAuth "Reconnect Spotify" button. */
export const SPOTIFY_REAUTH = "SPOTIFY_REAUTH";

// Minimal typings for the Spotify Web Playback SDK we use.
type SpotifyPlayerState = {
  paused: boolean;
  position: number;
  duration: number;
  track_window?: { current_track?: { id?: string } };
};

type SpotifyPlayer = {
  connect(): Promise<boolean>;
  disconnect(): void;
  addListener(
    event: string,
    cb: (payload: unknown) => void,
  ): boolean;
  getCurrentState(): Promise<SpotifyPlayerState | null>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  seek(ms: number): Promise<void>;
};

type ResetOptions = {
  clearListeners?: boolean;
  clearInit?: boolean;
};

declare global {
  interface Window {
    Spotify?: {
      Player: new (opts: {
        name: string;
        getOAuthToken: (cb: (token: string) => void) => void;
        volume?: number;
      }) => SpotifyPlayer;
    };
    onSpotifyWebPlaybackSDKReady?: () => void;
  }
}

let sdkLoadPromise: Promise<void> | null = null;
function loadSdk() {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.Spotify) return Promise.resolve();
  if (sdkLoadPromise) return sdkLoadPromise;
  sdkLoadPromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://sdk.scdn.co/spotify-player.js";
    s.async = true;
    s.onerror = () => {
      sdkLoadPromise = null;
      reject(new Error("Failed to load Spotify SDK"));
    };
    window.onSpotifyWebPlaybackSDKReady = () => resolve();
    document.head.appendChild(s);
  });
  return sdkLoadPromise;
}

const READY_TIMEOUT_MS = 12_000;
const RECOVERY_RETRY_DELAY_MS = 700;
const TOKEN_REFRESH_MS = 10 * 60 * 1000;
const RECOVERABLE_STATUS = new Set([404, 408, 409, 429, 500, 502, 503, 504]);

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(step: string, details: Record<string, unknown> = {}) {
  console.info(`[spotify-player] ${step}`, details);
}

function messageOf(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

function isAuthMessage(message: string) {
  return /auth|token|expired|unauthor|401/i.test(message);
}

function isRecoverableMessage(message: string) {
  return /disconnect|device|not ready|not_ready|connect|network|fetch|timeout|did not start|404|408|409|429|500|502|503|504/i.test(
    message,
  );
}

export function createSpotifyProvider(): MusicProvider {
  let player: SpotifyPlayer | null = null;
  let deviceId: string | null = null;
  let ready = false;
  const listeners = new Set<(s: PlayerState) => void>();
  let latest: PlayerState = { isPlaying: false, positionMs: 0, durationMs: 0 };
  let cachedToken = "";
  let lastTrack: ResolvedTrack | null = null;
  let refreshTimer: ReturnType<typeof setInterval> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let initPromise: Promise<void> | null = null;
  let recoveryPromise: Promise<void> | null = null;
  let generation = 0;
  let playSequence = 0;

  function emit(patch: Partial<PlayerState> = {}) {
    latest = { ...latest, ...patch };
    listeners.forEach((l) => l(latest));
  }

  async function fetchToken() {
    try {
      const r = await getSpotifyAccessToken({});
      cachedToken = r.accessToken;
      return r;
    } catch (err) {
      cachedToken = "";
      throw err;
    }
  }

  /** Keep the SDK session alive: proactively validate the token every 10 minutes. */
  function startRefreshLoop() {
    if (refreshTimer) return;
    refreshTimer = setInterval(
      () => {
        void fetchToken().catch(() => {
          /* the next play() will surface the failure */
        });
      },
      TOKEN_REFRESH_MS,
    );
  }

  function stopRefreshLoop() {
    if (!refreshTimer) return;
    clearInterval(refreshTimer);
    refreshTimer = null;
  }

  function clearReconnectTimer() {
    if (!reconnectTimer) return;
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  function disconnectPlayer(options: ResetOptions = {}) {
    clearReconnectTimer();
    generation += 1;
    ready = false;
    deviceId = null;
    const oldPlayer = player;
    player = null;
    try {
      oldPlayer?.disconnect();
    } catch (err) {
      log("disconnect_ignored", { message: messageOf(err) });
    }
    if (options.clearInit) initPromise = null;
    if (options.clearListeners) listeners.clear();
  }

  async function transferToDevice(accessToken: string) {
    if (!deviceId) throw new Error("Spotify device is not ready");
    const res = await fetch("https://api.spotify.com/v1/me/player", {
      method: "PUT",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ device_ids: [deviceId], play: false }),
    });
    if (!res.ok && res.status !== 204) {
      const text = await res.text().catch(() => "");
      throw new Error(`Spotify device transfer failed (${res.status}) ${text}`);
    }
  }

  async function putPlay(uri: string, accessToken: string) {
    return fetch(
      `https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(deviceId ?? "")}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ uris: [uri] }),
      },
    );
  }

  function scheduleRecovery(reason: string) {
    if (reconnectTimer || recoveryPromise) return;
    emit({ isPlaying: false, recovering: true, error: "Spotify disconnected — reconnecting…" });
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      void recoverCurrent(reason);
    }, RECOVERY_RETRY_DELAY_MS);
  }

  async function connectPlayer(reason = "init") {
    if (ready && player && deviceId) return;
    if (initPromise) return initPromise;

    const nextInitPromise = (async () => {
      // Require HTTPS — SDK refuses on http (except localhost).
      if (
        typeof window !== "undefined" &&
        window.location.protocol !== "https:" &&
        window.location.hostname !== "localhost"
      ) {
        throw new Error("Spotify Web Playback requires HTTPS");
      }

      log("connect:start", { reason });
      cachedToken = "";
      await fetchToken();
      await loadSdk();
      const spotify = window.Spotify;
      if (!spotify) throw new Error("Spotify SDK not available");

      disconnectPlayer();
      const myGeneration = generation;
      const nextPlayer = new spotify.Player({
        name: "HiddenHits",
        getOAuthToken: (cb) => {
          fetchToken()
            .then((r) => cb(r.accessToken))
            .catch((err) => {
              const message = messageOf(err);
              log("token_refresh_failed", { message });
              // Fail closed: never hand the SDK a stale/empty cached token.
              // Empty callback string surfaces authentication_error → SPOTIFY_REAUTH.
              cachedToken = "";
              emit({
                isPlaying: false,
                recovering: false,
                error: `${SPOTIFY_REAUTH}: ${message}`,
              });
              cb("");
            });
        },
        volume: 0.8,
      });
      player = nextPlayer;

      const readyPromise = new Promise<string>((resolve, reject) => {
        let settled = false;
        let timeout: ReturnType<typeof setTimeout> | null = null;
        const settle = (fn: () => void) => {
          if (settled || generation !== myGeneration) return;
          settled = true;
          if (timeout) clearTimeout(timeout);
          fn();
        };
        const fail = (err: Error) => {
          if (settled) return;
          settled = true;
          if (timeout) clearTimeout(timeout);
          reject(err);
        };
        timeout = setTimeout(() => {
          fail(new Error("Spotify player did not become ready"));
        }, READY_TIMEOUT_MS);

        nextPlayer.addListener("ready", (p) => {
          const d = (p as { device_id?: string }).device_id;
          if (!d) {
            fail(new Error("Spotify player did not return a playback device"));
            return;
          }
          settle(() => {
            deviceId = d;
            ready = true;
            emit({ error: null, recovering: false, unplayable: false });
            log("connect:ready", { reason, hasDeviceId: true });
            resolve(d);
          });
        });

        nextPlayer.addListener("not_ready", (p) => {
          if (generation !== myGeneration) return;
          const d = (p as { device_id?: string }).device_id;
          log("event:not_ready", { sameDevice: Boolean(d && d === deviceId) });
          ready = false;
          if (!d || d === deviceId) deviceId = null;
          emit({ isPlaying: false, recovering: true, error: "Spotify device disconnected — reconnecting…" });
          scheduleRecovery("device_not_ready");
        });

        nextPlayer.addListener("initialization_error", (e) => {
          const message = (e as { message?: string }).message ?? "Spotify SDK initialization failed";
          log("event:initialization_error", { message });
          fail(new Error(message));
        });

        nextPlayer.addListener("authentication_error", (e) => {
          const message = (e as { message?: string }).message ?? "Spotify authentication failed";
          log("event:authentication_error", { message });
          fail(new Error(`${SPOTIFY_REAUTH}: ${message}`));
          emit({ isPlaying: false, recovering: false, error: `${SPOTIFY_REAUTH}: ${message}` });
        });

        nextPlayer.addListener("account_error", (e) => {
          const message = (e as { message?: string }).message ?? "Spotify Premium required";
          log("event:account_error", { message });
          fail(new Error(message));
          emit({ isPlaying: false, recovering: false, error: message });
        });

        nextPlayer.addListener("playback_error", (e) => {
          if (generation !== myGeneration) return;
          const message = (e as { message?: string }).message ?? "Spotify playback failed";
          log("event:playback_error", { message });
          scheduleRecovery(message);
        });

        nextPlayer.addListener("autoplay_failed", () => {
          if (generation !== myGeneration) return;
          log("event:autoplay_failed");
          emit({
            isPlaying: false,
            recovering: false,
            needsUserGesture: true,
            error: "Tap Play to start Spotify playback.",
          });
        });
      });

      nextPlayer.addListener("player_state_changed", (raw) => {
        if (generation !== myGeneration) return;
        const s = raw as SpotifyPlayerState | null;
        if (!s) return;
        emit({
          isPlaying: !s.paused,
          positionMs: s.position,
          durationMs: s.duration,
          recovering: false,
          needsUserGesture: false,
          error: null,
        });
      });

      const ok = await nextPlayer.connect();
      if (!ok) throw new Error("Spotify player failed to connect");
      deviceId = await readyPromise;
      if (generation !== myGeneration) return;
      ready = true;
      startRefreshLoop();
    })().finally(() => {
      if (initPromise === nextInitPromise) initPromise = null;
    });
    initPromise = nextInitPromise;

    return initPromise;
  }

  async function playResolvedTrack(track: ResolvedTrack, sequence: number, allowRecovery: boolean) {
    if (sequence !== playSequence) return;
    await connectPlayer("play");
    if (sequence !== playSequence) return;

    let token = (await fetchToken()).accessToken;
    try {
      await transferToDevice(token);
    } catch (err) {
      const message = messageOf(err);
      log("transfer_failed", { message, allowRecovery });
      // Fail closed: never continue to play() without a successful transfer.
      if (isAuthMessage(message)) {
        cachedToken = "";
        token = (await fetchToken()).accessToken;
        await transferToDevice(token);
      } else {
        throw err;
      }
    }

    if (sequence !== playSequence) return;
    let res = await putPlay(track.uri, token);

    if (res.status === 401) {
      cachedToken = "";
      token = (await fetchToken()).accessToken;
      res = await putPlay(track.uri, token);
    }

    if (res.status === 404) {
      await transferToDevice(token);
      res = await putPlay(track.uri, token);
    }

    if (!res.ok && res.status !== 204) {
      const text = await res.text().catch(() => "");
      const message = `Spotify play failed (${res.status}) ${text}`;
      if (res.status === 401 || res.status === 403) {
        throw new Error(`${SPOTIFY_REAUTH}: ${message}`);
      }
      if (allowRecovery && RECOVERABLE_STATUS.has(res.status)) throw new Error(message);
      throw new Error(message);
    }

    emit({ recovering: false, needsUserGesture: false, error: null });
  }

  async function recoverCurrent(reason: string) {
    if (recoveryPromise) return recoveryPromise;
    const track = lastTrack;
    const sequence = playSequence;

    recoveryPromise = (async () => {
      log("recover:start", { reason, uri: track?.uri ?? null });
      emit({ isPlaying: false, recovering: true, error: "Spotify reconnecting — retrying this song…" });
      cachedToken = "";
      disconnectPlayer({ clearInit: true });
      await delay(RECOVERY_RETRY_DELAY_MS);
      if (sequence !== playSequence) return;
      await connectPlayer(`recover:${reason}`);
      if (!track) {
        emit({ recovering: false, error: null });
        return;
      }
      if (sequence !== playSequence) return;
      await playResolvedTrack(track, sequence, false);
      log("recover:success", { reason });
    })()
      .catch((err) => {
        const message = messageOf(err);
        log("recover:failed", { reason, message });
        emit({
          isPlaying: false,
          recovering: false,
          error: isAuthMessage(message)
            ? `${SPOTIFY_REAUTH}: ${message}`
            : "Spotify could not reconnect. Try Restart Spotify player, Retry Current Song, or reconnect your Spotify account.",
        });
      })
      .finally(() => {
        recoveryPromise = null;
      });

    return recoveryPromise;
  }

  return {
    id: "spotify",
    displayName: "Spotify",
    async init() {
      await connectPlayer("init");
    },
    async destroy() {
      stopRefreshLoop();
      disconnectPlayer({ clearListeners: true, clearInit: true });
      lastTrack = null;
      latest = { isPlaying: false, positionMs: 0, durationMs: 0 };
    },
    async reset() {
      // Rebuild only Spotify's media device, never the game room state.
      // The caller decides whether to replay the current song afterwards.
      emit({ isPlaying: false, recovering: true, error: "Restarting Spotify player…" });
      cachedToken = "";
      disconnectPlayer({ clearInit: true });
      await connectPlayer("manual_reset");
      emit({ recovering: false, error: null });
    },
    async resolveTrack(trackId: string, meta: TrackMeta): Promise<ResolvedTrack | null> {
      try {
        const r = await resolveSpotifyForCard({ data: { trackId } });
        if (!r.spotifyUri) return null;
        return { providerId: "spotify", uri: r.spotifyUri, meta };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/not connected|401|unauthor/i.test(msg)) {
          throw new Error(`${SPOTIFY_REAUTH}: ${msg}`);
        }
        return null;
      }
    },
    async play(track) {
      lastTrack = track;
      const sequence = (playSequence += 1);
      emit({ recovering: false, needsUserGesture: false, error: null });
      try {
        await playResolvedTrack(track, sequence, true);
      } catch (err) {
        const message = messageOf(err);
        if (isAuthMessage(message)) {
          throw new Error(message.includes(SPOTIFY_REAUTH) ? message : `${SPOTIFY_REAUTH}: ${message}`);
        }
        if (isRecoverableMessage(message)) {
          await recoverCurrent(message);
          return;
        }
        throw err;
      }
    },
    async pause() {
      await player?.pause().catch((err) => {
        log("pause_failed", { message: messageOf(err) });
      });
    },
    async resume() {
      try {
        await connectPlayer("resume");
        const state = await player?.getCurrentState().catch(() => null);
        if (!state && lastTrack) {
          await recoverCurrent("resume_without_state");
          return;
        }
        if (state?.paused) await player?.resume();
      } catch (err) {
        const message = messageOf(err);
        emit({ error: message });
        if (isRecoverableMessage(message)) await recoverCurrent(message);
      }
    },
    async seek(ms) {
      await player?.seek(ms).catch((err) => {
        log("seek_failed", { message: messageOf(err) });
      });
    },
    onStateChange(cb) {
      listeners.add(cb);
      cb(latest);
      return () => listeners.delete(cb);
    },
  };
}
