import { type NextRequest } from "next/server";
import { escapeHtml as escape, messagePage } from "@/lib/message-page";
import { exchangeCode, FAERY_USERNAME, saveLogin } from "@/lib/threads";

const page = (status: number, message: string) => messagePage(status, "Threads", message);

// Step 2: Threads sends Dan back here with a one-time code. We check the state,
// trade the code for a 60-day token, make sure it's @playlistfaery, and store it.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const expected = request.cookies.get("threads_oauth_state")?.value;
  if (!expected || params.get("state") !== expected) {
    return page(400, "This login link has expired or didn't start here. Please start again at /api/threads/login.");
  }
  if (params.get("error")) {
    return page(400, `Threads login was cancelled (${escape(params.get("error_description") ?? params.get("error")!)}).`);
  }
  const code = params.get("code");
  if (!code) return page(400, "Threads didn't send a login code. Please try again.");

  try {
    const { token, accountId, username } = await exchangeCode(code);
    if (username.toLowerCase() !== FAERY_USERNAME) {
      console.warn("[threads] refused login from a different account", { username });
      return page(403, `You logged in as @${escape(username)}, which isn't @${FAERY_USERNAME}. Nothing was changed.`);
    }
    await saveLogin(accountId, token);
    console.log("[threads] @playlistfaery logged in", { accountId, expiresInDays: Math.round(token.expires_in / 86400) });
    const response = page(
      200,
      `Logged in as <b>@${escape(username)}</b>. Playlist Faery can now post and reply on Threads. You can close this tab.`,
    );
    response.headers.append("set-cookie", "threads_oauth_state=; Path=/api/threads; Max-Age=0");
    return response;
  } catch (err) {
    console.error("[threads] login failed", err);
    return page(500, "Something went wrong saving the Threads login. Check the Vercel logs, then try again.");
  }
}
