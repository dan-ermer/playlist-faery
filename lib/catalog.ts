import "server-only";
import { supabaseAdmin } from "@/lib/supabase";

// One playlist on the public catalog. Only public fields: never the
// forwarder's email, approval token or anything from rejected/failed posts.
export type CatalogEntry = {
  id: string;
  title: string;
  handle: string | null;
  platform: string | null;
  postUrl: string | null;
  date: string | null; // YYYY-MM-DD: the post's date, else when it was approved
  playlistUrl: string;
  trackCount: number;
  artists: string[]; // first few, in playlist order, no repeats
};

// Every playlist that exists on Spotify (Dan approved it), newest first.
export async function getCatalog(): Promise<CatalogEntry[]> {
  const db = supabaseAdmin();
  const { data: posts, error } = await db
    .from("posts")
    .select("id, playlist_title, author_handle, source_platform, source_url, posted_on, approved_at, created_at, spotify_playlist_url")
    .in("status", ["built", "published"])
    .not("spotify_playlist_url", "is", null)
    .order("approved_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Could not load catalog: ${error.message}`);
  if (!posts?.length) return [];

  const { data: items, error: itemsError } = await db
    .from("post_items")
    .select("post_id, position, spotify_artists")
    .in("post_id", posts.map((p) => p.id))
    .eq("matched", true)
    .order("position");
  if (itemsError) throw new Error(`Could not load catalog tracks: ${itemsError.message}`);

  return posts.map((p) => {
    const tracks = (items ?? []).filter((i) => i.post_id === p.id);
    const artists = [
      ...new Set(tracks.map((t) => (t.spotify_artists ?? "").split(", ")[0]).filter(Boolean)),
    ];
    return {
      id: p.id,
      title: p.playlist_title ?? "Untitled playlist",
      handle: p.author_handle,
      platform: p.source_platform,
      postUrl: p.source_url,
      date: p.posted_on ?? (p.approved_at ?? p.created_at).slice(0, 10),
      playlistUrl: p.spotify_playlist_url!,
      trackCount: tracks.length,
      artists,
    };
  });
}
