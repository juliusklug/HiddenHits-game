import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Loader2, CheckCircle2, XCircle, Copy, RotateCcw } from "lucide-react";
import { exchangeSpotifyCode, type SpotifyExchangeDebug } from "@/lib/music/spotify.functions";

export const Route = createFileRoute("/auth_/spotify/callback")({
  head: () => ({
    meta: [
      { title: "Connecting Spotify — HiddenHits" },
      { name: "description", content: "Completing your Spotify connection." },
      { property: "og:title", content: "Connecting Spotify — HiddenHits" },
      { property: "og:description", content: "Completing your Spotify connection." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SpotifyCallbackPage,
  errorComponent: SpotifyCallbackRouteError,
});

type DebugStep = {
  step: string;
  status: "pending" | "ok" | "error";
  detail: string;
};

type DebugCheckKey =
  | "routeLoaded"
  | "currentUrlCaptured"
  | "codeReceived"
  | "stateReceived"
  | "stateValidationPassed"
  | "accessTokenRequestSent"
  | "spotifyApiResponse"
  | "refreshTokenReceived"
  | "userInformationReceived"
  | "sessionSavedSuccessfully"
  | "redirectToProfileExecuted";

type DebugCheck = {
  label: string;
  value: boolean | null;
  detail: string;
};

const DEBUG_CHECK_LABELS: Record<DebugCheckKey, string> = {
  routeLoaded: "Callback route loaded successfully",
  currentUrlCaptured: "Current callback URL captured",
  codeReceived: "Authorization code received",
  stateReceived: "State parameter received",
  stateValidationPassed: "State validation passed",
  accessTokenRequestSent: "Access token request sent",
  spotifyApiResponse: "Spotify API response",
  refreshTokenReceived: "Refresh token received",
  userInformationReceived: "User information received",
  sessionSavedSuccessfully: "Session saved successfully",
  redirectToProfileExecuted: "Redirect to profile executed",
};

function createInitialChecks(): Record<DebugCheckKey, DebugCheck> {
  return Object.entries(DEBUG_CHECK_LABELS).reduce(
    (acc, [key, label]) => ({
      ...acc,
      [key]: {
        label,
        value: key === "routeLoaded" ? true : null,
        detail: key === "routeLoaded" ? "The Spotify callback screen rendered." : "Waiting",
      },
    }),
    {} as Record<DebugCheckKey, DebugCheck>,
  );
}

function describeError(err: unknown) {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return "Unknown error";
  }
}

function parseSpotifyDebug(message: string): SpotifyExchangeDebug | null {
  const marker = "SPOTIFY_DEBUG:";
  const start = message.indexOf(marker);
  if (start === -1) return null;
  const raw = message.slice(start + marker.length).trim();
  try {
    return JSON.parse(raw) as SpotifyExchangeDebug;
  } catch {
    return null;
  }
}

function cleanErrorMessage(message: string) {
  return message.split("\nSPOTIFY_DEBUG:")[0] || message;
}

function redactCallbackUrl(url: URL) {
  const safe = new URL(url.href);
  const code = safe.searchParams.get("code");
  const state = safe.searchParams.get("state");
  if (code) safe.searchParams.set("code", `[received:${code.length}]`);
  if (state) safe.searchParams.set("state", `[received:${state.length}]`);
  return safe.toString();
}

function SpotifyCallbackRouteError({ error }: { error: Error }) {
  return (
    <div className="flex min-h-[100svh] items-center justify-center px-6">
      <div className="w-full max-w-lg rounded-2xl glass-strong p-8">
        <XCircle className="mb-4 h-10 w-10 text-red-400" />
        <h1 className="text-xl font-semibold">Spotify authentication failed</h1>
        <p className="mt-2 text-sm text-muted-foreground">The callback route crashed before the OAuth exchange could start.</p>
        <p className="mt-3 rounded-xl glass p-3 font-mono text-xs text-red-200">{error.message}</p>
        <a href="/profile" className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl glass px-4 py-2 text-sm">
          <RotateCcw className="h-4 w-4" /> Retry from profile
        </a>
      </div>
    </div>
  );
}

function SpotifyCallbackPage() {
  const nav = useNavigate();
  const exchangeCode = useServerFn(exchangeSpotifyCode);
  const [status, setStatus] = useState<"working" | "ok" | "error">("working");
  const [message, setMessage] = useState("Finishing Spotify connection…");
  const [currentUrl, setCurrentUrl] = useState("");
  const [checks, setChecks] = useState<Record<DebugCheckKey, DebugCheck>>(createInitialChecks);
  const [debugSteps, setDebugSteps] = useState<DebugStep[]>([
    { step: "Callback route loaded successfully", status: "ok", detail: "The visual callback debugging screen rendered." },
  ]);

  function updateCheck(key: DebugCheckKey, value: boolean | null, detail: string) {
    setChecks((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        value,
        detail,
      },
    }));
  }

  function record(step: string, stepStatus: DebugStep["status"], detail: string) {
    console.info(`[spotify-oauth:callback] ${step}`, { status: stepStatus, detail });
    setDebugSteps((prev) => [...prev, { step, status: stepStatus, detail }]);
  }

  function fail(step: string, detail: string) {
    setStatus("error");
    setMessage(`Spotify authentication failed: ${detail}`);
    record(step, "error", detail);
  }

  function applyExchangeDebug(debug: SpotifyExchangeDebug) {
    updateCheck(
      "accessTokenRequestSent",
      debug.accessTokenRequestSent,
      debug.accessTokenRequestSent ? "Server sent a request to Spotify's token endpoint." : "Server did not reach Spotify's token endpoint.",
    );
    updateCheck("spotifyApiResponse", Boolean(debug.spotifyApiResponse), debug.spotifyApiResponse || "No Spotify API response returned.");
    updateCheck(
      "refreshTokenReceived",
      debug.refreshTokenReceived,
      debug.refreshTokenReceived ? "Spotify returned a refresh token." : "Spotify did not return a refresh token.",
    );
    updateCheck(
      "userInformationReceived",
      debug.userInformationReceived,
      debug.userInformationReceived ? "Spotify /v1/me returned a user profile." : "Spotify user profile was not received.",
    );
    updateCheck(
      "sessionSavedSuccessfully",
      debug.sessionSavedSuccessfully,
      debug.sessionSavedSuccessfully ? "Spotify connection was saved for this app account." : "Spotify connection was not saved.",
    );
  }

  useEffect(() => {
    let cancelled = false;

    async function finishConnection() {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");
        const returnedState = url.searchParams.get("state");
        const err = url.searchParams.get("error");
        const errDescription = url.searchParams.get("error_description");
        const safeUrl = redactCallbackUrl(url);
        setCurrentUrl(safeUrl);
        const sessionState = sessionStorage.getItem("spotify_oauth_state");
        const localState = localStorage.getItem("spotify_oauth_state");
        const savedState = sessionState ?? localState;

        updateCheck("routeLoaded", true, `Rendered at path=${url.pathname}`);
        updateCheck("currentUrlCaptured", true, safeUrl);
        record("Callback route received", "ok", `path=${url.pathname}; expected=/auth/spotify/callback; matches_expected=${url.pathname === "/auth/spotify/callback"}`);

        const hasCode = Boolean(code);
        updateCheck("codeReceived", hasCode, hasCode ? `Authorization code received (${code?.length ?? 0} characters).` : "No `code` query parameter was present.");
        const hasState = Boolean(returnedState);
        updateCheck("stateReceived", hasState, hasState ? "State query parameter is present." : "No `state` query parameter was present.");

        if (err) {
          const detail = errDescription ? `${err}: ${errDescription}` : err;
          updateCheck("stateValidationPassed", false, "Spotify returned an error before state validation completed.");
          updateCheck("accessTokenRequestSent", false, "Stopped before requesting an access token.");
          fail("Spotify authorization response", detail);
          return;
        }
        if (!code) {
          updateCheck("stateValidationPassed", false, "Cannot validate a callback that has no authorization code.");
          updateCheck("accessTokenRequestSent", false, "Stopped before requesting an access token.");
          fail("Authorization code", "Missing authorization code on Spotify callback URL.");
          return;
        }
        record("Authorization code", "ok", `Received code (${code.length} characters)`);

        const statePassed = Boolean(returnedState && savedState && returnedState === savedState);
        updateCheck(
          "stateValidationPassed",
          statePassed,
          statePassed
            ? "Returned state matches the state saved before Spotify redirect."
            : `returned_state_present=${Boolean(returnedState)}; saved_state_present=${Boolean(savedState)}; session_storage_present=${Boolean(sessionState)}; local_storage_present=${Boolean(localState)}; matched=${returnedState === savedState}`,
        );

        if (!statePassed) {
          updateCheck("accessTokenRequestSent", false, "Stopped before requesting an access token because state validation failed.");
          fail("State verification", "State mismatch. The callback did not match the state saved before redirect.");
          return;
        }
        record("State verification", "ok", "Returned state matches the state saved before redirect");

        sessionStorage.removeItem("spotify_oauth_state");
        localStorage.removeItem("spotify_oauth_state");

        updateCheck("accessTokenRequestSent", null, "Calling server exchange function; waiting for Spotify token endpoint result.");
        record("Token exchange request", "pending", "Calling the secure server exchange function");

        try {
          const r = await exchangeCode({ data: { code, origin: window.location.origin } });
          if (cancelled) return;
          applyExchangeDebug(r.debug);
          setStatus("ok");
          setMessage(`Connected as ${r.displayName} (${r.product})`);
          record("Token exchange and storage", "ok", `Connected as ${r.displayName}; product=${r.product}`);
          updateCheck("redirectToProfileExecuted", true, "Redirect scheduled to /profile after successful token exchange.");
          record("Redirect to profile", "ok", "Returning to profile in 2.5 seconds");
          setTimeout(() => nav({ to: "/profile" }), 2500);
        } catch (e) {
          if (cancelled) return;
          const rawDetail = describeError(e);
          const serverDebug = parseSpotifyDebug(rawDetail);
          if (serverDebug) {
            applyExchangeDebug(serverDebug);
          } else {
            updateCheck("accessTokenRequestSent", false, "The server exchange failed before returning Spotify token endpoint details.");
          }
          updateCheck("redirectToProfileExecuted", false, "Not redirected because Spotify authentication failed.");
          fail("Token exchange and storage", cleanErrorMessage(rawDetail) || "Unknown server error");
        }
      } catch (e) {
        if (cancelled) return;
        updateCheck("redirectToProfileExecuted", false, "Not redirected because the callback handler threw an error.");
        fail("Callback handler", describeError(e));
      }
    }

    void finishConnection();
    return () => {
      cancelled = true;
    };
  }, [exchangeCode, nav]);

  const debugText = [
    ...Object.values(checks).map((item) => `${item.label}: ${item.value === null ? "waiting" : item.value}; ${item.detail}`),
    ...debugSteps.map((s) => `${s.status.toUpperCase()} — ${s.step}: ${s.detail}`),
  ].join("\n");

  return (
    <div className="flex min-h-[100svh] items-center justify-center px-4 py-8">
      <div className="w-full max-w-2xl rounded-2xl glass-strong p-6 text-center sm:p-8">
        {status === "working" && (
          <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-[var(--neon-green)]" />
        )}
        {status === "ok" && (
          <CheckCircle2 className="mx-auto mb-4 h-10 w-10 text-[var(--neon-green)]" />
        )}
        {status === "error" && <XCircle className="mx-auto mb-4 h-10 w-10 text-red-400" />}
        <h1 className="text-xl font-semibold">Spotify callback debugger</h1>
        <p className="mt-2 break-words text-sm text-muted-foreground">{message}</p>

        <div className="mt-5 rounded-xl glass p-4 text-left">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Current URL</p>
          <p className="mt-2 break-words font-mono text-xs text-foreground/90">{currentUrl || "Waiting for callback URL…"}</p>
        </div>

        <div className="mt-5 overflow-hidden rounded-xl glass text-left">
          <div className="border-b border-white/10 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Required callback checks</p>
          </div>
          <div className="divide-y divide-white/10">
            {Object.entries(checks).map(([key, item]) => (
              <div key={key} className="grid gap-2 px-4 py-3 text-xs sm:grid-cols-[1fr_auto] sm:items-start">
                <div>
                  <p className="font-medium">{item.label}</p>
                  <p className="mt-1 break-words text-muted-foreground">{item.detail}</p>
                </div>
                <span
                  className={
                    item.value === true
                      ? "inline-flex w-fit rounded-full bg-emerald-400/10 px-2 py-1 font-semibold text-emerald-200"
                      : item.value === false
                        ? "inline-flex w-fit rounded-full bg-red-400/10 px-2 py-1 font-semibold text-red-200"
                        : "inline-flex w-fit rounded-full bg-yellow-400/10 px-2 py-1 font-semibold text-yellow-100"
                  }
                >
                  {item.value === true ? "true" : item.value === false ? "false" : "waiting"}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 rounded-xl glass p-3 text-left">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">OAuth trace</p>
            <button
              onClick={() => navigator.clipboard?.writeText(debugText)}
              className="inline-flex items-center gap-1 rounded-lg glass px-2 py-1 text-[10px] text-muted-foreground"
            >
              <Copy className="h-3 w-3" /> Copy
            </button>
          </div>
          <ol className="space-y-2">
            {debugSteps.map((item, index) => (
              <li key={`${item.step}-${index}`} className="grid grid-cols-[auto_1fr] gap-2 text-xs">
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
        {status === "error" && (
          <button
            onClick={() => nav({ to: "/profile" })}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl glass px-4 py-2 text-sm"
          >
            <RotateCcw className="h-4 w-4" /> Retry from profile
          </button>
        )}
      </div>
    </div>
  );
}
