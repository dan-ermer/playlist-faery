import "server-only";
import { getReceivedEmail } from "@/lib/resend";
import {
  fetchThreadsPost,
  fetchXPost,
  findSourceLink,
  htmlToText,
  PermanentCaptureError,
  type SourcePost,
} from "@/lib/sources";
import { supabaseAdmin } from "@/lib/supabase";

// Temporary failures are retried this many times before the post is marked failed.
export const MAX_CAPTURE_ATTEMPTS = 3;

export type CaptureResult = "captured" | "skipped" | "retry" | "failed";

// Capture step: received -> captured.
// Reads the forwarded email, checks it really came from the sender (DMARC),
// finds the post link and/or screenshot, and stores the post's text and author.
// Safe to call repeatedly: it only acts on posts still in `received`. Never throws.
export async function capturePost(postId: string): Promise<CaptureResult> {
  const db = supabaseAdmin();
  const { data: post, error: loadError } = await db
    .from("posts")
    .select("id, status, intake_message_id, attempts")
    .eq("id", postId)
    .single();
  if (loadError || !post) {
    console.error("[capture] could not load post", { postId, loadError });
    return "skipped";
  }
  if (post.status !== "received" || !post.intake_message_id) return "skipped";

  try {
    const fields = await captureFields(post.intake_message_id);
    const { error } = await db
      .from("posts")
      .update({ ...fields, status: "captured", error: null })
      .eq("id", postId)
      .eq("status", "received");
    if (error?.code === "23505") {
      // source_url is unique: this post was already forwarded.
      const { data: original } = await db
        .from("posts")
        .select("id")
        .eq("source_url", fields.source_url!)
        .single();
      throw new PermanentCaptureError(`Already forwarded (duplicate of post ${original?.id ?? "unknown"})`);
    }
    if (error) throw new Error(`Database update failed: ${error.message}`);
    console.log("[capture] captured", { postId, source_url: fields.source_url });
    return "captured";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const attempts = (post.attempts ?? 0) + 1;
    const giveUp = err instanceof PermanentCaptureError || attempts >= MAX_CAPTURE_ATTEMPTS;
    await db
      .from("posts")
      .update({ attempts, error: `capture: ${message}`, ...(giveUp ? { status: "failed" } : {}) })
      .eq("id", postId)
      .eq("status", "received");
    console.warn(`[capture] ${giveUp ? "failed" : "will retry"}`, { postId, attempts, message });
    return giveUp ? "failed" : "retry";
  }
}

type CapturedFields = {
  source_platform: "threads" | "x" | "other" | null;
  source_url: string | null;
  author_handle: string | null;
  post_text: string | null;
  screenshot_path: string | null;
};

async function captureFields(emailId: string): Promise<CapturedFields> {
  const email = await getReceivedEmail(emailId);

  // The From address can be forged; DMARC proves the sender's domain sent it.
  if (email.authentication.dmarc !== "pass") {
    throw new PermanentCaptureError(
      `Sender authentication failed (dmarc: ${email.authentication.dmarc ?? "missing"})`,
    );
  }

  // Screenshots stay in Resend; Parse downloads them by this reference.
  const image = email.attachments.find((a) => a.content_type.startsWith("image/"));
  const screenshot_path = image ? `resend:${emailId}/${image.id}` : null;

  const body = email.text ?? htmlToText(email.html ?? "");
  const link = findSourceLink(body);

  let post: SourcePost | null = null;
  if (link?.platform === "threads") post = await fetchThreadsPost(link.url);
  if (link?.platform === "x") post = await fetchXPost(link.url);

  if (post) {
    return {
      source_platform: post.platform,
      source_url: post.url,
      author_handle: post.handle,
      post_text: post.text,
      screenshot_path,
    };
  }
  if (screenshot_path) {
    // Screenshot only, or a link we can't read yet (e.g. Instagram): Parse reads the image.
    return {
      source_platform: link ? "other" : null,
      source_url: link ? link.url.split("?")[0] : null,
      author_handle: null,
      post_text: null,
      screenshot_path,
    };
  }
  if (link?.platform === "instagram") {
    throw new PermanentCaptureError(
      "Instagram links can't be read yet (Phase 4). Forward a screenshot of the post instead.",
    );
  }
  throw new PermanentCaptureError("No Threads/X link or screenshot found in the email");
}
