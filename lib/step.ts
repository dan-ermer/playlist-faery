import "server-only";
import { sendFailureAlert } from "@/lib/alerts";
import { PermanentError, WaitError } from "@/lib/errors";
import { logEvent } from "@/lib/events";
import { supabaseAdmin } from "@/lib/supabase";

// Temporary failures are retried this many times per step before the post is marked failed.
export const MAX_ATTEMPTS = 3;

export type PostStatus =
  | "received" | "captured" | "parsed" | "matched" | "built" | "awaiting_approval"
  | "approved" | "published" | "rejected" | "failed";

export type StepResult = "advanced" | "skipped" | "retry" | "failed";

// Runs one pipeline step for a post that is in `from` status.
// `work` does the step and returns the columns to save; on success the post
// moves to `to`. Safe to call repeatedly: it only acts while the post is still
// in `from`, and every update is guarded on that status. Never throws.
// Every run is recorded in post_events (started, then its outcome), and a
// post that ends up failed triggers an alert email to Dan.
export async function runStep<Row>(
  step: string,
  postId: string,
  from: PostStatus,
  to: PostStatus,
  columns: string,
  work: (post: Row & { id: string }) => Promise<Record<string, unknown>>,
): Promise<StepResult> {
  const db = supabaseAdmin();
  const { data: post, error: loadError } = await db
    .from("posts")
    .select(`id, status, attempts, ${columns}`)
    .eq("id", postId)
    .single<Row & { id: string; status: PostStatus; attempts: number }>();
  if (loadError || !post) {
    console.error(`[${step}] could not load post`, { postId, loadError });
    return "skipped";
  }
  if (post.status !== from) return "skipped";

  const startedAt = Date.now();
  await logEvent(postId, step, "started", { from });
  try {
    const fields = await work(post);
    const { error } = await db
      .from("posts")
      .update({ ...fields, status: to, error: null, attempts: 0 })
      .eq("id", postId)
      .eq("status", from);
    if (error?.code === "23505") throw new PermanentError(`Duplicate value: ${error.details ?? error.message}`);
    if (error) throw new Error(`Database update failed: ${error.message}`);
    console.log(`[${step}] done`, { postId, to });
    await logEvent(postId, step, "advanced", { from, to, durationMs: Date.now() - startedAt });
    return "advanced";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (err instanceof WaitError) {
      await db.from("posts").update({ error: `${step}: ${message}` }).eq("id", postId).eq("status", from);
      console.warn(`[${step}] waiting`, { postId, message });
      await logEvent(postId, step, "waiting", { from, message, durationMs: Date.now() - startedAt });
      return "retry";
    }
    const attempts = (post.attempts ?? 0) + 1;
    const giveUp = err instanceof PermanentError || attempts >= MAX_ATTEMPTS;
    await db
      .from("posts")
      .update({ attempts, error: `${step}: ${message}`, ...(giveUp ? { status: "failed" } : {}) })
      .eq("id", postId)
      .eq("status", from);
    console.warn(`[${step}] ${giveUp ? "failed" : "will retry"}`, { postId, attempts, message });
    await logEvent(postId, step, giveUp ? "failed" : "retry", {
      from,
      to: giveUp ? "failed" : null,
      message: giveUp ? message : `attempt ${attempts} of ${MAX_ATTEMPTS}: ${message}`,
      durationMs: Date.now() - startedAt,
    });
    if (giveUp) await sendFailureAlert(postId, message);
    return giveUp ? "failed" : "retry";
  }
}
