import { connection } from "next/server";
import { getCatalog, type CatalogEntry } from "@/lib/catalog";
import { PLATFORM_NAMES } from "@/lib/sources";

// "2026-09-30" -> "Sep 30, 2026" (no time zone shifting: it's a calendar date).
function formatDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function Credit({ entry }: { entry: CatalogEntry }) {
  const where = PLATFORM_NAMES[entry.platform ?? ""];
  const who = entry.handle ? `@${entry.handle}` : "a post";
  const label = where ? `${who} on ${where}` : who;
  return (
    <p className="text-sm text-muted">
      from{" "}
      {entry.postUrl ? (
        <a href={entry.postUrl} className="underline decoration-border underline-offset-2 hover:text-foreground">
          {label}
        </a>
      ) : (
        label
      )}
      {entry.date && <> · {formatDate(entry.date)}</>}
    </p>
  );
}

function PlaylistCard({ entry }: { entry: CatalogEntry }) {
  const shown = entry.artists.slice(0, 4);
  const more = entry.artists.length - shown.length;
  return (
    <li className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-5 shadow-sm">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-2xl leading-tight">{entry.title}</h2>
        <Credit entry={entry} />
      </div>
      {shown.length > 0 && (
        <p className="text-sm leading-relaxed">
          {shown.join(", ")}
          {more > 0 && <span className="text-muted"> and {more} more</span>}
        </p>
      )}
      <div className="mt-auto flex items-center justify-between gap-3 pt-1">
        <span className="text-sm text-muted">
          {entry.trackCount} {entry.trackCount === 1 ? "track" : "tracks"}
        </span>
        <a
          href={entry.playlistUrl}
          className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:opacity-90"
        >
          Listen on Spotify
        </a>
      </div>
    </li>
  );
}

export default async function Home() {
  await connection(); // always show the latest playlists
  const catalog = await getCatalog();

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-10 sm:px-6 sm:py-16">
      <header className="mb-10 flex flex-col gap-4 text-center sm:mb-14">
        <p className="text-gold text-xl" aria-hidden="true">✦ ✧ ✦</p>
        <h1 className="font-display text-5xl sm:text-6xl">Playlist Faery</h1>
        <p className="font-display text-xl italic text-muted">
          Freeing playlists trapped in social media posts
        </p>
        <p className="mx-auto max-w-2xl leading-relaxed">
          When someone shares a list of their favorite songs, artists or albums on Threads, X or
          Instagram, Playlist Faery turns it into a real Spotify playlist and credits the person who
          posted it. Here is every playlist freed so far.
        </p>
      </header>

      {catalog.length === 0 ? (
        <p className="text-center text-muted">No playlists yet. The first ones are on their way.</p>
      ) : (
        <>
          <p className="mb-4 text-sm text-muted">
            {catalog.length} {catalog.length === 1 ? "playlist" : "playlists"}, newest first
          </p>
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {catalog.map((entry) => (
              <PlaylistCard key={entry.id} entry={entry} />
            ))}
          </ul>
        </>
      )}

      <footer className="mt-16 border-t border-border pt-6 text-center text-sm text-muted">
        <p>
          Playlist Faery · <span className="whitespace-nowrap">@playlistfaery</span> ·{" "}
          <a href="mailto:hello@playlistfaery.com" className="underline underline-offset-2">
            hello@playlistfaery.com
          </a>
        </p>
        <p className="mt-1">Every playlist credits the person whose post it came from.</p>
      </footer>
    </main>
  );
}
