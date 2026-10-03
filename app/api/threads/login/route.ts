import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { authorizeUrl } from "@/lib/threads";

// Step 1 of logging @playlistfaery in to Threads: send Dan to the consent page.
// The random state, also kept in a short-lived cookie, lets the callback
// confirm the login started here (blocks forged callback links).
export async function GET() {
  const state = randomBytes(16).toString("hex");
  const response = NextResponse.redirect(authorizeUrl(state));
  response.cookies.set("threads_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/api/threads",
    maxAge: 600,
  });
  return response;
}
