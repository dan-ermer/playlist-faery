import "server-only";
import { PermanentError } from "@/lib/errors";
import { getReceivedEmail } from "@/lib/resend";
import { fetchThreadsPost, fetchXPost, findSourceLink, htmlToText, type SourcePost } from "@/lib/sources";
import { runStep, type StepResult } from "@/lib/step";
import { supabaseAdmin } from "@/lib/supabase";

// Capture step: received -> captured.
// Reads the forwarded email, checks it really came from the sender (DMARC),
// finds the post link and/or screenshot, and stores the post's text and author.
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
  source_platform: "threads" | "x" | "other" | null;
  source_url: string | null;
  author_handle: string | null;
  post_text: string | null;
  screenshot_path: string | null;
  posted_on?: string | null;
};

async function captureFields(emailId: string): Promise<CapturedFields> {
  const email = await getReceivedEmail(emailId);

  // The From address can be forged; DMARC proves the sender's domain sent it.
  if (email.authentication.dmarc !== "pass") {
    throw new PermanentError(
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
      posted_on: post.postedOn,
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
    throw new PermanentError(
      "Instagram links can't be read yet (Phase 4). Forward a screenshot of the post instead.",
    );
  }
  throw new PermanentError("No Threads/X link or screenshot found in the email");
}
