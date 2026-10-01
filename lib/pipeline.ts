import "server-only";
import { buildPost } from "@/lib/build";
import { capturePost } from "@/lib/capture";
import { matchPost } from "@/lib/match";
import { parsePost } from "@/lib/parse";
import type { PostStatus, StepResult } from "@/lib/step";
import { supabaseAdmin } from "@/lib/supabase";

const STEPS: Partial<Record<PostStatus, (postId: string) => Promise<StepResult>>> = {
  received: capturePost,
  captured: parsePost,
  parsed: matchPost,
  matched: buildPost,
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
