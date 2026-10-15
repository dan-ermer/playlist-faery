import "server-only";
import { PermanentError } from "@/lib/errors";
import { getReceivedEmail } from "@/lib/resend";
import {
  cleanLink,
  extractInstructions,
  fetchXPost,
  findSourceLink,
  handleFromSubject,
  htmlToText,
  type SourcePost,
} from "@/lib/sources";
import { runStep, type StepResult } from "@/lib/step";
import { supabaseAdmin } from "@/lib/supabase";

// Capture step: received -> captured.
// Reads the forwarded email, checks it really came from the sender (DMARC),
// finds the post link and/or screenshots, and stores the post's text and author.
export function capturePost(postId: string): Promise<StepResult> {
  return runStep<{ intake_message_id: string | null }>(
    "capture", postId, "received", "captured", "intake_message_id",
    async (post) => {
      if (!post.intake_message_id) throw new PermanentError("Post has no intake email");
      const fields = await captureFields(post.intake_message_id);
      if (fields.source_url) {
        // source_url is unique; name the original so Dan can find it.
        const { data: original } = await supabaseAdmin()
          .from("posts")
          .select("id")
          .eq("source_url", fields.source_url)
          .neq("id", post.id)
          .maybeSingle();
        if (original) throw new PermanentError(`Already forwarded (duplicate of post ${original.id})`);
      }
      return fields;
    },
  );
}

type CapturedFields = {
  source_platform: "threads" | "x" | "instagram" | "other" | null;
  source_url: string | null;
  author_handle: string | null;
  post_text: string | null;
  screenshot_path: string | null;
  screenshot_paths: string[] | null;
  instructions: string | null;
  posted_on?: string | null;
};

export async function captureFields(emailId: string): Promise<CapturedFields> {
  const email = await getReceivedEmail(emailId);

  // The From address can be forged; DMARC proves the sender's domain sent it.
  if (email.authentication.dmarc !== "pass") {
    throw new PermanentError(
      `Sender authentication failed (dmarc: ${email.authentication.dmarc ?? "missing"})`,
    );
  }

  // Screenshots stay in Resend; Parse downloads them by these references, in
  // email order. Tiny images (signature logos, tracking pixels) are skipped.
  const paths = email.attachments
    .filter((a) => a.content_type.startsWith("image/") && a.size >= 5_000)
    .map((a) => `resend:${emailId}/${a.id}`);
  const screenshot_path = paths[0] ?? null;
  const shots = { screenshot_path, screenshot_paths: paths.length ? paths : null };

  const body = email.text ?? htmlToText(email.html ?? "");
  const link = findSourceLink(body);
  // Anything Dan typed travels with every capture (trusted; see Parse and Match).
  const shotsAndNote = { ...shots, instructions: extractInstructions(body) };

  // X: the official oEmbed endpoint gives the text, handle and date.
  if (link?.platform === "x") {
    const post: SourcePost = await fetchXPost(link.url);
    return {
      source_platform: post.platform,
      source_url: post.url,
      author_handle: post.handle,
      post_text: post.text,
      ...shotsAndNote,
      posted_on: post.postedOn,
    };
  }

  // Threads and Instagram: read from Dan's screenshot only; the link is kept for
  // credit and duplicate checks but never fetched (see lib/sources.ts).
  if (link) {
    const name = link.platform === "threads" ? "Threads" : "Instagram";
    if (!screenshot_path) {
      throw new PermanentError(
        `${name} posts are read from a screenshot (their pages aren't fetched). Forward the link again with a screenshot of the post attached.`,
      );
    }
    return {
      source_platform: link.platform,
      source_url: cleanLink(link.url),
      author_handle: link.platform === "threads" ? handleFromSubject(email.subject) : null,
      post_text: null,
      ...shotsAndNote,
    };
  }

  // Screenshot only: Parse reads the list, the handle, the date and the app.
  if (screenshot_path) {
    return { source_platform: null, source_url: null, author_handle: null, post_text: null, ...shotsAndNote };
  }
  throw new PermanentError("No Threads, X or Instagram link or screenshot found in the email");
}
