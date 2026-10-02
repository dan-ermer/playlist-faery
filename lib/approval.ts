import "server-only";
import { PermanentError } from "@/lib/errors";
import { resend } from "@/lib/resend";
import { setPlaylistPublic } from "@/lib/spotify";
import { runStep, type StepResult } from "@/lib/step";
import { supabaseAdmin } from "@/lib/supabase";

export const SITE_URL = "https://playlistfaery.com";
const FROM = "Playlist Faery <faery@playlistfaery.com>";
const REPLY_TO = "hello@playlistfaery.com";

type ApprovalPost = {
  id: string;
  intake_from: string | null;
  playlist_title: string | null;
  playlist_name: string | null;
  author_handle: string | null;
  source_platform: string | null;
  source_url: string | null;
  spotify_playlist_url: string | null;
  approval_token: string;
  parse_notes: string | null;
};

type ApprovalItem = {
  position: number;
  raw_text: string;
  matched: boolean;
  match_note: string | null;
  spotify_track_id: string | null;
  spotify_track_name: string | null;
  spotify_artists: string | null;
};

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const PLATFORM_NAMES: Record<string, string> = { threads: "Threads", x: "X" };

// Builds the approval email (HTML and plain text) for one post.
export function renderApprovalEmail(post: ApprovalPost, items: ApprovalItem[]) {
  const e = escapeHtml;
  const title = post.playlist_name ?? post.playlist_title ?? "Untitled playlist";
  const who = post.author_handle ? `@${post.author_handle}` : "unknown poster";
  const where = PLATFORM_NAMES[post.source_platform ?? ""] ?? "social media";
  const matched = items.filter((i) => i.matched);
  const unmatched = items.filter((i) => !i.matched);
  const approveUrl = `${SITE_URL}/api/approve?token=${post.approval_token}`;
  const rejectUrl = `${SITE_URL}/api/reject?token=${post.approval_token}`;

  // The subject keeps the short title; the full playlist name is the heading.
  const subject = `Approve? "${post.playlist_title ?? title}" from ${who} (${matched.length}/${items.length} matched)`;

  const button = (href: string, label: string, color: string) =>
    `<a href="${e(href)}" style="display:inline-block;padding:12px 22px;margin:0 8px 8px 0;border-radius:8px;background:${color};color:#fff;text-decoration:none;font-weight:600">${label}</a>`;

  const trackLine = (i: ApprovalItem) => {
    const pick = i.spotify_track_id
      ? `<a href="https://open.spotify.com/track/${e(i.spotify_track_id)}" style="color:#1a7f4b">${e(i.spotify_track_name ?? "track")}</a> · ${e(i.spotify_artists ?? "")}`
      : "";
    const note = i.match_note ? `<br><span style="color:#8a6d00">⚠ ${e(i.match_note)}</span>` : "";
    return `<li style="margin-bottom:8px">${pick}<br><span style="color:#777">wrote: ${e(i.raw_text)}</span>${note}</li>`;
  };

  const html = `<!doctype html><html><body style="margin:0;padding:16px;font-family:-apple-system,system-ui,sans-serif;font-size:15px;line-height:1.45;color:#222">
<div style="max-width:560px;margin:0 auto">
<h2 style="margin:0 0 4px">${e(title)}</h2>
<p style="margin:0 0 16px;color:#555">From ${post.source_url ? `<a href="${e(post.source_url)}">${e(who)}'s post on ${where}</a>` : `${e(who)} on ${where}`} · ${matched.length} of ${items.length} matched</p>
<p>${button(approveUrl, "Approve", "#1a7f4b")}${button(rejectUrl, "Reject", "#a33")}</p>
${post.spotify_playlist_url ? `<p><a href="${e(post.spotify_playlist_url)}">Open the playlist in Spotify</a></p>` : ""}
${post.parse_notes ? `<p style="background:#fff8e1;padding:10px 12px;border-radius:6px">⚠ <b>Notes:</b> ${e(post.parse_notes)}</p>` : ""}
<h3 style="margin:20px 0 8px">Tracklist</h3>
<ol style="padding-left:22px;margin:0">${matched.map(trackLine).join("")}</ol>
${unmatched.length ? `<h3 style="margin:20px 0 8px">Not matched (${unmatched.length})</h3><ul style="padding-left:22px;margin:0">${unmatched.map((i) => `<li style="margin-bottom:8px">${e(i.raw_text)}<br><span style="color:#8a6d00">${e(i.match_note ?? "No match")}</span></li>`).join("")}</ul>` : ""}
<p style="margin-top:24px;color:#999;font-size:13px">Approving marks the post approved. Nothing is posted to Threads or X yet (Phase 2).</p>
</div></body></html>`;

  const text = [
    `${title}`,
    `From ${who} on ${where}${post.source_url ? `: ${post.source_url}` : ""}`,
    `${matched.length} of ${items.length} matched`,
    ``,
    `Approve: ${approveUrl}`,
    `Reject:  ${rejectUrl}`,
    post.spotify_playlist_url ? `Playlist: ${post.spotify_playlist_url}` : "",
    post.parse_notes ? `\nNotes: ${post.parse_notes}` : "",
    ``,
    `TRACKLIST`,
    ...matched.map(
      (i, n) =>
        `${n + 1}. ${i.spotify_track_name} - ${i.spotify_artists}  (wrote: ${i.raw_text})${i.match_note ? `  [! ${i.match_note}]` : ""}`,
    ),
    ...(unmatched.length ? [``, `NOT MATCHED`, ...unmatched.map((i) => `- ${i.raw_text}: ${i.match_note ?? "No match"}`)] : []),
  ]
    .filter((l) => l !== "")
    .join("\n");

  return { subject, html, text };
}

// Approval email step: built -> awaiting_approval.
// Emails the person who forwarded the post (always an ALLOWED_SENDERS address).
// Resend's idempotency key makes a retry within 24h a no-op instead of a second email.
export function sendApprovalEmail(postId: string): Promise<StepResult> {
  return runStep<Omit<ApprovalPost, "id">>(
    "approval-email", postId, "built", "awaiting_approval",
    "intake_from, playlist_title, playlist_name, author_handle, source_platform, source_url, spotify_playlist_url, approval_token, parse_notes",
    async (post) => {
      if (!post.intake_from) throw new PermanentError("No address to send the approval email to");
      const { data: items, error } = await supabaseAdmin()
        .from("post_items")
        .select("position, raw_text, matched, match_note, spotify_track_id, spotify_track_name, spotify_artists")
        .eq("post_id", post.id)
        .order("position")
        .returns<ApprovalItem[]>();
      if (error) throw new Error(`Could not load items: ${error.message}`);

      const { subject, html, text } = renderApprovalEmail(post, items ?? []);
      const { error: sendError } = await resend().emails.send(
        { from: FROM, to: post.intake_from, replyTo: REPLY_TO, subject, html, text },
        { idempotencyKey: `approval-email/${post.id}` },
      );
      if (sendError) throw new Error(`Resend: ${sendError.message}`);
      return {};
    },
  );
}

export type Decision = "approve" | "reject";

// Looks up a post by its approval token (for the confirmation page).
export async function postForToken(token: string) {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const { data } = await supabaseAdmin()
    .from("posts")
    .select("id, status, playlist_title, author_handle, spotify_playlist_url")
    .eq("approval_token", token)
    .maybeSingle();
  return data;
}

// Applies Dan's decision. Only acts on a post still awaiting approval, so
// repeated taps or a stale link can't change a decision already made.
export async function decide(token: string, decision: Decision) {
  const post = await postForToken(token);
  if (!post) return { ok: false as const, reason: "not-found" as const };
  if (post.status !== "awaiting_approval") return { ok: false as const, reason: "already" as const, post };

  const { data: updated, error } = await supabaseAdmin()
    .from("posts")
    .update(decision === "approve" ? { status: "approved", approved_at: new Date().toISOString() } : { status: "rejected" })
    .eq("id", post.id)
    .eq("status", "awaiting_approval")
    .select("id, spotify_playlist_id");
  if (error) throw new Error(`Could not save decision: ${error.message}`);
  if (!updated?.length) return { ok: false as const, reason: "already" as const, post };

  if (decision === "approve" && updated[0].spotify_playlist_id) {
    // Currently a no-op on Spotify's side (playlists are already public); kept so
    // the rule holds if Spotify starts honoring private playlists.
    await setPlaylistPublic(updated[0].spotify_playlist_id, true).catch((err) =>
      console.warn("[approve] could not set playlist public", { postId: post.id, err: String(err) }),
    );
  }
  console.log(`[${decision}]`, { postId: post.id });
  return { ok: true as const, post };
}
