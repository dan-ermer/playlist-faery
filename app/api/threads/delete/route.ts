import { randomBytes } from "node:crypto";
import { deleteThreadsUserData, verifiedThreadsUser } from "@/lib/meta";

// Meta's data deletion callback (registered in the Threads app settings).
// Deletes what we hold for the user and returns the status link and
// confirmation code Meta shows them.
export async function POST(request: Request) {
  const userId = await verifiedThreadsUser(request);
  if (!userId) return new Response("Invalid signed_request", { status: 400 });
  await deleteThreadsUserData(userId);
  const code = randomBytes(8).toString("hex");
  console.log("[threads] data deletion request handled", { userId, code });
  return Response.json({ url: `https://playlistfaery.com/deletion?code=${code}`, confirmation_code: code });
}
