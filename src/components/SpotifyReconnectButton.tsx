import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Music2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { buildSpotifyAuthUrl } from "@/lib/music/spotify.functions";

/**
 * Full OAuth re-auth entry point shown when the Spotify grant is dead
 * (expired/revoked refresh token). Distinct from "Restart Spotify player",
 * which only rebuilds the Web Playback SDK device in this tab.
 *
 * Opens Spotify in a separate tab so the current game session is untouched.
 */
export function SpotifyReconnectButton({ className = "" }: { className?: string }) {
  const buildAuthUrl = useServerFn(buildSpotifyAuthUrl);
  const [busy, setBusy] = useState(false);

  async function reconnect() {
    setBusy(true);
    // Open synchronously inside the click so mobile browsers don't block it.
    const w = window.open("", "hiddenhits_spotify_oauth");
    try {
      const state = crypto.randomUUID();
      sessionStorage.setItem("spotify_oauth_state", state);
      localStorage.setItem("spotify_oauth_state", state);
      const { url } = await buildAuthUrl({
        data: { origin: window.location.origin, state },
      });
      if (w && !w.closed) w.location.href = url;
      else window.location.href = url;
    } catch (err) {
      w?.close();
      toast.error(err instanceof Error ? err.message : "Could not reconnect Spotify");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={reconnect}
      disabled={busy}
      className={`inline-flex w-full items-center justify-center gap-2 rounded-xl glass px-4 py-2.5 text-xs font-semibold disabled:opacity-50 ${className}`}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Music2 className="h-4 w-4 text-[#1DB954]" />}
      Reconnect Spotify
    </button>
  );
}
