import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Music2, Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import {
  buildSpotifyAuthUrl,
  disconnectSpotify,
  getSpotifyConnection,
} from "@/lib/music/spotify.functions";
import { destroySpotifyPlayback } from "@/lib/music/useMusicPlayer";

type Connection = {
  display_name: string | null;
  product: string | null;
  connected_at: string;
} | null;

type OAuthDebugStep = {
  step: string;
  status: "pending" | "ok" | "error";
  detail: string;
};

function describeError(err: unknown) {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return "Unknown error";
  }
}

export function MusicProviderSection() {
  const buildAuthUrl = useServerFn(buildSpotifyAuthUrl);
  const fetchConnection = useServerFn(getSpotifyConnection);
  const disconnectSpotifyAccount = useServerFn(disconnectSpotify);
  const [conn, setConn] = useState<Connection>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [debugSteps, setDebugSteps] = useState<OAuthDebugStep[]>([]);

  useEffect(() => {
    void refresh();
  }, []);

  async function refresh() {
    setLoading(true);
    try {
      const c = await fetchConnection();
      setConn(c);
    } catch {
      setConn(null);
    } finally {
      setLoading(false);
    }
  }

  async function connect() {
    setBusy(true);
    setDebugSteps([]);
    const embedded = window.self !== window.top;
    let oauthWindow: Window | null = null;
    const record = (step: string, status: OAuthDebugStep["status"], detail: string) => {
      console.info(`[spotify-oauth:connect] ${step}`, { status, detail });
      setDebugSteps((prev) => [...prev, { step, status, detail }]);
    };
    try {
      record("Connect button pressed", "ok", `origin=${window.location.origin}`);
      if (embedded) {
        oauthWindow = window.open("", "hiddenhits_spotify_oauth");
        if (oauthWindow) {
          oauthWindow.document.write("<title>Opening Spotify…</title><body style='background:#050505;color:white;font-family:sans-serif;display:grid;place-items:center;min-height:100vh;margin:0'>Opening Spotify…</body>");
          oauthWindow.opener = null;
          record("Preview frame detected", "ok", "Spotify blocks iframe login pages, so OAuth will open in a top-level tab/window.");
        } else {
          record("Preview frame detected", "error", "Popup was blocked. The app will try same-frame navigation, which Spotify may block.");
        }
      }
      const state = crypto.randomUUID();
      sessionStorage.setItem("spotify_oauth_state", state);
      localStorage.setItem("spotify_oauth_state", state);
      record("State generated", "ok", `state_saved=true; storage=session+local; length=${state.length}`);
      record("OAuth URL request", "pending", "Asking server to build Spotify authorize URL");
      const { url, debug } = await buildAuthUrl({
        data: { origin: window.location.origin, state },
      });
      const parsed = new URL(url);
      record(
        "OAuth URL generated",
        "ok",
        `host=${parsed.host}; client_id_present=${parsed.searchParams.has("client_id")}; redirect_uri=${parsed.searchParams.get("redirect_uri")}; scope=${debug.scope}`,
      );
      if (embedded && oauthWindow && !oauthWindow.closed) {
        record("Redirect to Spotify", "pending", "Opening accounts.spotify.com in the top-level OAuth window");
        oauthWindow.location.href = url;
      } else {
        record("Redirect to Spotify", "pending", "Leaving app for accounts.spotify.com");
        window.location.href = url;
      }
    } catch (err) {
      const detail = describeError(err) || "Could not start Spotify sign-in";
      oauthWindow?.close();
      record("OAuth URL request", "error", detail);
      toast.error(detail);
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      await disconnectSpotifyAccount({});
      await destroySpotifyPlayback();
      toast.success("Spotify disconnected");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not disconnect");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl glass-strong p-5">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#1DB954]/15">
            <Music2 className="h-6 w-6 text-[#1DB954]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold">Spotify</h3>
              {conn && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#1DB954]/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#1DB954]">
                  <CheckCircle2 className="h-3 w-3" /> Connected
                </span>
              )}
            </div>
            {loading ? (
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Checking…
              </div>
            ) : conn ? (
              <div className="mt-1 text-xs text-muted-foreground">
                {conn.display_name}{" "}
                <span className="capitalize">· {conn.product ?? "unknown"}</span>
              </div>
            ) : (
              <div className="mt-1 text-xs text-muted-foreground">
                Play full songs during hidden playback (Premium required).
              </div>
            )}
          </div>
        </div>

        <div className="mt-4">
          {conn ? (
            <button
              onClick={disconnect}
              disabled={busy}
              className="w-full rounded-xl glass px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
            >
              {busy ? "Working…" : "Disconnect Spotify"}
            </button>
          ) : (
            <button
              onClick={connect}
              disabled={busy}
              className="w-full rounded-xl bg-[#1DB954] px-4 py-2.5 text-sm font-semibold text-black transition-transform active:scale-[0.98] disabled:opacity-50"
            >
              {busy ? "Redirecting…" : "Connect Spotify Premium"}
            </button>
          )}
        </div>

        {debugSteps.length > 0 && (
          <div className="mt-4 rounded-xl glass p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">OAuth trace</p>
            <ol className="space-y-2 text-xs">
              {debugSteps.map((item, index) => (
                <li key={`${item.step}-${index}`} className="grid grid-cols-[auto_1fr] gap-2">
                  <span
                    className={
                      item.status === "ok"
                        ? "text-[var(--neon-green)]"
                        : item.status === "error"
                          ? "text-red-300"
                          : "text-yellow-200"
                    }
                  >
                    ●
                  </span>
                  <span>
                    <span className="font-medium">{item.step}</span>
                    <span className="block break-words text-muted-foreground">{item.detail}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>

      <div className="rounded-2xl glass p-5">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full glass-strong">
            <Music2 className="h-6 w-6 text-[var(--neon-green)]" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold">Deezer Preview</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              30-second previews. Always on. Used as fallback if Spotify isn't available.
            </p>
          </div>
        </div>
      </div>

      <p className="px-1 text-xs text-muted-foreground">
        Apple Music support is planned. All providers hide song info until you Reveal.
      </p>
      <a
        href="https://www.spotify.com/premium/"
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 px-1 text-xs text-muted-foreground hover:text-foreground"
      >
        What is Spotify Premium? <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}
