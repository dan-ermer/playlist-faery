// Finding the social post in a forwarded email.
// X posts are read through X's official oEmbed endpoint. Threads and Instagram
// pages are never fetched (Instagram's Terms prohibit automated collection, and
// Meta disabled @playlistfaery in Oct 2026): those posts come as screenshots,
// with the link kept only for credit.

import { PermanentError } from "./errors";

export type Platform = "threads" | "x" | "instagram";

export const PLATFORM_NAMES: Record<string, string> = { threads: "Threads", x: "X", instagram: "Instagram" };

export type SourcePost = {
  platform: "x";
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

// The link as Dan forwarded it, minus tracking parameters (?xmt=, ?igsh=…).
// Used for credit and duplicate checks; never fetched.
export function cleanLink(url: string): string {
  return url.split(/[?#]/)[0];
}

// Threads' share sheet titles the email "Kirsty (@kirstyahood) on Threads".
export function handleFromSubject(subject: string | null | undefined): string | null {
  return subject?.match(/\(@([\w.]+)\)\s+on Threads/i)?.[1] ?? null;
}

// What Dan typed in the email around the link ("two per artist", "do the whole
// album"): the body minus links, signatures, and forwarded or quoted text.
export function extractInstructions(body: string): string | null {
  const cut = body.search(
    /^(-{2,}\s*Forwarded message|Begin forwarded message|On .+wrote:\s*$|From: .+$)/im,
  );
  const lines = (cut >= 0 ? body.slice(0, cut) : body)
    .replace(/https?:\/\/\S+/g, " ")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith(">"))
    .filter((l) => !/^(sent from my|get outlook for)\b/i.test(l))
    .filter((l) => !/^--\s*$/.test(l));
  const text = lines.join("\n").trim();
  return text ? text.slice(0, 1000) : null;
}
