import { deleteThreadsUserData, verifiedThreadsUser } from "@/lib/meta";

// Meta's deauthorize callback: the account removed Playlist Faery's access,
// so the stored Threads login is deleted.
export async function POST(request: Request) {
  const userId = await verifiedThreadsUser(request);
  if (!userId) return new Response("Invalid signed_request", { status: 400 });
  await deleteThreadsUserData(userId);
  console.log("[threads] app access removed; tokens deleted", { userId });
  return new Response(null, { status: 200 });
}
