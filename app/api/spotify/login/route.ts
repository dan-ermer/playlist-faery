import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { authorizeUrl, redirectUri } from "@/lib/spotify";

// Step 1 of logging the Faery Spotify account in: send Dan to Spotify's
// consent page. The random state, also kept in a short-lived cookie, lets the
// callback confirm the login started here (blocks forged callback links).
export async function GET(request: Request) {
  const state = randomBytes(16).toString("hex");
  const response = NextResponse.redirect(authorizeUrl(state, redirectUri(request)));
  response.cookies.set("spotify_oauth_state", state, {
    httpOnly: true,
    secure: new URL(request.url).protocol === "https:",
    sameSite: "lax",
    path: "/api/spotify",
    maxAge: 600,
  });
  return response;
}
