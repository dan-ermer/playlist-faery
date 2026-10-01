import "server-only";
import { PermanentError } from "@/lib/errors";
import { createPlaylist, replacePlaylistItems } from "@/lib/spotify";
import { runStep, type StepResult } from "@/lib/step";
import { supabaseAdmin } from "@/lib/supabase";

type BuildRow = {
  playlist_title: string | null;
  author_handle: string | null;
  source_platform: string | null;
  source_url: string | null;
  spotify_playlist_id: string | null;
};

const PLATFORM_NAMES: Record<string, string> = { threads: "Threads", x: "X" };

// The credit line in the playlist description, e.g.
// "Songs from @kirstyahood's post on Threads: https://... · Freed by Playlist Faery · playlistfaery.com"
export function creditLine(post: Pick<BuildRow, "author_handle" | "source_platform" | "source_url">): string {
  const where = PLATFORM_NAMES[post.source_platform ?? ""] ?? "social media";
  const who = post.author_handle ? `@${post.author_handle}'s post` : "a post";
  const link = post.source_url ? `: ${post.source_url}` : "";
  return `Songs from ${who} on ${where}${link} · Freed by Playlist Faery · playlistfaery.com`;
}

// Build step: matched -> built.
// Creates a private playlist on the Faery Spotify account (made public only
// after Dan approves) with the matched tracks in the poster's order.
// The playlist id is saved as soon as the playlist exists, so a retry reuses
// it instead of creating a duplicate; setting the tracks replaces them.
export function buildPost(postId: string): Promise<StepResult> {
  return runStep<BuildRow>(
    "build", postId, "matched", "built",
    "playlist_title, author_handle, source_platform, source_url, spotify_playlist_id",
    async (post) => {
      const db = supabaseAdmin();
      const { data: items, error } = await db
        .from("post_items")
        .select("spotify_uri")
        .eq("post_id", post.id)
        .eq("matched", true)
        .order("position");
      if (error) throw new Error(`Could not load items: ${error.message}`);
      const uris = [...new Set((items ?? []).map((i) => i.spotify_uri).filter((u): u is string => !!u))];
      if (uris.length === 0) throw new PermanentError("No matched tracks to put in a playlist");

      let playlistId = post.spotify_playlist_id;
      if (!playlistId) {
        const name = post.playlist_title ?? (post.author_handle ? `From @${post.author_handle}` : "Freed playlist");
        const playlist = await createPlaylist(name, creditLine(post));
        playlistId = playlist.id;
        const { error: saveError } = await db
          .from("posts")
          .update({ spotify_playlist_id: playlist.id, spotify_playlist_url: playlist.url })
          .eq("id", post.id);
        if (saveError) {
          // Don't continue: a retry would create a second playlist.
          throw new PermanentError(
            `Created Spotify playlist ${playlist.id} but couldn't save its id (${saveError.message}); fix by hand`,
          );
        }
      }

      await replacePlaylistItems(playlistId, uris);
      console.log("[build] playlist ready", { postId, playlistId, tracks: uris.length });
      return {};
    },
  );
}
