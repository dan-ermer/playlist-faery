import "server-only";
import { PermanentError } from "@/lib/errors";
import { logEvent } from "@/lib/events";
import { runStep, type StepResult } from "@/lib/step";
import { supabaseAdmin } from "@/lib/supabase";
import { findThreadsPostId, publishText, threadsLength } from "@/lib/threads";

// Distribute is switched on with THREADS_DISTRIBUTE=on (it posts publicly).
export const distributeEnabled = () => process.env.THREADS_DISTRIBUTE === "on";

type DistributeRow = {
  source_platform: string | null;
  source_url: string | null;
  author_handle: string | null;
  post_text: string | null;
  playlist_title: string | null;
  spotify_playlist_url: string | null;
  faery_post_url: string | null;
  reply_url: string | null;
};

// How the poster is credited on Threads. Threads usernames are Instagram
// usernames, so an @handle from either reaches the right person; an X handle
// is written without @ so it can't tag a stranger on Threads.
export function creditFor(post: Pick<DistributeRow, "source_platform" | "author_handle">): string {
  if (!post.author_handle) return "a post";
  if (post.source_platform === "threads") return `@${post.author_handle}'s post`;
  if (post.source_platform === "instagram") return `@${post.author_handle}'s Instagram post`;
  if (post.source_platform === "x") return `${post.author_handle}'s post on X`;
  return `@${post.author_handle}'s post`;
}

const clip = (s: string, max: number) => ([...s].length > max ? `${[...s].slice(0, max - 1).join("")}…` : s);

// The announcement on @playlistfaery's own feed.
export function faeryPostText(post: DistributeRow): string {
  const lines = (title: string) => [
    `♛ Wish granted! “${title}”, freed from ${creditFor(post)}.`,
    ``,
    `Listen on Spotify: ${post.spotify_playlist_url}`,
    ...(post.source_url ? [`Original post: ${post.source_url}`] : []),
  ];
  let title = post.playlist_title ?? "A freed playlist";
  let text = lines(title).join("\n");
  while (threadsLength(text) > 500 && title.length > 10) {
    title = clip(title, title.length - 10);
    text = lines(title).join("\n");
  }
  return text;
}

// The reply on the original Threads post.
export function replyText(post: DistributeRow): string {
  return [
    `✦ Poof! Your list is now a Spotify playlist: ${post.spotify_playlist_url}`,
    ``,
    `Thanks for the great picks! ♛ Playlist Faery`,
  ].join("\n");
}

// Distribute step: built -> published (only when THREADS_DISTRIBUTE=on).
// 1. Announces the playlist on @playlistfaery's feed, crediting the poster.
// 2. For Threads posts, replies on the original post with the link, if the API
//    can find it (mentions, or keyword search once Meta approves it); if not,
//    the reply is skipped and noted, to be added later.
// Each link is saved the moment it's published, so a retry never posts twice.
export function distributePost(postId: string): Promise<StepResult> {
  return runStep<DistributeRow>(
    "distribute", postId, "built", "published",
    "source_platform, source_url, author_handle, post_text, playlist_title, spotify_playlist_url, faery_post_url, reply_url",
    async (post) => {
      if (!post.spotify_playlist_url) throw new PermanentError("No playlist to share");
      const db = supabaseAdmin();
      const save = async (fields: Record<string, string>) => {
        const { error } = await db.from("posts").update(fields).eq("id", post.id);
        // Don't continue on a failed save: a retry would post again.
        if (error) throw new PermanentError(`Posted on Threads but couldn't save the link (${error.message}); check by hand`);
      };

      if (!post.faery_post_url) {
        const faery = await publishText({ text: faeryPostText(post), linkAttachment: post.spotify_playlist_url });
        await save({ faery_post_url: faery.permalink });
      }

      if (post.source_platform === "threads" && post.source_url && !post.reply_url) {
        const target = await findThreadsPostId({ sourceUrl: post.source_url, handle: post.author_handle, text: post.post_text });
        if (target) {
          const reply = await publishText({ text: replyText(post), replyToId: target, linkAttachment: post.spotify_playlist_url });
          await save({ reply_url: reply.permalink });
        } else {
          await logEvent(post.id, "distribute", "note", {
            message: "Reply skipped: the API can't see this post yet (needs a mention, or Meta's approval of keyword search)",
          });
        }
      }
      return {};
    },
  );
}
