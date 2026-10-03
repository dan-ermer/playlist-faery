import "server-only";
import { WaitError } from "@/lib/errors";
import { supabaseAdmin } from "@/lib/supabase";

// Threads API wrapper, acting as the @playlistfaery account. Its login is stored
// in oauth_tokens (provider "threads"); see /api/threads/login.
// Tokens: the login code gives a 1-hour token, exchanged for a 60-day one.
// That one is renewed (it must be at least 24h old and not yet expired); once
// it expires, Dan has to log in again.

const GRAPH = "https://graph.threads.com";
const PROVIDER = "threads";

// The only account allowed to log in.
export const FAERY_USERNAME = "playlistfaery";

// Permissions already added to the Meta app. threads_keyword_search joins this
// list once it's added in the dashboard (requesting an unknown scope fails the login).
export const SCOPES = [
  "threads_basic",
  "threads_content_publish",
  "threads_manage_replies",
  "threads_read_replies",
  "threads_manage_mentions",
];

// Renew once the token is this close to expiring (the daily cron checks).
const RENEW_WITHIN_DAYS = 20;

const REAUTH =
  "Threads login expired or missing: log in as @playlistfaery at https://playlistfaery.com/api/threads/login";

export const REDIRECT_URI = "https://playlistfaery.com/api/threads/callback";

function appCredentials() {
  const id = process.env.THREADS_APP_ID;
  const secret = process.env.THREADS_APP_SECRET;
  if (!id || !secret) throw new Error("Missing THREADS_APP_ID or THREADS_APP_SECRET");
  return { id, secret };
}

export function authorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: appCredentials().id,
    redirect_uri: REDIRECT_URI,
    scope: SCOPES.join(","),
    response_type: "code",
    state,
  });
  return `https://threads.com/oauth/authorize?${params}`;
}

async function graphJson<T>(res: Response, what: string): Promise<T> {
  const text = await res.text();
  if (!res.ok) throw new Error(`Threads ${what} failed: HTTP ${res.status} ${text.slice(0, 300)}`);
  return JSON.parse(text) as T;
}

type LongLived = { access_token: string; expires_in: number };

// Login code -> 1-hour token -> 60-day token, plus who logged in.
// (The code exchange also returns user_id, but as a 17-digit number that
// JavaScript can't hold exactly; /me returns the id as a string instead.)
export async function exchangeCode(code: string) {
  const { id, secret } = appCredentials();
  const short = await graphJson<{ access_token: string }>(
    await fetch(`${GRAPH}/oauth/access_token`, {
      method: "POST",
      body: new URLSearchParams({
        client_id: id,
        client_secret: secret,
        code: code.replace(/#_$/, ""),
        grant_type: "authorization_code",
        redirect_uri: REDIRECT_URI,
      }),
      signal: AbortSignal.timeout(15_000),
    }),
    "code exchange",
  );
  const long = await graphJson<LongLived>(
    await fetch(
      `${GRAPH}/access_token?${new URLSearchParams({ grant_type: "th_exchange_token", client_secret: secret, access_token: short.access_token })}`,
      { signal: AbortSignal.timeout(15_000) },
    ),
    "long-lived token exchange",
  );
  const me = await graphJson<{ id: string; username: string }>(
    await fetch(`${GRAPH}/v1.0/me?fields=id,username`, {
      headers: { authorization: `Bearer ${long.access_token}` },
      signal: AbortSignal.timeout(15_000),
    }),
    "profile lookup",
  );
  return { token: long, accountId: me.id, username: me.username };
}

export async function saveLogin(accountId: string, token: LongLived) {
  const { error } = await supabaseAdmin().from("oauth_tokens").upsert({
    provider: PROVIDER,
    account_id: accountId,
    refresh_token: null,
    access_token: token.access_token,
    access_expires_at: new Date(Date.now() + token.expires_in * 1000).toISOString(),
    scope: SCOPES.join(","),
    authorized_at: new Date().toISOString(),
  });
  if (error) throw new Error(`Could not save Threads login: ${error.message}`);
}

// A valid token for @playlistfaery. Throws WaitError when there's no usable
// login, so posts wait for Dan instead of failing.
export async function getThreadsToken(): Promise<{ token: string; accountId: string }> {
  const { data: row } = await supabaseAdmin()
    .from("oauth_tokens")
    .select("access_token, access_expires_at, account_id")
    .eq("provider", PROVIDER)
    .maybeSingle();
  if (!row?.access_token || !row.access_expires_at || Date.parse(row.access_expires_at) <= Date.now() + 60_000) {
    throw new WaitError(REAUTH);
  }
  return { token: row.access_token, accountId: row.account_id };
}

// Called daily: renews the 60-day token when it's within RENEW_WITHIN_DAYS of
// expiring (and at least a day old, as Threads requires). Returns what it did.
export async function renewThreadsTokenIfDue(now = new Date()): Promise<"none" | "not-due" | "renewed" | "expired"> {
  const db = supabaseAdmin();
  const { data: row } = await db
    .from("oauth_tokens")
    .select("access_token, access_expires_at, updated_at")
    .eq("provider", PROVIDER)
    .maybeSingle();
  if (!row?.access_token || !row.access_expires_at) return "none";
  const expires = Date.parse(row.access_expires_at);
  if (expires <= now.getTime()) return "expired";
  const dueAt = expires - RENEW_WITHIN_DAYS * 86_400_000;
  const dayOld = now.getTime() - Date.parse(row.updated_at) >= 86_400_000;
  if (now.getTime() < dueAt || !dayOld) return "not-due";

  const renewed = await graphJson<LongLived>(
    await fetch(
      `${GRAPH}/refresh_access_token?${new URLSearchParams({ grant_type: "th_refresh_token", access_token: row.access_token })}`,
      { signal: AbortSignal.timeout(15_000) },
    ),
    "token renewal",
  );
  const { error } = await db
    .from("oauth_tokens")
    .update({
      access_token: renewed.access_token,
      access_expires_at: new Date(now.getTime() + renewed.expires_in * 1000).toISOString(),
    })
    .eq("provider", PROVIDER);
  if (error) throw new Error(`Could not save renewed Threads token: ${error.message}`);
  return "renewed";
}
