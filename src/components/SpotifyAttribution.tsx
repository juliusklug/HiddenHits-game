import { ExternalLink } from "lucide-react";
import type { ProviderId } from "@/lib/music/provider";

/**
 * Streaming-service attribution required by the provider's developer guidelines:
 * when audio comes from Spotify we credit the service and link to the track
 * itself. Deezer previews get the equivalent credit.
 */
export function SpotifyAttribution({
  activeProvider,
  trackUri,
  className = "",
}: {
  activeProvider: ProviderId | null;
  trackUri: string | null;
  className?: string;
}) {
  if (!activeProvider) return null;

  if (activeProvider === "spotify") {
    const id = trackUri?.startsWith("spotify:track:") ? trackUri.split(":")[2] : null;
    const href = id ? `https://open.spotify.com/track/${id}` : "https://open.spotify.com";
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className={`inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground/80 hover:text-foreground ${className}`}
      >
        <span
          aria-hidden
          className="inline-block h-2 w-2 rounded-full bg-[#1DB954]"
        />
        Powered by Spotify
        <ExternalLink className="h-3 w-3" />
      </a>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground/80 ${className}`}
    >
      30s preview · Powered by Deezer
    </span>
  );
}
