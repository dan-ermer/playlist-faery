import "server-only";
import type { PostStatus } from "@/lib/step";
import { supabaseAdmin } from "@/lib/supabase";

export type EventKind =
  | "received" | "started" | "advanced" | "retry" | "waiting" | "failed" | "claimed" | "approved" | "rejected" | "note";

export type PostEvent = {
  at: string;
  step: string;
  kind: EventKind;
  from_status: PostStatus | null;
  to_status: PostStatus | null;
  message: string | null;
  duration_ms: number | null;
};

// Records one entry in the post's history. Best effort: a failure to log is
// reported in the function logs but never stops the post itself.
export async function logEvent(
  postId: string,
  step: string,
  kind: EventKind,
  details: { from?: PostStatus | null; to?: PostStatus | null; message?: string | null; durationMs?: number } = {},
): Promise<void> {
  try {
    const { error } = await supabaseAdmin().from("post_events").insert({
      post_id: postId,
      step,
      kind,
      from_status: details.from ?? null,
      to_status: details.to ?? null,
      message: details.message ?? null,
      duration_ms: details.durationMs ?? null,
    });
    if (error) console.warn("[events] could not log", { postId, step, kind, error: error.message });
  } catch (err) {
    console.warn("[events] could not log", { postId, step, kind, err: String(err) });
  }
}

// A post's history, oldest first (the most recent `limit` events).
export async function postHistory(postId: string, limit = 20): Promise<PostEvent[]> {
  const { data } = await supabaseAdmin()
    .from("post_events")
    .select("at, step, kind, from_status, to_status, message, duration_ms")
    .eq("post_id", postId)
    .order("at", { ascending: false })
    .limit(limit)
    .returns<PostEvent[]>();
  return (data ?? []).reverse();
}

// "03:06:43 UTC  parse advanced (captured → parsed, 21.4s)"
export function formatEvent(e: PostEvent): string {
  const time = e.at.slice(11, 19);
  const move = e.from_status && e.to_status ? `${e.from_status} → ${e.to_status}` : (e.from_status ?? e.to_status ?? "");
  const extra = [move, e.duration_ms != null ? `${(e.duration_ms / 1000).toFixed(1)}s` : ""].filter(Boolean).join(", ");
  return `${time} UTC  ${e.step} ${e.kind}${extra ? ` (${extra})` : ""}${e.message ? `: ${e.message}` : ""}`;
}
