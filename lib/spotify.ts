import "server-only";
import { WaitError } from "@/lib/errors";
import { supabaseAdmin } from "@/lib/supabase";

// Spotify Web API wrapper. Search and album lookups use the app's own
// credentials (client credentials flow); no user login needed. Creating
// playlists acts as the Faery Spotify account, whose login is stored in
// oauth_tokens (see /api/spotify/login).
// Development-mode limits (Feb 2026): search returns at most 10 results per
// call, there is no top-tracks endpoint, and popularity/genres are gone.

const API = "https://api.spotify.com/v1";
export const MARKET = "US";

export type SpotifyTrack = {
  id: string;
  uri: string;
  name: string;
  artists: { id: string; name: string }[];
  album: { id: string; name: string; album_type: string; release_date: string };
  track_number?: number;
};

export type SpotifyAlbum = {
  id: string;
  name: string;
  album_type: string;
  release_date: string;
  total_tracks: number;
  artists: { id: string; name: string }[];
};

let appToken: { value: string; expiresAt: number } | undefined;

type TokenResponse = { access_token: string; expires_in: number; refresh_token?: string; scope?: string };

// POST to Spotify's token endpoint, authenticated as the app.
async function tokenRequest(body: Record<string, string>): Promise<Response> {
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) throw new Error("Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET");
  return fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(15_000),
  });
}

async function getAppToken(): Promise<string> {
  if (appToken && appToken.expiresAt > Date.now() + 60_000) return appToken.value;
  const res = await tokenRequest({ grant_type: "client_credentials" });
  if (!res.ok) throw new Error(`Spotify token request failed: HTTP ${res.status}`);
  const json = (await res.json()) as TokenResponse;
  appToken = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return appToken.value;
}

// Spaces out Spotify requests from this process (about 8 per second), since
// big lists can otherwise burst into a long rate-limit penalty.
let nextSlot = 0;
async function pace(): Promise<void> {
  const now = Date.now();
  const at = Math.max(now, nextSlot);
  nextSlot = at + 125;
  if (at > now) await new Promise((r) => setTimeout(r, at - now));
}

// Spotify's "retry after" in seconds. Short waits are retried in place; long
// ones (Spotify escalates when it's been hammered) make the post wait for the
// next sweep instead of using up its attempts.
function rateLimited(res: Response): number {
  return Number(res.headers.get("retry-after") ?? "2");
}
const rateLimitWait = (secs: number) =>
  new WaitError(`Spotify rate limit: asked to wait ${Math.round(secs / 60)} min; will retry on the next sweep`);

async function get<T>(path: string, attempt = 1): Promise<T> {
  await pace();
  const res = await fetch(`${API}${path}`, {
    headers: { authorization: `Bearer ${await getAppToken()}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 429) {
    const wait = rateLimited(res);
    if (wait > 10) throw rateLimitWait(wait);
    if (attempt <= 3) {
      await new Promise((r) => setTimeout(r, (wait + Math.random()) * 1000));
      return get<T>(path, attempt + 1);
    }
    throw new Error(`Spotify rate limit; retry after ${wait}s`);
  }
  if (!res.ok) throw new Error(`Spotify GET ${path.split("?")[0]} failed: HTTP ${res.status}`);
  return (await res.json()) as T;
}

// Quotes a value for a search field filter (track:"..."); Spotify has no
// escape for quotes, so drop them.
const quoted = (s: string) => `"${s.replace(/"/g, "")}"`;

export async function searchTracks(q: string, offset = 0, limit = 10): Promise<SpotifyTrack[]> {
  const params = new URLSearchParams({ q, type: "track", limit: String(limit), offset: String(offset), market: MARKET });
  const data = await get<{ tracks: { items: (SpotifyTrack | null)[] } }>(`/search?${params}`);
  return data.tracks.items.filter((t): t is SpotifyTrack => !!t);
}

export async function searchAlbums(q: string): Promise<SpotifyAlbum[]> {
  const params = new URLSearchParams({ q, type: "album", limit: "10", market: MARKET });
  const data = await get<{ albums: { items: (SpotifyAlbum | null)[] } }>(`/search?${params}`);
  return data.albums.items.filter((a): a is SpotifyAlbum => !!a);
}

export async function searchArtists(name: string): Promise<{ id: string; name: string }[]> {
  const params = new URLSearchParams({ q: name, type: "artist", limit: "10", market: MARKET });
  const data = await get<{ artists: { items: ({ id: string; name: string } | null)[] } }>(`/search?${params}`);
  return data.artists.items.filter((a): a is { id: string; name: string } => !!a);
}

// One page of an artist's releases of one kind, newest first. Dev mode allows
// at most 10 per page (not documented; "Invalid limit" above that).
export async function artistAlbums(
  artistId: string,
  group: "album" | "compilation",
  offset = 0,
): Promise<{ items: SpotifyAlbum[]; total: number }> {
  const params = new URLSearchParams({ include_groups: group, limit: "10", offset: String(offset), market: MARKET });
  return get<{ items: SpotifyAlbum[]; total: number }>(`/artists/${artistId}/albums?${params}`);
}

export async function albumTracks(album: SpotifyAlbum): Promise<SpotifyTrack[]> {
  const data = await get<{ items: Omit<SpotifyTrack, "album">[] }>(
    `/albums/${album.id}/tracks?limit=50&market=${MARKET}`,
  );
  return data.items.map((t) => ({
    ...t,
    album: { id: album.id, name: album.name, album_type: album.album_type, release_date: album.release_date },
  }));
}

export const filter = {
  track: (title: string, artist?: string | null) =>
    artist ? `track:${quoted(title)} artist:${quoted(artist)}` : `track:${quoted(title)}`,
  artist: (artist: string) => `artist:${quoted(artist)}`,
  album: (album: string, artist?: string | null) =>
    artist ? `album:${quoted(album)} artist:${quoted(artist)}` : `album:${quoted(album)}`,
};

// ---------------------------------------------------------------------------
// Acting as the Faery Spotify account

export const SCOPES = "playlist-modify-public playlist-modify-private ugc-image-upload";
const PROVIDER = "spotify";
const REAUTH = "Spotify login expired or missing: log in as the Faery account at https://playlistfaery.com/api/spotify/login";

// Registered redirect URIs (Spotify rejects "localhost", so local dev uses 127.0.0.1).
// Uses the Host header: Next.js may report local requests as "localhost" in request.url.
export function redirectUri(request: Request): string {
  return request.headers.get("host")?.startsWith("127.0.0.1")
    ? "http://127.0.0.1:3000/api/spotify/callback"
    : "https://playlistfaery.com/api/spotify/callback";
}

export function authorizeUrl(state: string, redirect: string): string {
  const params = new URLSearchParams({
    client_id: process.env.SPOTIFY_CLIENT_ID ?? "",
    response_type: "code",
    redirect_uri: redirect,
    scope: SCOPES,
    state,
    show_dialog: "true",
  });
  return `https://accounts.spotify.com/authorize?${params}`;
}

// Exchanges the login code for tokens and returns them with the account's Spotify user id.
export async function exchangeCode(code: string, redirect: string) {
  const res = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirect });
  if (!res.ok) throw new Error(`Spotify code exchange failed: HTTP ${res.status} ${await res.text()}`);
  const tokens = (await res.json()) as TokenResponse;
  const me = await fetch(`${API}/me`, {
    headers: { authorization: `Bearer ${tokens.access_token}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!me.ok) throw new Error(`Spotify /me failed: HTTP ${me.status}`);
  const { id, display_name } = (await me.json()) as { id: string; display_name: string | null };
  return { tokens, accountId: id, displayName: display_name };
}

export async function storedAccountId(): Promise<string | null> {
  const { data } = await supabaseAdmin().from("oauth_tokens").select("account_id").eq("provider", PROVIDER).maybeSingle();
  return data?.account_id ?? null;
}

export async function saveLogin(accountId: string, tokens: TokenResponse) {
  const { error } = await supabaseAdmin().from("oauth_tokens").upsert({
    provider: PROVIDER,
    account_id: accountId,
    refresh_token: tokens.refresh_token,
    access_token: tokens.access_token,
    access_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    scope: tokens.scope ?? SCOPES,
    authorized_at: new Date().toISOString(),
  });
  if (error) throw new Error(`Could not save Spotify login: ${error.message}`);
}

// A valid access token for the Faery account, refreshing it when needed.
// Throws WaitError when there's no usable login, so posts wait instead of failing.
async function getUserToken(): Promise<string> {
  const db = supabaseAdmin();
  const { data: row } = await db
    .from("oauth_tokens")
    .select("refresh_token, access_token, access_expires_at")
    .eq("provider", PROVIDER)
    .maybeSingle();
  if (!row) throw new WaitError(REAUTH);
  if (row.access_token && row.access_expires_at && Date.parse(row.access_expires_at) > Date.now() + 60_000) {
    return row.access_token;
  }
  const res = await tokenRequest({ grant_type: "refresh_token", refresh_token: row.refresh_token });
  if (res.status === 400) throw new WaitError(`${REAUTH} (${await res.text()})`);
  if (!res.ok) throw new Error(`Spotify token refresh failed: HTTP ${res.status}`);
  const tokens = (await res.json()) as TokenResponse;
  await db
    .from("oauth_tokens")
    .update({
      access_token: tokens.access_token,
      access_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      // Spotify sometimes rotates the refresh token; keep the newest one.
      ...(tokens.refresh_token ? { refresh_token: tokens.refresh_token } : {}),
    })
    .eq("provider", PROVIDER);
  return tokens.access_token;
}

async function userRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  await pace();
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { authorization: `Bearer ${await getUserToken()}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 401) throw new WaitError(REAUTH);
  if (res.status === 429) {
    const wait = rateLimited(res);
    if (wait > 10) throw rateLimitWait(wait);
    throw new Error(`Spotify rate limit; retry after ${wait}s`);
  }
  if (!res.ok) throw new Error(`Spotify ${method} ${path} failed: HTTP ${res.status} ${await res.text()}`);
  const text = await res.text(); // some endpoints return an empty body
  return (text ? JSON.parse(text) : undefined) as T;
}

export async function createPlaylist(name: string, description: string): Promise<{ id: string; url: string }> {
  const playlist = await userRequest<{ id: string; external_urls: { spotify: string } }>("POST", "/me/playlists", {
    name,
    description,
    public: true, // only created after Dan approves
  });
  return { id: playlist.id, url: playlist.external_urls.spotify };
}

// Sets the playlist's tracks to exactly these, in order (safe to repeat).
export async function replacePlaylistItems(playlistId: string, uris: string[]): Promise<void> {
  if (uris.length > 100) throw new Error("More than 100 tracks; batching isn't implemented");
  await userRequest("PUT", `/playlists/${playlistId}/items`, { uris });
}

