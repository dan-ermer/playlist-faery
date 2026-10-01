import "server-only";

// Spotify Web API wrapper. Search and album lookups use the app's own
// credentials (client credentials flow); no user login needed.
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

type SpotifyAlbum = {
  id: string;
  name: string;
  album_type: string;
  release_date: string;
  total_tracks: number;
  artists: { id: string; name: string }[];
};

let appToken: { value: string; expiresAt: number } | undefined;

async function getAppToken(): Promise<string> {
  if (appToken && appToken.expiresAt > Date.now() + 60_000) return appToken.value;
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) throw new Error("Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET");
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Spotify token request failed: HTTP ${res.status}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  appToken = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return appToken.value;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { authorization: `Bearer ${await getAppToken()}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 429) {
    throw new Error(`Spotify rate limit; retry after ${res.headers.get("retry-after") ?? "?"}s`);
  }
  if (!res.ok) throw new Error(`Spotify GET ${path.split("?")[0]} failed: HTTP ${res.status}`);
  return (await res.json()) as T;
}

// Quotes a value for a search field filter (track:"..."); Spotify has no
// escape for quotes, so drop them.
const quoted = (s: string) => `"${s.replace(/"/g, "")}"`;

export async function searchTracks(q: string, offset = 0): Promise<SpotifyTrack[]> {
  const params = new URLSearchParams({ q, type: "track", limit: "10", offset: String(offset), market: MARKET });
  const data = await get<{ tracks: { items: (SpotifyTrack | null)[] } }>(`/search?${params}`);
  return data.tracks.items.filter((t): t is SpotifyTrack => !!t);
}

export async function searchAlbums(q: string): Promise<SpotifyAlbum[]> {
  const params = new URLSearchParams({ q, type: "album", limit: "10", market: MARKET });
  const data = await get<{ albums: { items: (SpotifyAlbum | null)[] } }>(`/search?${params}`);
  return data.albums.items.filter((a): a is SpotifyAlbum => !!a);
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
