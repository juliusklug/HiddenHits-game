import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SPOTIFY_SCOPES = [
  "streaming",
  "user-read-email",
  "user-read-private",
  "user-modify-playback-state",
  "user-read-playback-state",
].join(" ");

function getRedirectUri(origin: string) {
  return `${origin.replace(/\/$/, "")}/auth/spotify/callback`;
}

function spotifyLog(step: string, details: Record<string, unknown> = {}) {
  console.info(`[spotify-oauth] ${step}`, details);
}

function readSpotifyText(value: unknown) {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export type SpotifyExchangeDebug = {
  accessTokenRequestSent: boolean;
  spotifyApiResponse: string;
  accessTokenReceived: boolean;
  refreshTokenReceived: boolean;
  userInformationReceived: boolean;
  sessionSavedSuccessfully: boolean;
};

function createExchangeDebug(): SpotifyExchangeDebug {
  return {
    accessTokenRequestSent: false,
    spotifyApiResponse: "Not requested yet",
    accessTokenReceived: false,
    refreshTokenReceived: false,
    userInformationReceived: false,
    sessionSavedSuccessfully: false,
  };
}

function throwSpotifyError(message: string, debug: SpotifyExchangeDebug): never {
  throw new Error(`${message}\nSPOTIFY_DEBUG:${JSON.stringify(debug)}`);
}

/** Build Spotify authorize URL. Client generates & stores its own `state`. */
export const buildSpotifyAuthUrl = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ origin: z.string().url(), state: z.string().min(8) }).parse(input),
  )
  .handler(async ({ data }) => {
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    spotifyLog("build_authorize_url:start", {
      origin: data.origin,
      redirectUri: getRedirectUri(data.origin),
      hasClientId: Boolean(clientId),
      stateLength: data.state.length,
      scopes: SPOTIFY_SCOPES,
    });
    if (!clientId) {
      spotifyLog("build_authorize_url:failed", { reason: "missing_client_id" });
      throw new Error("Spotify OAuth setup failed: SPOTIFY_CLIENT_ID is not available on the server");
    }
    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      scope: SPOTIFY_SCOPES,
      redirect_uri: getRedirectUri(data.origin),
      state: data.state,
      show_dialog: "false",
    });
    const url = `https://accounts.spotify.com/authorize?${params.toString()}`;
    spotifyLog("build_authorize_url:success", {
      authorizeHost: "accounts.spotify.com",
      redirectUri: getRedirectUri(data.origin),
      clientIdLength: clientId.length,
    });
    return {
      url,
      debug: {
        redirectUri: getRedirectUri(data.origin),
        scope: SPOTIFY_SCOPES,
        hasClientId: true,
        clientIdLength: clientId.length,
      },
    };
  });

/** Exchange the callback `code` for tokens, fetch profile, persist encrypted. */
export const exchangeSpotifyCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ code: z.string().min(1), origin: z.string().url() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    const redirectUri = getRedirectUri(data.origin);
    const debug = createExchangeDebug();
    spotifyLog("exchange_code:start", {
      userIdPresent: Boolean(context.userId),
      origin: data.origin,
      redirectUri,
      codeLength: data.code.length,
      hasClientId: Boolean(clientId),
      clientIdLength: clientId?.length ?? 0,
      hasClientSecret: Boolean(clientSecret),
      clientSecretLength: clientSecret?.length ?? 0,
    });
    if (!clientId || !clientSecret) {
      spotifyLog("exchange_code:failed", {
        stage: "credentials",
        hasClientId: Boolean(clientId),
        hasClientSecret: Boolean(clientSecret),
      });
      throwSpotifyError(
        `Spotify token exchange failed at credentials check: client_id_present=${Boolean(clientId)}, client_secret_present=${Boolean(clientSecret)}`,
        debug,
      );
    }

    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: data.code,
      redirect_uri: redirectUri,
    });
    debug.accessTokenRequestSent = true;
    spotifyLog("exchange_code:request_token", { redirectUri, tokenEndpoint: "https://accounts.spotify.com/api/token" });
    const tokRes = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body,
    });
    const tokenResponseText = await tokRes.text();
    spotifyLog("exchange_code:token_response", {
      ok: tokRes.ok,
      status: tokRes.status,
      statusText: tokRes.statusText,
    });
    if (!tokRes.ok) {
      debug.spotifyApiResponse = `status=${tokRes.status} ${tokRes.statusText}; body=${tokenResponseText || "(empty)"}`;
      spotifyLog("exchange_code:failed", { stage: "token_exchange", status: tokRes.status, body: tokenResponseText });
      throwSpotifyError(
        `Spotify token exchange failed at token endpoint: status=${tokRes.status}; response=${tokenResponseText || "(empty)"}`,
        debug,
      );
    }

    let tok: {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      scope: string;
      token_type?: string;
    };
    try {
      tok = JSON.parse(tokenResponseText) as typeof tok;
    } catch {
      debug.spotifyApiResponse = `status=${tokRes.status} ${tokRes.statusText}; body was not valid JSON`;
      spotifyLog("exchange_code:failed", { stage: "token_json", status: tokRes.status, body: tokenResponseText });
      throwSpotifyError("Spotify token exchange failed: token response was not valid JSON", debug);
    }
    debug.accessTokenReceived = Boolean(tok.access_token);
    debug.refreshTokenReceived = Boolean(tok.refresh_token);
    debug.spotifyApiResponse = `status=${tokRes.status} ${tokRes.statusText}; access_token_present=${debug.accessTokenReceived}; refresh_token_present=${debug.refreshTokenReceived}; expires_in=${tok.expires_in}; scope=${tok.scope ?? ""}`;
    spotifyLog("exchange_code:token_parsed", {
      hasAccessToken: Boolean(tok.access_token),
      hasRefreshToken: Boolean(tok.refresh_token),
      expiresIn: tok.expires_in,
      scope: tok.scope,
      tokenType: tok.token_type,
    });
    if (!tok.access_token || !tok.refresh_token) {
      spotifyLog("exchange_code:failed", {
        stage: "token_payload",
        hasAccessToken: Boolean(tok.access_token),
        hasRefreshToken: Boolean(tok.refresh_token),
        payloadKeys: Object.keys(tok),
      });
      throwSpotifyError(
        `Spotify token exchange returned an incomplete token payload: access_token_present=${Boolean(tok.access_token)}, refresh_token_present=${Boolean(tok.refresh_token)}`,
        debug,
      );
    }

    spotifyLog("exchange_code:request_profile", { endpoint: "https://api.spotify.com/v1/me" });
    const meRes = await fetch("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${tok.access_token}` },
    });
    spotifyLog("exchange_code:profile_response", {
      ok: meRes.ok,
      status: meRes.status,
      statusText: meRes.statusText,
    });
    if (!meRes.ok) {
      const profileError = await meRes.text();
      spotifyLog("exchange_code:failed", { stage: "profile", status: meRes.status, body: profileError });
      throwSpotifyError(`Spotify profile request failed: status=${meRes.status}; response=${profileError}`, debug);
    }
    const me = (await meRes.json()) as {
      id: string;
      display_name?: string;
      email?: string;
      product?: string;
    };
    debug.userInformationReceived = Boolean(me.id);
    spotifyLog("exchange_code:profile_parsed", {
      hasSpotifyUserId: Boolean(me.id),
      hasDisplayName: Boolean(me.display_name),
      hasEmail: Boolean(me.email),
      product: me.product,
    });

    const { encryptToken } = await import("@/lib/music/crypto.server");
    const expiresAt = new Date(Date.now() + tok.expires_in * 1000).toISOString();

    spotifyLog("exchange_code:store_connection", {
      userIdPresent: Boolean(context.userId),
      spotifyUserIdPresent: Boolean(me.id),
      product: me.product ?? null,
      expiresAt,
    });
    const { error } = await context.supabase.from("spotify_connections").upsert(
      {
        user_id: context.userId,
        spotify_user_id: me.id,
        display_name: me.display_name ?? me.email ?? me.id,
        product: me.product ?? null,
        scope: tok.scope,
        refresh_token_ciphertext: encryptToken(tok.refresh_token),
        access_token_ciphertext: encryptToken(tok.access_token),
        expires_at: expiresAt,
        connected_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) {
      spotifyLog("exchange_code:failed", { stage: "database", message: error.message, details: readSpotifyText(error) });
      throwSpotifyError(`Spotify connection storage failed: ${error.message}`, debug);
    }
    debug.sessionSavedSuccessfully = true;

    spotifyLog("exchange_code:success", {
      spotifyUserIdPresent: Boolean(me.id),
      displayNamePresent: Boolean(me.display_name ?? me.email),
      product: me.product ?? "unknown",
    });

    return {
      ok: true as const,
      displayName: me.display_name ?? me.email ?? me.id,
      product: me.product ?? "unknown",
      debug,
    };
  });

/** Return connection state (safe fields only). */
export const getSpotifyConnection = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("spotify_connections")
      .select("display_name, product, connected_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    return data ?? null;
  });

/** Disconnect: best-effort revoke refresh token, then delete row. */
export const disconnectSpotify = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: row } = await context.supabase
      .from("spotify_connections")
      .select("refresh_token_ciphertext")
      .eq("user_id", context.userId)
      .maybeSingle();

    if (row?.refresh_token_ciphertext) {
      try {
        const clientId = process.env.SPOTIFY_CLIENT_ID;
        const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
        if (clientId && clientSecret) {
          const { decryptToken } = await import("@/lib/music/crypto.server");
          const refreshToken = decryptToken(row.refresh_token_ciphertext);
          await fetch("https://accounts.spotify.com/api/token/revoke", {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
            },
            body: new URLSearchParams({
              token: refreshToken,
              token_type_hint: "refresh_token",
            }),
          });
        }
      } catch (err) {
        spotifyLog("disconnect:revoke_ignored", {
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const { error } = await context.supabase
      .from("spotify_connections")
      .delete()
      .eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true as const };
  });

/** Return a fresh access token for the Web Playback SDK. */
export const getSpotifyAccessToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: row, error } = await context.supabase
      .from("spotify_connections")
      .select("refresh_token_ciphertext, access_token_ciphertext, expires_at, product")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new Error("Spotify not connected");

    const { encryptToken, decryptToken } = await import("@/lib/music/crypto.server");
    const now = Date.now();
    const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : 0;

    if (row.access_token_ciphertext && expiresAt - now > 30_000) {
      return {
        accessToken: decryptToken(row.access_token_ciphertext),
        product: row.product ?? "unknown",
      };
    }

    const clientId = process.env.SPOTIFY_CLIENT_ID!;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET!;
    const refreshToken = decryptToken(row.refresh_token_ciphertext);
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
    const r = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body,
    });
    if (!r.ok) {
      const responseText = await r.text().catch(() => "");
      spotifyLog("refresh_token:failed", { status: r.status, body: responseText });
      // Revoked / expired refresh tokens cannot be recovered — clear the row so
      // the UI offers a full OAuth reconnect instead of looping on a dead grant.
      if (r.status === 400 && /invalid_grant/i.test(responseText)) {
        await context.supabase.from("spotify_connections").delete().eq("user_id", context.userId);
        throw new Error("SPOTIFY_REAUTH: Spotify authorization revoked — reconnect Spotify");
      }
      throw new Error(`Spotify refresh failed: ${r.status}${responseText ? ` ${responseText}` : ""}`);
    }
    const tok = (await r.json()) as {
      access_token: string;
      expires_in: number;
      refresh_token?: string;
    };
    const newExpires = new Date(Date.now() + tok.expires_in * 1000).toISOString();
    await context.supabase
      .from("spotify_connections")
      .update({
        access_token_ciphertext: encryptToken(tok.access_token),
        expires_at: newExpires,
        ...(tok.refresh_token
          ? { refresh_token_ciphertext: encryptToken(tok.refresh_token) }
          : {}),
      })
      .eq("user_id", context.userId);
    return { accessToken: tok.access_token, product: row.product ?? "unknown" };
  });

/** Resolve a card (Deezer track id) to a Spotify URI. Cached on the card row. */
export const resolveSpotifyForCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ trackId: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }) => {
    // 1. Look up the card by deezer track_id.
    const { data: card } = await context.supabase
      .from("cards")
      .select("id, title, artist, spotify_uri, track_id")
      .eq("track_id", data.trackId)
      .maybeSingle();

    if (card?.spotify_uri) return { spotifyUri: card.spotify_uri as string };

    // 2. Get Spotify access token (client credentials via user token is fine here).
    const { data: row } = await context.supabase
      .from("spotify_connections")
      .select("access_token_ciphertext, expires_at, refresh_token_ciphertext")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!row) throw new Error("Spotify not connected");

    // Prefer fresh user token from getSpotifyAccessToken logic
    const { decryptToken } = await import("@/lib/music/crypto.server");
    let accessToken = row.access_token_ciphertext ? decryptToken(row.access_token_ciphertext) : "";
    const now = Date.now();
    const exp = row.expires_at ? new Date(row.expires_at).getTime() : 0;
    if (!accessToken || exp - now < 30_000) {
      const refreshed = await getSpotifyAccessToken({});
      accessToken = refreshed.accessToken;
    }

    // 3. Try ISRC via Deezer, fall back to text search.
    let isrc: string | null = null;
    try {
      const dz = await fetch(`https://api.deezer.com/track/${encodeURIComponent(data.trackId)}`);
      if (dz.ok) {
        const j = (await dz.json()) as { isrc?: string };
        isrc = j.isrc ?? null;
      }
    } catch {
      /* ignore */
    }

    let spotifyUri: string | null = null;
    async function search(q: string) {
      const url = `https://api.spotify.com/v1/search?type=track&limit=1&q=${encodeURIComponent(q)}`;
      const r = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!r.ok) return null;
      const j = (await r.json()) as { tracks?: { items?: { uri?: string }[] } };
      return j.tracks?.items?.[0]?.uri ?? null;
    }

    if (isrc) spotifyUri = await search(`isrc:${isrc}`);
    if (!spotifyUri && card?.title && card?.artist) {
      spotifyUri = await search(`track:"${card.title}" artist:"${card.artist}"`);
    }
    if (!spotifyUri) return { spotifyUri: null };

    if (card?.id) {
      await context.supabase
        .from("cards")
        .update({ spotify_uri: spotifyUri, spotify_resolved_at: new Date().toISOString() })
        .eq("id", card.id);
    }
    return { spotifyUri };
  });
