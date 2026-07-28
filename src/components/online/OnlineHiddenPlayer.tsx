import { useEffect, useMemo, useState } from "react";
import { Loader2, Pause, Play, RefreshCw, RotateCcw, SkipForward } from "lucide-react";
import { useMusicPlayer } from "@/lib/music/useMusicPlayer";
import { SpotifyReconnectButton } from "@/components/SpotifyReconnectButton";
import { SpotifyAttribution } from "@/components/SpotifyAttribution";
import type { TrackMeta } from "@/lib/music/provider";
import type { OnlineCard } from "@/lib/online/types";

/** Plays the drawn card with every detail hidden. */
export function OnlineHiddenPlayer({
  card,
  onSkip,
}: {
  card: OnlineCard;
  /** Shown when the track can't be played so the game never gets stuck. */
  onSkip?: () => void;
}) {
  const [fetched, setFetched] = useState<TrackMeta | null>(null);

  const meta = useMemo<TrackMeta | null>(() => {
    if (card.previewUrl) {
      return {
        id: Number(card.trackId) || 0,
        title: card.title,
        artist: card.artist,
        album: card.album ?? "",
        cover: card.cover ?? "",
        previewUrl: card.previewUrl,
        releaseYear: card.year,
        deezerUrl: `https://www.deezer.com/track/${card.trackId}`,
      };
    }
    return fetched;
  }, [card, fetched]);

  useEffect(() => {
    if (card.previewUrl) return;
    let cancelled = false;
    setFetched(null);
    fetch(`/api/deezer/track/${encodeURIComponent(card.trackId)}`)
      .then((r) => (r.ok ? (r.json() as Promise<TrackMeta>) : null))
      .then((m) => {
        if (!cancelled && m) setFetched(m);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [card.trackId, card.previewUrl]);

  const {
    state,
    activeProvider,
    trackUri,
    fallbackReason,
    loading,
    ready,
    needsSpotifyReconnect,
    unplayable,
    recovering,
    pause,
    resume,
    replay,
    retryCurrent,
    reconnectProvider,
    resetAudio,
  } = useMusicPlayer(card.trackId, meta);

  // Use the physical tap to unlock audio again before the next card loads.
  const handleSkip = onSkip
    ? () => {
        resetAudio();
        onSkip();
      }
    : undefined;

  const isPlaying = state.isPlaying;
  const playbackError = state.error?.replace(/^SPOTIFY_REAUTH:\s*/i, "") ?? null;

  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        <div className="absolute inset-0 -m-8 rounded-full gradient-neon opacity-25 blur-3xl" />
        <div className="relative flex h-32 w-32 items-end justify-center gap-1.5 rounded-full glass-strong p-5 shadow-card">
          {loading || !ready || recovering ? (
            <Loader2 className="absolute inset-0 m-auto h-8 w-8 animate-spin text-[var(--neon-pink)]" />
          ) : (
            [0, 1, 2, 3, 4, 5, 6].map((i) => (
              <span
                key={i}
                className="wave-bar"
                style={{
                  animationDelay: `${i * 0.1}s`,
                  animationPlayState: isPlaying ? "running" : "paused",
                  opacity: isPlaying ? 1 : 0.4,
                }}
              />
            ))
          )}
        </div>
      </div>
      <p className="mt-4 text-lg font-bold">Song Playing…</p>
      {activeProvider && ready && (
        <SpotifyAttribution
          className="mt-0.5"
          activeProvider={activeProvider}
          trackUri={trackUri}
        />
      )}
      {fallbackReason && (
        <p className="mt-2 text-center text-[11px] text-muted-foreground">{fallbackReason}</p>
      )}
      {playbackError && (
        <p className="mt-2 text-center text-[11px] text-muted-foreground">{playbackError}</p>
      )}

      {needsSpotifyReconnect && (
        <div className="mt-3 w-full max-w-xs">
          <SpotifyReconnectButton />
        </div>
      )}

      {(playbackError || (needsSpotifyReconnect && activeProvider === "spotify")) && !unplayable && (
        <div className="mt-3 grid w-full max-w-xs gap-2">
          {activeProvider === "spotify" && (
            <button
              onClick={() => void reconnectProvider()}
              disabled={recovering}
              className="inline-flex items-center justify-center gap-2 rounded-xl glass px-4 py-2 text-xs font-semibold disabled:opacity-50"
            >
              {recovering ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Restart Spotify player
            </button>
          )}
          <button
            onClick={() => void retryCurrent()}
            disabled={recovering}
            className="inline-flex items-center justify-center gap-2 rounded-xl glass-strong px-4 py-2 text-xs font-semibold disabled:opacity-50"
          >
            {recovering ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Retry Current Song
          </button>
        </div>
      )}

      {unplayable && handleSkip && (
        <button
          onClick={handleSkip}
          className="mt-3 inline-flex items-center justify-center gap-2 rounded-xl glass-strong px-4 py-2 text-xs font-semibold"
        >
          <SkipForward className="h-4 w-4" /> Skip song
        </button>
      )}

      <div className="mt-4 flex items-center gap-4">
        <button
          onClick={replay}
          aria-label="Replay"
          disabled={!ready || unplayable}
          className="flex h-11 w-11 items-center justify-center rounded-full glass text-muted-foreground disabled:opacity-40"
        >
          <RotateCcw className="h-5 w-5" />
        </button>
        <button
          onClick={() => (isPlaying ? pause() : void resume())}
          aria-label={isPlaying ? "Pause" : "Play"}
          disabled={!ready || unplayable || recovering}
          className="flex h-14 w-14 items-center justify-center rounded-full gradient-neon text-white glow-green disabled:opacity-50"
        >
          {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6 translate-x-0.5" />}
        </button>
      </div>
    </div>
  );
}
