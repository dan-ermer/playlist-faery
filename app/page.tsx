import Link from "next/link";
import { connection } from "next/server";
import { Crown } from "@/app/_components/crown";
import { getCatalog, type CatalogEntry } from "@/lib/catalog";
import { PLATFORM_NAMES } from "@/lib/sources";
import styles from "./page.module.css";

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

// "wished by @handle on Threads · Oct 1, 2026", the handle linked to the post.
function Credit({ entry }: { entry: CatalogEntry }) {
  const where = PLATFORM_NAMES[entry.platform ?? ""];
  const who = entry.handle ? `@${entry.handle}${where ? ` on ${where}` : ""}` : where ? `on ${where}` : null;
  return (
    <span className={styles.credit}>
      wished{" "}
      {who && (
        <>
          {entry.handle ? "by " : ""}
          {entry.postUrl ? <a href={entry.postUrl}>{who}</a> : who}
        </>
      )}
      {entry.date && <> · {formatDate(entry.date)}</>}
    </span>
  );
}

function PlaylistTile({ entry }: { entry: CatalogEntry }) {
  const shown = entry.artists.slice(0, 4);
  const more = entry.artists.length - shown.length;
  return (
    <article className={styles.tile}>
      <span className={styles.poof} aria-hidden="true">
        ★ Poof!
      </span>
      <h2 className={styles.title}>{entry.title}</h2>
      <Credit entry={entry} />
      <p className={styles.artists}>
        {shown.join(", ")}
        {more > 0 && <> and {more} more</>}
      </p>
      <div className={styles.foot}>
        <span className={styles.tracks}>
          {entry.trackCount} {entry.trackCount === 1 ? "track" : "tracks"}
        </span>
        <a href={entry.playlistUrl} className={styles.listen} aria-label={`Listen to ${entry.title} on Spotify`}>
          ★ Listen
        </a>
      </div>
    </article>
  );
}

export default async function Home() {
  await connection(); // always show the latest playlists
  const catalog = await getCatalog();

  return (
    <main className={styles.wrap}>
      <header className={styles.hero}>
        <h1 className={styles.wordmark}>
          <Crown className={styles.crown} />
          PLAYLIST FAERY
        </h1>
        <p className={styles.tagline}>Freeing playlists trapped in social media posts!</p>
        <p className={styles.intro}>
          When someone shares a list of their favorite songs, artists or albums on Threads, X or Instagram, Playlist
          Faery turns it into a real Spotify playlist and credits the person who posted it.
        </p>
      </header>

      {catalog.length === 0 ? (
        <p className={styles.empty}>No wishes granted yet. The first ones are on their way!</p>
      ) : (
        <>
          <div className={styles.count}>
            <span>
              ♛ {catalog.length} {catalog.length === 1 ? "wish" : "wishes"} granted
            </span>
            <small>Newest first</small>
          </div>
          <ul className={styles.grid}>
            {catalog.map((entry) => (
              <li key={entry.id}>
                <PlaylistTile entry={entry} />
              </li>
            ))}
          </ul>
        </>
      )}

      <footer className={styles.footer}>
        <p className={styles.footerSticker}>Every playlist credits the person whose post it came from</p>
        <p>
          Playlist Faery · @playlistfaery · <a href="mailto:hello@playlistfaery.com">hello@playlistfaery.com</a>
        </p>
        <p>
          <Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link>
        </p>
      </footer>
    </main>
  );
}
