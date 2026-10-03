import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase";

// Meta's signed_request: "<base64url signature>.<base64url JSON payload>", the
// signature being HMAC-SHA256 of the payload part with the app secret.
// Returns the payload, or null if the signature doesn't check out.
export function parseSignedRequest(
  signedRequest: string,
  secret: string,
): { user_id?: string; algorithm?: string; issued_at?: number } | null {
  const [encodedSig, payload] = signedRequest.split(".", 2);
  if (!encodedSig || !payload) return null;
  const expected = createHmac("sha256", secret).update(payload).digest();
  const actual = Buffer.from(encodedSig, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return data.algorithm?.toUpperCase() === "HMAC-SHA256" ? data : null;
  } catch {
    return null;
  }
}

// Reads and verifies the signed_request form field Meta POSTs to our callbacks.
export async function verifiedThreadsUser(request: Request): Promise<string | null> {
  const secret = process.env.THREADS_APP_SECRET;
  if (!secret) throw new Error("Missing THREADS_APP_SECRET");
  const form = await request.formData().catch(() => null);
  const signed = form?.get("signed_request");
  if (typeof signed !== "string") return null;
  return parseSignedRequest(signed, secret)?.user_id ?? null;
}

// Deletes everything we hold from Threads about this user: only the stored
// login (tokens) of the account Playlist Faery acts as. Posts we turned into
// playlists come from public pages, not from this user's Threads data.
export async function deleteThreadsUserData(userId: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("oauth_tokens")
    .delete()
    .eq("provider", "threads")
    .eq("account_id", userId);
  if (error) throw new Error(`Could not delete Threads tokens: ${error.message}`);
}
