import Link from "next/link";
import styles from "./legal-page.module.css";

// Shared frame for the plain-English policy pages (privacy, terms, deletion status).
export function LegalPage({ title, updated, children }: { title: string; updated?: string; children: React.ReactNode }) {
  return (
    <main className={styles.wrap}>
      <Link href="/" className={styles.home}>
        PLAYLIST FAERY
      </Link>
      <article className={styles.card}>
        <h1 className={styles.title}>{title}</h1>
        {updated && <p className={styles.updated}>Last updated {updated}</p>}
        <div className={styles.body}>{children}</div>
      </article>
      <footer className={styles.footer}>
        <Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link> ·{" "}
        <a href="mailto:hello@playlistfaery.com">hello@playlistfaery.com</a>
      </footer>
    </main>
  );
}
