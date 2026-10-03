import { sendStuckDigest } from "@/lib/alerts";
import { warnIfNearPlaylistLimit } from "@/lib/limits";
import { AUTOMATIC_STATUSES, advanceStalePosts } from "@/lib/pipeline";
import { renewThreadsTokenIfDue } from "@/lib/threads";

// Gives the sweep time to work through several posts (Claude + Spotify calls).
export const maxDuration = 300;

// Vercel Cron calls this daily (see vercel.json), sending
// "Authorization: Bearer <CRON_SECRET>". Anyone else gets a 401.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response("CRON_SECRET is not configured", { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const results = await advanceStalePosts();
  const playlists = await warnIfNearPlaylistLimit();
  // After the sweep: anything still stuck for over an hour gets emailed to Dan.
  const stuck = await sendStuckDigest(AUTOMATIC_STATUSES);
  // Keep the 60-day Threads token alive; a renewal failure is reported, not fatal.
  const threadsToken = await renewThreadsTokenIfDue().catch((err) => {
    console.error("[cron] Threads token renewal failed", err);
    return "error";
  });
  return Response.json({ ok: true, advanced: results, playlists, stuck, threadsToken });
}
