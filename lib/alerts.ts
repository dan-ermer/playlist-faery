import "server-only";
import { formatEvent, postHistory } from "@/lib/events";
import { allowedSenders } from "@/lib/intake";
import { resend } from "@/lib/resend";
import { supabaseAdmin } from "@/lib/supabase";

const FROM = "Playlist Faery <faery@playlistfaery.com>";

// What Dan can do about a failure, matched on the error message.
function hintFor(error: string): string {
  if (/not a music list|found no songs/i.test(error)) {
    return "If the post really does have a list (e.g. in an image or a later carousel slide), forward a screenshot of the list.";
  }
  if (/screenshot/i.test(error)) return "Forward a screenshot of the post (with its link, so it gets credited).";
  if (/already forwarded/i.test(error)) return "Nothing to do: this post is already in Playlist Faery.";
  if (/authentication failed/i.test(error)) return "Forward it again from your usual Gmail account.";
  if (/deleted or private|not found|protected/i.test(error)) return "The post may have been deleted or made private; a screenshot still works.";
  return "This kept failing after 3 tries. Ask Claude to look at the post's history (it's in the post_events table) and retry it.";
}

// Emails Dan when a post is marked failed. Sent once per post (Resend
// idempotency key), to the address that forwarded it. Never throws.
export async function sendFailureAlert(postId: string, error: string): Promise<void> {
  try {
    const { data: post } = await supabaseAdmin()
      .from("posts")
      .select("intake_from, intake_subject, source_url, author_handle")
      .eq("id", postId)
      .single();
    const to = post?.intake_from ?? [...allowedSenders()][0];
    if (!to) return;
    const what = post?.intake_subject?.trim() || (post?.author_handle ? `@${post.author_handle}'s post` : "a post you forwarded");
    const history = (await postHistory(postId, 12)).map(formatEvent);
    const text = [
      `Playlist Faery couldn't make a playlist from: ${what}`,
      post?.source_url ? `Post: ${post.source_url}` : "",
      ``,
      `Why: ${error}`,
      `What to do: ${hintFor(error)}`,
      ``,
      `History:`,
      ...history.map((h) => `  ${h}`),
      ``,
      `Post id: ${postId}`,
    ]
      .filter((l, i, all) => l !== "" || all[i - 1] !== "")
      .join("\n");
    const { error: sendError } = await resend().emails.send(
      { from: FROM, to, subject: `Couldn't make a playlist: ${what}`, text },
      { idempotencyKey: `failure/${postId}` },
    );
    if (sendError) console.warn("[alerts] failure email not sent", { postId, error: sendError.message });
  } catch (err) {
    console.warn("[alerts] failure email not sent", { postId, err: String(err) });
  }
}

// Daily: lists posts that have sat in an automatic status for over an hour
// (e.g. waiting on an expired Spotify login). Sends nothing when all is well.
export async function sendStuckDigest(statuses: string[], now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - 60 * 60_000).toISOString();
  const { data: stuck, error } = await supabaseAdmin()
    .from("posts")
    .select("id, status, updated_at, intake_subject, author_handle, error")
    .in("status", statuses)
    .lt("updated_at", cutoff)
    .order("updated_at");
  if (error) throw new Error(`Could not list stuck posts: ${error.message}`);
  if (!stuck?.length) return 0;
  const to = [...allowedSenders()][0];
  if (!to) return stuck.length;
  const lines = stuck.map(
    (p) =>
      `- ${p.intake_subject?.trim() || (p.author_handle ? `@${p.author_handle}` : p.id)}: ` +
      `${p.status} since ${p.updated_at.slice(0, 16).replace("T", " ")} UTC${p.error ? `\n    ${p.error}` : ""}`,
  );
  const { error: sendError } = await resend().emails.send(
    {
      from: FROM,
      to,
      subject: `Playlist Faery: ${stuck.length} post${stuck.length === 1 ? "" : "s"} stuck`,
      text: `These posts haven't moved for over an hour:\n\n${lines.join("\n")}\n\nAsk Claude to look at their history (post_events) if the reason isn't clear.`,
    },
    { idempotencyKey: `stuck/${now.toISOString().slice(0, 10)}` },
  );
  if (sendError) throw new Error(`Resend: ${sendError.message}`);
  return stuck.length;
}
