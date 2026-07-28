import { useEffect, useState } from "react";
import { Pause, Play, RefreshCw, RotateCcw, SkipForward, Eye, ExternalLink, Loader2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useMusicPlayer } from "@/lib/music/useMusicPlayer";
import type { TrackMeta } from "@/lib/music/provider";
import { fetchCardByTrackId } from "@/lib/cards-api";
import { SpotifyReconnectButton } from "@/components/SpotifyReconnectButton";
import { SpotifyAttribution } from "@/components/SpotifyAttribution";

type Props = {
  trackId: string;
  onSkip?: () => void;
};

export function HiddenPlayer({ trackId, onSkip }: Props) {
  const [meta, setMeta] = useState<TrackMeta | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setMeta(null);
    setMetaError(null);
    setRevealed(false);
    (async () => {
      try {
        // Saved card (with any manual year correction) wins over provider metadata.
        const [providerMeta, card] = await Promise.all([
          fetch(`/api/deezer/track/${encodeURIComponent(trackId)}`).then(async (r) => {
            if (!r.ok)
              throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
            return (await r.json()) as TrackMeta;
          }),
          fetchCardByTrackId(trackId).catch(() => null),
        ]);
        if (cancelled) return;
        setMeta(
          card
            ? {
                ...providerMeta,
                title: card.title || providerMeta.title,
                artist: card.artist || providerMeta.artist,
                album: card.album ?? providerMeta.album,
                cover: card.cover_url ?? providerMeta.cover,
                releaseYear: card.release_year ?? providerMeta.releaseYear,
              }
            : providerMeta,
        );
      } catch (e) {
        if (cancelled) return;
        setMetaError((e as Error).message || "Couldn't load this card.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [trackId]);


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
  } = useMusicPlayer(trackId, meta);

  // Invoked directly from onClick so the browser sees a real user gesture.
  const togglePlay = () => {
    if (state.isPlaying) pause();
    else void resume();
  };

  // The tap that skips also re-unlocks audio for the incoming card.
  const handleSkip = onSkip
    ? () => {
        resetAudio();
        onSkip();
      }
    : undefined;

  const isPlaying = state.isPlaying;
  const playbackError = state.error?.replace(/^SPOTIFY_REAUTH:\s*/i, "") ?? null;
  const needsTap = state.needsUserGesture && !isPlaying;

  return (
    <div className="relative flex min-h-[100svh] flex-col items-center justify-between px-6 py-10">
      <header className="w-full text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
          HiddenHits
        </p>
        {activeProvider && ready && (
          <SpotifyAttribution
            className="mt-1"
            activeProvider={activeProvider}
            trackUri={trackUri}
          />
        )}
      </header>

      {metaError ? (
        <div className="mx-auto max-w-sm rounded-2xl glass p-6 text-center">
          <p className="text-base font-semibold text-[var(--neon-green)]">
            Couldn't play this card
          </p>
          <p className="mt-2 text-sm text-muted-foreground">{metaError}</p>
          <Link
            to="/scan"
            className="mt-5 inline-flex items-center justify-center rounded-xl glass-strong px-4 py-2 text-sm"
          >
            Scan another
          </Link>
        </div>
      ) : !revealed ? (
        <div className="flex flex-col items-center text-center">
          <div className="relative">
            <div className="absolute inset-0 -m-10 rounded-full gradient-neon opacity-25 blur-3xl" />
            <div className="relative flex h-44 w-44 items-end justify-center gap-2 rounded-full glass-strong p-6 shadow-card">
              {loading || !ready || recovering ? (
                <Loader2 className="absolute inset-0 m-auto h-10 w-10 animate-spin text-[var(--neon-green)]" />
              ) : (
                <>
                  {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                    <span
                      key={i}
                      className="wave-bar"
                      style={{
                        animationDelay: `${i * 0.1}s`,
                        animationPlayState: isPlaying ? "running" : "paused",
                        opacity: isPlaying ? 1 : 0.4,
                      }}
                    />
                  ))}
                </>
              )}
            </div>
          </div>
          <h1 className="mt-10 text-3xl font-bold tracking-tight">Song Playing…</h1>
          <p className="mt-2 max-w-xs text-sm text-muted-foreground">
            Guess the artist, the title, and the year. Then reveal.
          </p>
        </div>
      ) : meta ? (
        <div className="flex flex-col items-center text-center animate-flip-in">
          {meta.cover && (
            <img
              src={meta.cover}
              alt=""
              className="h-44 w-44 rounded-2xl object-cover shadow-card"
            />
          )}
          <div className="mt-6 text-5xl font-bold text-gradient-neon">
            {meta.releaseYear ?? "—"}
          </div>
          <div className="mt-3 text-xl font-semibold">{meta.title}</div>
          <div className="text-sm text-muted-foreground">{meta.artist}</div>
          <a
            href={meta.deezerUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            Open in Deezer <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      ) : (
        <Loader2 className="h-8 w-8 animate-spin text-[var(--neon-green)]" />
      )}

      <div className="w-full max-w-sm">
        {fallbackReason && (
          <div className="mb-3 rounded-xl glass p-3 text-center text-xs text-muted-foreground">
            {fallbackReason}
          </div>
        )}
        {needsSpotifyReconnect && (
          <div className="mb-3">
            <SpotifyReconnectButton />
          </div>
        )}
        {needsTap && !isPlaying && !playbackError && (
          <div className="mb-3 rounded-xl glass p-3 text-center text-xs text-muted-foreground">
            Tap Play to start the song.
          </div>
        )}
        {playbackError && (
          <div className="mb-3 rounded-xl glass p-3 text-center text-xs text-muted-foreground">
            {playbackError}
          </div>
        )}
        {(playbackError || (needsSpotifyReconnect && activeProvider === "spotify")) && !unplayable && (
          <div className="mb-3 grid gap-2">
            {activeProvider === "spotify" && (
              <button
                onClick={() => void reconnectProvider()}
                disabled={recovering}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl glass px-5 py-3 text-sm font-semibold disabled:opacity-50"
              >
                {recovering ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Restart Spotify player
              </button>
            )}
            <button
              onClick={() => void retryCurrent()}
              disabled={recovering}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl glass-strong px-5 py-3 text-sm font-semibold disabled:opacity-50"
            >
              {recovering ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Retry Current Song
            </button>
          </div>
        )}
        {unplayable && handleSkip && (
          <button
            onClick={handleSkip}
            className="mb-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl glass-strong px-5 py-3 text-sm font-semibold"
          >
            <SkipForward className="h-4 w-4" /> Skip song
          </button>
        )}
        {!revealed && (
          <button
            onClick={() => setRevealed(true)}
            disabled={!meta}
            className="mb-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl gradient-neon px-6 py-4 text-base font-semibold text-[oklch(0.15_0_0)] glow-green transition-transform active:scale-[0.98] disabled:opacity-50"
          >
            <Eye className="h-5 w-5" />
            Reveal
          </button>
        )}

        <div className="flex items-center justify-around rounded-2xl glass-strong p-3">
          <ControlButton label="Replay" onClick={replay} disabled={!ready || unplayable}>
            <RotateCcw className="h-5 w-5" />
          </ControlButton>
          <button
            onClick={togglePlay}
            disabled={!ready || unplayable || recovering}
            aria-label={isPlaying ? "Pause" : "Play"}
            className="flex h-16 w-16 items-center justify-center rounded-full gradient-neon text-[oklch(0.15_0_0)] glow-green transition-transform active:scale-95 disabled:opacity-50"
          >
            {isPlaying ? <Pause className="h-7 w-7" /> : <Play className="h-7 w-7 translate-x-0.5" />}
          </button>
          <ControlButton label="Skip" onClick={handleSkip}>
            <SkipForward className="h-5 w-5" />
          </ControlButton>
        </div>

        {revealed && (
          <Link
            to="/scan"
            search={{ auto: 1 }}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl glass px-5 py-3 text-sm"
          >
            Next card
          </Link>
        )}
      </div>
    </div>
  );
}

function ControlButton({
  children,
  onClick,
  label,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      disabled={disabled}
      className="flex h-12 w-12 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
    >
      {children}
    </button>
  );
}
