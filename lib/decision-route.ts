import "server-only";
import { decide, escapeHtml as e, postForToken, SITE_URL, type Decision } from "@/lib/approval";
import { after } from "next/server";
import { buildPost } from "@/lib/build";
import { advancePost } from "@/lib/pipeline";

const LABELS: Record<Decision, { verb: string; done: string; color: string }> = {
  approve: { verb: "Approve", done: "Approved", color: "#1a7f4b" },
  reject: { verb: "Reject", done: "Rejected", color: "#a33" },
};

function page(status: number, body: string) {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<title>Playlist Faery</title></head>` +
      `<body style="font-family:-apple-system,system-ui,sans-serif;max-width:32rem;margin:2.5rem auto;padding:0 1rem;line-height:1.5;color:#222">` +
      `${body}</body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );
}

type Post = NonNullable<Awaited<ReturnType<typeof postForToken>>>;

const describe = (p: Post) =>
  `<b>${e(p.playlist_title ?? "Untitled playlist")}</b>${p.author_handle ? ` from @${e(p.author_handle)}` : ""}`;

const playlistLink = (p: Post) =>
  p.spotify_playlist_url ? `<p><a href="${e(p.spotify_playlist_url)}">Open the playlist in Spotify</a></p>` : "";

const STATUS_WORDS: Record<string, string> = { approved: "approved", rejected: "rejected", published: "published" };

// GET shows a confirmation button; only the POST changes anything. Email link
// scanners often open (GET) every link in a message, so a GET must never approve.
export function decisionRoute(decision: Decision) {
  const { verb, done, color } = LABELS[decision];

  async function GET(request: Request) {
    const token = new URL(request.url).searchParams.get("token") ?? "";
    const post = await postForToken(token);
    if (!post) return page(404, "<p>This link isn't valid. It may have been mistyped.</p>");
    if (post.status !== "awaiting_approval") {
      return page(200, `<p>${describe(post)} is already ${STATUS_WORDS[post.status] ?? `at status “${e(post.status)}”`}.</p>${playlistLink(post)}`);
    }
    return page(
      200,
      `<p>${verb} ${describe(post)}?</p>${playlistLink(post)}` +
        `<form method="post"><input type="hidden" name="token" value="${e(token)}">` +
        `<button style="font-size:1.1rem;padding:12px 28px;border:0;border-radius:8px;background:${color};color:#fff;font-weight:600">${verb}</button></form>`,
    );
  }

  async function POST(request: Request) {
    const form = await request.formData();
    const token = String(form.get("token") ?? "");
    try {
      const result = await decide(token, decision);
      if (!result.ok && result.reason === "not-found") return page(404, "<p>This link isn't valid.</p>");
      if (!result.ok) {
        return page(
          200,
          `<p>${describe(result.post)} was already decided; nothing changed.</p>${playlistLink(result.post)}` +
            `<p><a href="${SITE_URL}/share/${e(token)}">Open the share kit</a></p>`,
        );
      }
      if (decision === "reject") return page(200, `<p>✓ ${done} ${describe(result.post)}.</p>`);
      // Approved: build the playlist now so the link can be shown. If Spotify
      // is unavailable, the post stays approved and the sweep builds it later.
      await buildPost(result.post.id);
      after(() => advancePost(result.post.id));
      // On to the share kit: the playlist link plus ready-made posts for Dan.
      // (If Spotify was unavailable, it says the playlist is still being created.)
      return Response.redirect(`${SITE_URL}/share/${token}`, 303);
    } catch (err) {
      console.error(`[${decision}] failed`, err);
      return page(500, "<p>Something went wrong saving that. Please try again in a minute.</p>");
    }
  }

  return { GET, POST };
}
