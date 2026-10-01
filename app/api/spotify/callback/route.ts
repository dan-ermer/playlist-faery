import { type NextRequest } from "next/server";
import { exchangeCode, redirectUri, saveLogin, storedAccountId } from "@/lib/spotify";

function page(status: number, message: string) {
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">` +
      `<title>Playlist Faery · Spotify</title>` +
      `<body style="font-family:system-ui;max-width:32rem;margin:3rem auto;padding:0 1rem;line-height:1.5">` +
      `<p>${message}</p></body>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Step 2: Spotify sends Dan back here with a one-time code. We check the state,
// trade the code for tokens, and store them for the Faery account.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const expected = request.cookies.get("spotify_oauth_state")?.value;
  if (!expected || params.get("state") !== expected) {
    return page(400, "This login link has expired or didn't start here. Please start again at /api/spotify/login.");
  }
  if (params.get("error")) return page(400, `Spotify login was cancelled (${escape(params.get("error")!)}).`);
  const code = params.get("code");
  if (!code) return page(400, "Spotify didn't send a login code. Please try again.");

  try {
    const { tokens, accountId, displayName } = await exchangeCode(code, redirectUri(request));
    if (!tokens.refresh_token) throw new Error("Spotify returned no refresh token");

    // Once the Faery account is stored, refuse logins from any other account.
    const existing = await storedAccountId();
    if (existing && existing !== accountId) {
      console.warn("[spotify] refused login from a different account", { accountId, existing });
      return page(403, `You logged in as ${escape(displayName ?? accountId)}, which isn't the Faery account. Nothing was changed.`);
    }

    await saveLogin(accountId, tokens);
    console.log("[spotify] Faery account logged in", { accountId });
    const response = page(200, `Logged in as <b>${escape(displayName ?? accountId)}</b>. Playlist Faery can now create playlists. You can close this tab.`);
    response.headers.append("set-cookie", "spotify_oauth_state=; Path=/api/spotify; Max-Age=0");
    return response;
  } catch (err) {
    console.error("[spotify] login failed", err);
    return page(500, "Something went wrong saving the Spotify login. Check the Vercel logs, then try again.");
  }
}
