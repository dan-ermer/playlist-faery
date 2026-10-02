// Finding the social post in a forwarded email and reading its public text.
// Threads: the public post page (og: tags), plus its embed page for the date.
// X: the free oEmbed endpoint.
// Neither needs API keys.

import { PermanentError } from "./errors";

export type Platform = "threads" | "x" | "instagram";

export type SourcePost = {
  platform: "threads" | "x";
  url: string; // canonical post URL, no tracking params
  handle: string; // without the @
  text: string;
  postedOn: string | null; // YYYY-MM-DD, when the platform shows it
};

const USER_AGENT = "Mozilla/5.0 (compatible; PlaylistFaery/1.0; +https://playlistfaery.com)";
const TIMEOUT_MS = 15_000;

const PLATFORM_HOSTS: [Platform, RegExp][] = [
  ["threads", /^(www\.)?threads\.(com|net)$/],
  ["x", /^(www\.|mobile\.)?(x|twitter)\.com$/],
  ["instagram", /^(www\.)?instagram\.com$/],
];

// First link in the email that points at a platform we recognize.
export function findSourceLink(text: string): { platform: Platform; url: string } | null {
  for (const raw of text.match(/https?:\/\/[^\s<>"']+/g) ?? []) {
    const href = decodeEntities(raw);
    let host: string;
    try {
      host = new URL(href).hostname.toLowerCase();
    } catch {
      continue;
    }
    const match = PLATFORM_HOSTS.find(([, re]) => re.test(host));
    if (match) return { platform: match[0], url: href };
  }
  return null;
}

export function decodeEntities(s: string): string {
  const named: Record<string, string> = {
    amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", mdash: "—", ndash: "–", hellip: "…",
  };
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : whole;
    }
    return named[code.toLowerCase()] ?? whole;
  });
}

export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  ).trim();
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

// First "Sep 30, 2026" / "September 30, 2026" in the text -> "2026-09-30".
export function parseDateText(text: string): string | null {
  const m = text.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? (\d{1,2}), (\d{4})\b/i);
  if (!m) return null;
  const month = MONTHS.indexOf(m[1].toLowerCase()) + 1;
  return `${m[3]}-${String(month).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

function metaContent(html: string, property: string): string | null {
  const re = new RegExp(`<meta[^>]+property="${property}"[^>]+content="([^"]*)"`, "i");
  const m = html.match(re);
  return m ? decodeEntities(m[1]) : null;
}

// Pure parser for a Threads post page, separated out so it can be tested on saved HTML.
export function parseThreadsPage(html: string): SourcePost {
  const ogUrl = metaContent(html, "og:url");
  const text = metaContent(html, "og:description");
  const m = ogUrl?.match(/threads\.(?:com|net)\/@([^/]+)\/post\/([^/?#]+)/);
  if (!m) throw new Error("Threads page has no post URL (login wall or layout change?)");
  if (!text?.trim()) throw new Error("Threads page has no post text");
  return {
    platform: "threads",
    url: `https://www.threads.com/@${m[1]}/post/${m[2]}`,
    handle: m[1],
    text: text.trim(),
    postedOn: null,
  };
}

// The embed page shows "9:11 AM · Sep 30, 2026"; the main page doesn't.
// Best effort: a missing date just means Build falls back to today's date.
async function fetchThreadsDate(postUrl: string): Promise<string | null> {
  try {
    const res = await fetch(`${postUrl}/embed`, {
      headers: { "user-agent": USER_AGENT, "accept-language": "en" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const m = (await res.text()).match(/\d{1,2}:\d{2}\s?[AP]M[^A-Za-z]{1,12}([A-Z][a-z]{2,8}\.? \d{1,2}, \d{4})/);
    return m ? parseDateText(m[1]) : null;
  } catch {
    return null;
  }
}

export async function fetchThreadsPost(link: string): Promise<SourcePost> {
  const res = await fetch(link, {
    headers: { "user-agent": USER_AGENT, "accept-language": "en" },
    redirect: "follow",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status === 404) throw new PermanentError("Threads post not found (deleted or private?)");
  if (!res.ok) throw new Error(`Threads returned HTTP ${res.status}`);
  const post = parseThreadsPage(await res.text());
  return { ...post, postedOn: await fetchThreadsDate(post.url) };
}

export function parseXOembed(json: { url?: string; author_url?: string; html?: string }): SourcePost {
  const m = json.url?.match(/(?:x|twitter)\.com\/([^/]+)\/status\/(\d+)/);
  const p = json.html?.match(/<p[^>]*>([\s\S]*?)<\/p>/);
  if (!m || !p) throw new Error("X oEmbed response missing post URL or text");
  return {
    platform: "x",
    url: `https://x.com/${m[1]}/status/${m[2]}`,
    handle: m[1],
    text: htmlToText(p[1]),
    // The blockquote ends with "&mdash; Name (@handle) <a href=...>March 21, 2006</a>".
    postedOn: parseDateText(json.html!.slice(json.html!.lastIndexOf("</p>"))),
  };
}

export async function fetchXPost(link: string): Promise<SourcePost> {
  const m = link.match(/(?:x|twitter)\.com\/([^/]+)\/status\/(\d+)/);
  if (!m) throw new PermanentError(`Not an X post link: ${link}`);
  const postUrl = `https://x.com/${m[1]}/status/${m[2]}`;
  const res = await fetch(
    `https://publish.x.com/oembed?omit_script=true&dnt=true&url=${encodeURIComponent(postUrl)}`,
    { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) },
  );
  if (res.status === 404 || res.status === 403) {
    throw new PermanentError("X post not found (deleted or protected account?)");
  }
  if (!res.ok) throw new Error(`X oEmbed returned HTTP ${res.status}`);
  return parseXOembed(await res.json());
}
