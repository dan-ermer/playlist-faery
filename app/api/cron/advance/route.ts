import { advanceStalePosts } from "@/lib/pipeline";

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
  return Response.json({ ok: true, advanced: results });
}
