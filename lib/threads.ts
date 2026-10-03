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

// Permissions added to the Meta app (requesting one that isn't fails the login).
// threads_keyword_search finds forwarded posts that don't mention us; until App
// Review approves it, searches only cover @playlistfaery's own posts.
export const SCOPES = [
  "threads_basic",
  "threads_content_publish",
  "threads_manage_replies",
  "threads_read_replies",
  "threads_manage_mentions",
  "threads_keyword_search",
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

// ---------------------------------------------------------------------------
// Posting and replying as @playlistfaery

async function threadsGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${GRAPH}/v1.0/${path}`, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 401) throw new WaitError(REAUTH);
  return graphJson<T>(res, `GET ${path.split("?")[0]}`);
}

// Threads counts emoji as their UTF-8 byte length toward the 500-character limit.
export function threadsLength(text: string): number {
  return [...text].reduce((n, ch) => n + (/[\u0000-\u007f]/.test(ch) ? 1 : Buffer.byteLength(ch, "utf8")), 0);
}

// Publishes a text post (or a reply, with replyToId) and returns its id and link.
// Two steps: prepare a container, wait until Threads says it's ready, publish.
export async function publishText(opts: {
  text: string;
  replyToId?: string;
  linkAttachment?: string;
}): Promise<{ id: string; permalink: string }> {
  if (threadsLength(opts.text) > 500) throw new Error(`Threads text too long (${threadsLength(opts.text)}/500)`);
  const { token, accountId } = await getThreadsToken();
  const body = new URLSearchParams({ media_type: "TEXT", text: opts.text });
  if (opts.replyToId) body.set("reply_to_id", opts.replyToId);
  if (opts.linkAttachment) body.set("link_attachment", opts.linkAttachment);
  const prepRes = await fetch(`${GRAPH}/v1.0/me/threads`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  if (prepRes.status === 401) throw new WaitError(REAUTH);
  const { id: containerId } = await graphJson<{ id: string }>(prepRes, "prepare post");

  // Text containers are usually ready at once; Meta suggests waiting up to ~30s.
  for (let i = 0; i < 15; i++) {
    const { status, error_message } = await threadsGet<{ status: string; error_message?: string }>(
      `${containerId}?fields=status,error_message`,
      token,
    );
    if (status === "FINISHED") break;
    if (status === "ERROR" || status === "EXPIRED") throw new Error(`Threads couldn't prepare the post: ${error_message ?? status}`);
    await new Promise((r) => setTimeout(r, 2_000));
  }

  const pubRes = await fetch(`${GRAPH}/v1.0/${accountId}/threads_publish`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: new URLSearchParams({ creation_id: containerId }),
    signal: AbortSignal.timeout(20_000),
  });
  const { id } = await graphJson<{ id: string }>(pubRes, "publish post");
  const { permalink } = await threadsGet<{ permalink: string }>(`${id}?fields=permalink`, token);
  return { id, permalink };
}

// The shortcode in a Threads post link ("…/post/DeCiUMpkcAw").
export function threadsShortcode(url: string): string | null {
  return url.match(/threads\.(?:com|net)\/@[^/]+\/post\/([A-Za-z0-9_-]+)/)?.[1] ?? null;
}

type FoundPost = { id: string; permalink?: string };

// Finds a forwarded Threads post's API id. Link ids and API ids are unrelated,
// so it has to come from mentions (posts that tag @playlistfaery) or keyword
// search (any public post, once Meta approves threads_keyword_search; until
// then search only covers our own posts). Matched on the link's shortcode.
export async function findThreadsPostId(post: {
  sourceUrl: string;
  handle: string | null;
  text: string | null;
}): Promise<string | null> {
  const code = threadsShortcode(post.sourceUrl);
  if (!code) return null;
  const { token } = await getThreadsToken();
  const match = (list: FoundPost[]) => list.find((p) => p.permalink && threadsShortcode(p.permalink) === code)?.id ?? null;

  const mentions = await threadsGet<{ data?: FoundPost[] }>("me/mentions?fields=id,permalink&limit=50", token);
  const fromMentions = match(mentions.data ?? []);
  if (fromMentions) return fromMentions;

  // Search by the post's opening words, narrowed to its author.
  const words = (post.text ?? "").replace(/https?:\/\/\S+/g, " ").split(/\s+/).filter(Boolean).slice(0, 8).join(" ");
  if (!words) return null;
  const params = new URLSearchParams({ q: words, search_type: "RECENT", fields: "id,permalink", limit: "25" });
  if (post.handle) params.set("author_username", post.handle);
  const results = await threadsGet<{ data?: FoundPost[] }>(`keyword_search?${params}`, token);
  return match(results.data ?? []);
}
