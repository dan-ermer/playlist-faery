import Link from "next/link";

// Shared frame for the plain-English policy pages (privacy, terms, deletion status).
export function LegalPage({ title, updated, children }: { title: string; updated?: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-10 sm:px-6 sm:py-14">
      <Link href="/" className="font-display text-xl text-muted hover:text-foreground">
        ✦ Playlist Faery
      </Link>
      <h1 className="font-display mt-6 text-4xl sm:text-5xl">{title}</h1>
      {updated && <p className="mt-2 text-sm text-muted">Last updated {updated}</p>}
      <div className="mt-8 flex flex-col gap-4 leading-relaxed [&_a]:underline [&_a]:underline-offset-2 [&_h2]:font-display [&_h2]:mt-6 [&_h2]:text-2xl [&_li]:ml-5 [&_li]:list-disc">
        {children}
      </div>
      <footer className="mt-16 border-t border-border pt-6 text-center text-sm text-muted">
        <Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link> ·{" "}
        <a href="mailto:hello@playlistfaery.com">hello@playlistfaery.com</a>
      </footer>
    </main>
  );
}
