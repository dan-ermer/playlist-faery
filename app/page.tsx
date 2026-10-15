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

// "wished upon @handle from Threads · Oct 1, 2026", the linked part going to the post.
function Credit({ entry }: { entry: CatalogEntry }) {
  const where = PLATFORM_NAMES[entry.platform ?? ""];
  const who = entry.handle ? `@${entry.handle}` : where ? "a post" : null;
  const what = who && (where ? `${who} from ${where}` : who);
  return (
    <span className={styles.credit}>
      wished{" "}
      {what && <>upon {entry.postUrl ? <a href={entry.postUrl}>{what}</a> : what}</>}
      {entry.date && <> · {formatDate(entry.date)}</>}
    </span>
  );
}

// The sticker on each card: a magic word, picked from the playlist's id so a
// card keeps its word between visits while the grid stays mixed up.
// Kept short (about 9 letters) so the sticker stays on the corner, clear of the title.
const MAGIC_WORDS = [
  "★ Poof!", "✦ Ta-da!", "Presto!", "Shazam!", "Voilà!", "Alakazam!",
  "Kazaam!", "✦ Zing!", "Bibbidi!", "★ Zap!", "Sparkle!", "Huzzah!",
];

function magicWord(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return MAGIC_WORDS[h % MAGIC_WORDS.length];
}

function PlaylistTile({ entry }: { entry: CatalogEntry }) {
  const shown = entry.artists.slice(0, 4);
  const more = entry.artists.length - shown.length;
  return (
    <article className={styles.tile}>
      <span className={styles.poof} aria-hidden="true">
        {magicWord(entry.id)}
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
        <p className={styles.tagline}>“I wish I could listen to that right now”</p>
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
