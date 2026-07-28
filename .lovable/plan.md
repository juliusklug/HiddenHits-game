## Phase 5.1 — Spotify Web Playback SDK (Deezer preview as fallback)

Full-song hidden playback for Spotify Premium users, inside the app. Deezer 30s preview stays as fallback for everyone else. Architecture is provider-agnostic so Apple MusicKit slots in later without a rewrite.

### 1. Provider abstraction (new)

`src/lib/music/provider.ts` — a `MusicProvider` interface:

```ts
interface MusicProvider {
  id: "spotify" | "deezer-preview" | "apple";     // stable key
  displayName: string;
  isConnected(): Promise<boolean>;
  connect(): Promise<void>;                       // OAuth / init
  disconnect(): Promise<void>;
  // Resolve a card (which stores deezer track id) to something this provider can play
  resolveTrack(card: Card): Promise<ResolvedTrack | null>;
  play(track: ResolvedTrack): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  seek(ms: number): Promise<void>;
  onStateChange(cb: (s: PlayerState) => void): () => void;
}
```

Three implementations: `spotifyProvider`, `deezerPreviewProvider` (wraps existing HTML `<audio>`), and a stub `appleProvider` for later. A `providerRegistry` + `useMusicPlayer()` hook picks the user's preferred provider, falls back to Deezer preview if resolve/play fails.

`HiddenPlayer` is refactored to consume `useMusicPlayer()` instead of touching `<audio>` directly. Zero UI change for the fallback path.

### 2. Spotify OAuth (PKCE, no client secret in browser)

- Route `src/routes/auth.spotify.callback.tsx` — receives `?code=...`, calls server fn to exchange for tokens.
- Server fn `exchangeSpotifyCode` (createServerFn) — PKCE exchange using `SPOTIFY_CLIENT_ID` + `SPOTIFY_CLIENT_SECRET`, stores encrypted refresh_token in `spotify_connections` table keyed by user_id.
- Server fn `getSpotifyAccessToken` — returns a fresh access token (refreshes if expired), used by the Web Playback SDK's `getOAuthToken` callback.
- New table `spotify_connections` (user_id PK, refresh_token_ciphertext, scope, connected_at) — RLS: user reads own row only via server fn using service role. Encryption via existing AES-GCM pattern.

### 3. Spotify Web Playback SDK integration

- Load `https://sdk.scdn.co/spotify-player.js` dynamically (browser only, HTTPS only — gracefully degrades to Deezer preview in local sandbox).
- Create a `Spotify.Player` device, transfer playback to it, call `/me/player/play` with the resolved `spotify:track:URI`.
- Track resolution: card stores Deezer id → server fn `resolveSpotifyFromCard` queries Spotify `/search?q=isrc:XXX` (Deezer track API returns ISRC), falls back to `artist + title` search. Cache result on `cards` table in a new nullable `spotify_uri` column so we don't re-search every play.
- If resolve returns null OR SDK reports `playback_error` (track not available / not Premium) → auto-fallback to Deezer preview for that card.

### 4. Profile → Music Provider section

New section in `src/routes/profile.tsx`:
- Shows connection status per provider (Spotify: Connected as {display_name} / Not connected; Deezer Preview: always available).
- "Connect Spotify Premium" → PKCE auth flow.
- "Disconnect" → revokes token + deletes row.
- Preferred provider dropdown (Spotify if connected, else Deezer Preview).
- Note: "Full playback requires Spotify Premium. Free accounts fall back to 30-second previews."

### 5. Migrations

- `spotify_connections` table + RLS + GRANTs.
- `cards.spotify_uri text null` column.

### 6. Secrets needed from you

- **SPOTIFY_CLIENT_ID** (public, but stored as secret for consistency)
- **SPOTIFY_CLIENT_SECRET** (server-only, used only for PKCE token exchange)

**Redirect URI to whitelist in Spotify Dashboard:**
`https://project--635a0c15-683d-417b-8b87-89727d33111d.lovable.app/auth/spotify/callback`
(plus your custom domain if any, plus published `.lovable.app` URL after publish)

**Scopes requested:** `streaming user-read-email user-read-private user-modify-playback-state user-read-playback-state`

### 7. Why this is Apple-Music-ready

The `MusicProvider` interface is the seam. Adding Apple MusicKit later means: implement `appleProvider.ts`, register it, add a "Connect Apple Music" button. No changes to `HiddenPlayer`, cards, or the fallback logic.

### What I need from you

1. Create the Spotify app at https://developer.spotify.com/dashboard, add the redirect URI above, grab Client ID + Secret.
2. Reply "go" — I'll request both secrets via the secure form and implement end-to-end.

### Known limits (up front)

- Spotify Web Playback SDK **requires Premium** on the listening account. Free users hit Deezer preview fallback automatically.
- SDK is HTTPS-only — works on preview/published `.lovable.app`, not the local sandbox.
- First-play device transfer can take ~1s; I'll show the waveform loader during that.
