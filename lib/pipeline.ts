import "server-only";
import { sendApprovalEmail } from "@/lib/approval";
import { buildPost } from "@/lib/build";
import { capturePost } from "@/lib/capture";
import { logEvent } from "@/lib/events";
import { matchPost } from "@/lib/match";
import { parsePost } from "@/lib/parse";
import type { PostStatus, StepResult } from "@/lib/step";
import { supabaseAdmin } from "@/lib/supabase";

const STEPS: Partial<Record<PostStatus, (postId: string) => Promise<StepResult>>> = {
  received: capturePost,
  captured: parsePost,
  parsed: matchPost,
  matched: sendApprovalEmail,
  // Build runs after Dan approves (the approve page starts it; the sweep retries it).
  approved: buildPost,
};

// Moves a post through as many steps as it can right now. Stops when a step
// needs a retry, fails, or there is no automatic step for the current status
// (e.g. awaiting Dan's approval). Returns the post's final status.
export async function advancePost(postId: string): Promise<PostStatus | null> {
  const db = supabaseAdmin();
  const status = async () =>
    (await db.from("posts").select("status").eq("id", postId).single<{ status: PostStatus }>()).data?.status ?? null;
  for (let s = await status(); s && STEPS[s]; s = await status()) {
    if ((await STEPS[s]!(postId)) !== "advanced") break;
  }
  return status();
}

// Statuses with an automatic next step (see STEPS); also what the daily stuck-post check watches.
export const AUTOMATIC_STATUSES = Object.keys(STEPS) as PostStatus[];

// Retries posts stuck in an automatic status, oldest first. Only touches posts
// not updated for `staleMinutes`, so it never races the webhook's own run, and
// claims each one (an updated_at compare-and-set) so two sweeps can't both
// work on it — which matters for Build, where a race could create two playlists.
export async function advanceStalePosts({ staleMinutes = 10, limit = 20 } = {}) {
  const db = supabaseAdmin();
  const cutoff = new Date(Date.now() - staleMinutes * 60_000).toISOString();
  const { data: stale, error } = await db
    .from("posts")
    .select("id, status, updated_at")
    .in("status", AUTOMATIC_STATUSES)
    .lt("updated_at", cutoff)
    .order("updated_at")
    .limit(limit);
  if (error) throw new Error(`Could not list stale posts: ${error.message}`);

  const results: { id: string; from: PostStatus; to: PostStatus | null }[] = [];
  for (const post of stale ?? []) {
    const { data: claimed } = await db
      .from("posts")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", post.id)
      .eq("updated_at", post.updated_at)
      .select("id");
    if (!claimed?.length) continue; // someone else got it
    await logEvent(post.id, "sweep", "claimed", { from: post.status, message: `untouched since ${post.updated_at}` });
    results.push({ id: post.id, from: post.status, to: await advancePost(post.id) });
  }
  if (results.length) console.log("[sweep] advanced stale posts", results);
  return results;
}
