// Ready-to-post wording for sharing a playlist: an announcement and a reply on
// the original post, shown on the share kit page (/share/[token]). Dan posts
// these himself, by hand; Playlist Faery never
// posts on Meta platforms automatically (the @playlistfaery Threads account was
// disabled in Oct 2026 after API testing; see CLAUDE.md).

type ShareRow = {
  source_platform: string | null;
  source_url: string | null;
  author_handle: string | null;
  post_text: string | null;
  playlist_title: string | null;
  spotify_playlist_url: string | null;
};

// How the poster is credited on Threads. Threads usernames are Instagram
// usernames, so an @handle from either reaches the right person; an X handle
// is written without @ so it can't tag a stranger on Threads.
export function creditFor(post: Pick<ShareRow, "source_platform" | "author_handle">): string {
  if (!post.author_handle) return "a post";
  if (post.source_platform === "threads") return `@${post.author_handle}'s post`;
  if (post.source_platform === "instagram") return `@${post.author_handle}'s Instagram post`;
  if (post.source_platform === "x") return `${post.author_handle}'s post on X`;
  return `@${post.author_handle}'s post`;
}

// Threads counts emoji as their UTF-8 byte length toward its 500-character limit.
export function threadsLength(text: string): number {
  return [...text].reduce((n, ch) => n + (/[\u0000-\u007f]/.test(ch) ? 1 : Buffer.byteLength(ch, "utf8")), 0);
}

const clip = (s: string, max: number) => ([...s].length > max ? `${[...s].slice(0, max - 1).join("")}…` : s);

// An announcement Dan can post on his own feed.
export function faeryPostText(post: ShareRow): string {
  const lines = (title: string) => [
    `♛ Wish granted! “${title}”, freed from ${creditFor(post)}.`,
    ``,
    `Listen on Spotify: ${post.spotify_playlist_url}`,
    ...(post.source_url ? [`Original post: ${post.source_url}`] : []),
  ];
  let title = post.playlist_title ?? "A freed playlist";
  let text = lines(title).join("\n");
  while (threadsLength(text) > 500 && title.length > 10) {
    title = clip(title, title.length - 10);
    text = lines(title).join("\n");
  }
  return text;
}

// A reply Dan can paste on the original post (from his own account).
export function replyText(post: ShareRow): string {
  return [
    `✦ Poof! I turned your list into a Spotify playlist: ${post.spotify_playlist_url}`,
    ``,
    `Thanks for the great picks! ♛ playlistfaery.com`,
  ].join("\n");
}

// Compose links: open the app's composer pre-filled; nothing posts until Dan
// presses Post. Threads: threads.net/intent/post. X: intent/tweet, which can
// also pre-fill a reply to a specific post (in_reply_to).
// Spaces must be %20, not "+": URLSearchParams writes "+", which the Threads
// app shows literally ("Wish+granted!").
export function threadsComposeUrl(text: string): string {
  return `https://www.threads.net/intent/post?text=${encodeURIComponent(text)}`;
}

export function xComposeUrl(text: string, inReplyTo?: string | null): string {
  const reply = inReplyTo ? `&in_reply_to=${encodeURIComponent(inReplyTo)}` : "";
  return `https://x.com/intent/tweet?text=${encodeURIComponent(text)}${reply}`;
}

// The numeric id in an X post link ("x.com/someone/status/1234").
export function xPostId(url: string | null): string | null {
  return url?.match(/(?:x|twitter)\.com\/[^/]+\/status\/(\d+)/)?.[1] ?? null;
}
