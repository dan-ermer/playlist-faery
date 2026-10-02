import "server-only";
import { allowedSenders } from "@/lib/intake";
import { resend } from "@/lib/resend";
import { supabaseAdmin } from "@/lib/supabase";

// Spotify: "Each user is generally limited to a maximum of 11000 playlists."
// What counts toward it (followed playlists? deleted ones?) isn't documented.
export const PLAYLIST_LIMIT = 11_000;
export const WARN_AT = 9_000;

// Playlists Playlist Faery has created (not ones made by hand on the account).
export async function playlistCount(): Promise<number> {
  const { count, error } = await supabaseAdmin()
    .from("posts")
    .select("id", { count: "exact", head: true })
    .not("spotify_playlist_id", "is", null);
  if (error) throw new Error(`Could not count playlists: ${error.message}`);
  return count ?? 0;
}

// Called by the daily cron: once past WARN_AT, emails Dan (the first
// ALLOWED_SENDERS address) at most once a day until the limit is dealt with.
export async function warnIfNearPlaylistLimit(now = new Date()): Promise<number> {
  const count = await playlistCount();
  if (count < WARN_AT) return count;
  const to = [...allowedSenders()][0];
  if (!to) throw new Error("No ALLOWED_SENDERS address to send the playlist-limit warning to");
  const day = now.toISOString().slice(0, 10);
  const { error } = await resend().emails.send(
    {
      from: "Playlist Faery <faery@playlistfaery.com>",
      to,
      subject: `Playlist Faery: ${count.toLocaleString("en-US")} of ~${PLAYLIST_LIMIT.toLocaleString("en-US")} Spotify playlists used`,
      text:
        `The Faery Spotify account has ${count} playlists created by Playlist Faery; Spotify generally caps an account at ${PLAYLIST_LIMIT}.\n\n` +
        `Time to set up the overflow plan (a second Faery Spotify account). This reminder repeats daily.`,
    },
    { idempotencyKey: `playlist-limit/${day}` },
  );
  if (error) throw new Error(`Resend: ${error.message}`);
  return count;
}
