# Playlist Faery

Playlist Faery frees playlists that are stuck inside social media posts. When someone posts a list of songs, artists or albums on Threads or X, Playlist Faery turns it into a real Spotify playlist, shares it back where people found it, credits the original poster, and adds it to a public catalog at playlistfaery.com.

"Faery" is spelled that way on purpose (old-timey branding). Never "correct" it to "Fairy".

## Owner and how to work with him

- Owner: Dan. Strong on data, forecasting and product; fluent in ML concepts; not a day-to-day software engineer. Explain what you're doing and why in plain language, one step at a time.
- Ask before anything destructive or hard to undo (dropping tables, force-pushing, deleting files, rotating keys, posting publicly).
- Progress is tracked in a to-do doc outside the repo: https://claude.ai/code/artifact/d024028d-ce03-4f45-aa10-fadc7aeb741f
- Full requirements and plan: https://claude.ai/code/artifact/cdfad97e-cead-44e4-beb5-4f49a6f5ae29

## Core rules (from the requirements)

- Two human decisions only: **Dan chooses what goes in** (by forwarding) and **Dan approves before anything is posted publicly**. **Dan does all social posting himself, by hand** (Oct 2026 pivot, see Distribute); everything else is automatic.
- An @mention of Playlist Faery never triggers processing on its own. Only forwarded posts are processed.
- Always credit the original poster by handle, in the playlist description, the catalog, and any share text we prepare for Dan.
- Input types and track-pick rules:
  - Artist + song pairs (most common): match each song.
  - Artists only: one popular track per artist.
  - Artists + albums: one standout track per album.
  - Existing playlist link (edge case): recreate it on Spotify.
  - Picks should be representative but a little unpredictable, not always the #1 hit. Never whole albums or discographies, unless Dan asks.
- **Forwarder's instructions override the defaults, within guardrails** (`lib/instructions.ts`): what's typed in the forwarded email ("two per artist", "do the whole album", "only the top 10", "call it Road Trip") is stored as `posts.instructions` (max 500 chars) and given to Parse and Match as `<instructions_from_forwarder>` (angle brackets stripped); the post itself stays untrusted data. Built so other people can forward some day: instructions are followed only when they shape this playlist from the post's own list (which items, title, picks per item, kind of picks). Ignored: anything unrelated, adding music the post doesn't list, changing credit, offensive/promotional titles or ones with links/handles, and outlandish asks ("every song ever"). Over-limit asks are scaled back. Limits: 5 songs per artist, 30 tracks per item (one whole album), 150 tracks per playlist; the last two are also enforced in code in Match, and suggested titles are capped at 7. Claude notes anything ignored or scaled back in the approval email's notes.
- Unmatched items are recorded on the post's record (not silently dropped) for reporting or fixing later.
- Low overhead for Dan: self-contained, automatic, few moving parts.

## Pipeline

```
Intake → Capture → Parse → Match → Approval email → (Dan approves) → Build playlist → Catalog → (Dan shares by hand)

Statuses: received → captured → parsed → matched → awaiting_approval → approved → built → published
```

1. **Intake**: Dan shares a post link (or a screenshot) from his phone to the intake email address. Resend receives it and calls our webhook (`/api/inbound/resend`, event `email.received`). Only senders in `ALLOWED_SENDERS` are processed; others are logged and ignored.
2. **Capture** (`lib/capture.ts`): require DMARC pass on the forwarded email. **X links**: text, handle and date via X's official oEmbed (publish.x.com, no key). **Threads and Instagram: screenshot only** (decided 2026-10-05): their pages are never fetched (Instagram's Terms prohibit automated collection "regardless of whether … logged-in", and Meta disabled @playlistfaery). The link is stored cleaned of tracking params (`cleanLink`) for credit and duplicate checks; a Threads handle comes from the share-sheet email subject "Name (@handle) on Threads" (`handleFromSubject`), otherwise Parse reads handle, date and app from the screenshot. A Threads/Instagram link without a screenshot fails with a clear "forward it again with a screenshot" alert. Threads `/share/` links can differ per share, so duplicate detection can miss a re-forward. Screenshots stay in Resend: every image attachment ≥5 KB, in email order, goes in `screenshot_paths` (`resend:<email_id>/<attachment_id>`); `screenshot_path` keeps the first. Parse sends up to 10 together as consecutive parts of one post (scrolled list or carousel slides), de-duplicating overlaps. Runs from the webhook via `after()`; temporary errors retry up to 3 times. (`posts.post_image_url` is unused since the switch.) Text Dan typed in the email (minus links, signatures, forwarded/quoted text; `extractInstructions`) is saved to `posts.instructions`.
3. **Parse**: Claude API (`claude-opus-5-5`, `messages.parse` + Zod schema in `lib/parse.ts`) returns structured data: list type, items (artist/title/album, `raw_text` verbatim), poster handle, post date and app (screenshots only), suggested playlist title. Posters write both "Artist - Song" and "Song - Artist"; Claude decides which is which. A shared playlist becomes one item holding its link. Dan's instructions can change which items are listed and the title; when they ask for N songs per artist, Parse suggests N+2 titles.
4. **Match** (`lib/match.ts`): code gathers Spotify candidates per item (songs: field-filtered track search, plain-text fallback; artists: searches for the 3 `suggested_titles` Parse proposed for the post's theme, then `artist:` track search only if those didn't find the artist, then an artist-first fallback (exact-name artist search → a compilation, earliest and latest album) for short/common names like Sloan or James; albums: album search + tracklist of the top two versions), then one Claude call per post, given the post's text and title, picks a candidate per item using the pick rules and the post's theme (e.g. a vocalists list → songs that person sings lead on), or none with a `match_note`. When the forwarder's instructions ask for more ("two per artist", "whole album"), Claude returns several refs per item: the first fills the item's `spotify_*` columns, the rest go to `post_items.extra_tracks` ({id, uri, name, artists, album}, in order). Spotify calls are paced (~8/s); a short 429 is retried in place, a long one (Spotify escalates to ~1 hour when hammered) throws `WaitError` so posts wait instead of failing. Dev mode caps `/artists/{id}/albums` at limit 10 (undocumented). Search uses the app's client-credentials token (`lib/spotify.ts`); no user login needed. Dev-mode limits (Feb 2026): no top-tracks endpoint, no popularity/genres, search max 10 per call. Playlist-link items are recorded as unmatched until recreating playlists is built.
5. **Approve** (`lib/approval.ts`): right after Match (`matched → awaiting_approval`), email the forwarding address the tracklist (each track linked), unmatched items, Claude's notes and a playlist counter ("Faery playlists so far: N of about 11,000"), with Dan's instructions shown back ("Your instructions: …") and extra tracks listed under their item, and Approve/Reject links (`/api/approve?token=...`, `/api/reject?token=...`, using `posts.approval_token`). The link opens a confirmation page and only its button (POST) acts, because email link scanners open links. Resend idempotency keys prevent duplicate emails.
6. **Build** (`lib/build.ts`, `approved → built`): runs only after Dan approves. The approve page starts it straight away and shows the playlist link; if Spotify is unavailable the post stays `approved` and the sweep builds it later. Creates a **public** playlist on the Faery Spotify account (`POST /me/playlists`), named `@handle - mm/dd/yy - title` (handle omitted if unknown; date is `posted_on`, else the build date in US Eastern) and saved to `posts.playlist_name`, with a credit line in the description; saves its id/URL immediately (so retries reuse it), then sets its tracks: each item's pick followed by its `extra_tracks` (`PUT /playlists/{id}/items` for the first 100, then `POST` batches of 100). Spotify silently ignores `public: false` from this app (dev mode, observed Oct 2026), which is one reason Build moved after approval. The Faery account's login is stored in `oauth_tokens` via `/api/spotify/login` → `/api/spotify/callback`; once stored, logins from other Spotify accounts are refused. If the login is missing or expired, steps throw `WaitError`: the post waits with a re-login message and the attempt isn't counted.
   **Playlist cap:** Spotify docs say an account is "generally limited to a maximum of 11000 playlists" (what counts, e.g. deleted or followed playlists, is undocumented). `lib/limits.ts` counts playlists Faery created (posts with `spotify_playlist_id`); the daily cron emails the first `ALLOWED_SENDERS` address once past 9,000. Plan when that fires: overflow to a second Faery Spotify account (dev mode allows 5 users).
7. **Sharing (Dan posts by hand)**: Playlist Faery never posts, replies, searches or logs in on Meta platforms automatically. History: an automated Distribute step (Faery post + reply via the Threads API) was built, and the brand-new @playlistfaery Threads account was **disabled on 2026-10-04, appeal denied**, after one day of API testing (logins, mentions/search calls, one automated test reply to a tester's post). Likely triggers per Meta's Account Integrity and Spam policies: a new, empty-profile account acting through automation from day one, whose first post was an automated reply on another account. Rules from that: **never create a replacement account** (Account Integrity treats accounts "created … to evade a previous account … removal" or "owned by the same person … as an account that has been disabled" as violations, which could also endanger Dan's personal accounts); no automated Meta actions. The posting/search/login code was removed (in git history). **Share kit** (`app/share/[token]/page.tsx`, built 2026-10-15): Dan's private page per playlist, keyed by `approval_token` and marked noindex; after he taps Approve the confirm POST builds the playlist and redirects (303) there, and the approval email links to it. It shows the playlist link, a ready-made reply for the original post (Copy + Open the post; for X a "Reply on X" compose link with `in_reply_to`), and an announcement (Copy + Post on Threads via `threads.net/intent/post?text=` + Post on X via `x.com/intent/tweet`). Compose links only pre-fill; Dan presses Post. Wording lives in `lib/share-text.ts` (`replyText` is in Dan's voice, signed playlistfaery.com; `faeryPostText`; `creditFor` writes X handles without @). Status `published` is unused for now.
8. **Catalog** (built Oct 2026, ahead of Phase 2): the homepage (`app/page.tsx`, data from `lib/catalog.ts`) lists every playlist that exists (status `built` or `published`), newest first, with title, credited handle linking to the original post, date, track count, a few artists and a Spotify link. It renders per request (`await connection()`; this Next.js version dropped `export const revalidate` outside Cache Components, which we haven't enabled) and reads with the secret key on the server, selecting only public columns. That's deliberately instead of an RLS read policy: policies are row-level, so a policy on `posts` would expose `intake_from` and `approval_token` to the publishable key. Look: "Extruded Arcade ✦ Poof!" (spec and reference in `design_handoff/`, option 2c): tokens and polka-dot background in `app/globals.css`, home styles in `app/page.module.css`, Bungee / Bungee Shade / Chewy via next/font plus system Verdana, hard stepped extrusion shadows, "★ Poof!" stickers, tile colors cycling pink/lime/sky/lavender. The crown is an SVG (`app/_components/crown.tsx`), not the ♛ glyph (renders small and inconsistently); tune its placement via `.crown` top/left/width. No dark mode. Tailwind's reset strips link underlines and list bullets, so globals.css restores underlines and the policy pages restore bullets. Policy pages (/privacy, /terms, /deletion) share `app/_components/legal-page.tsx`.

Every post's status is recorded at each step, so nothing stalls unnoticed. Each step run is also logged to `post_events` (`lib/events.ts`): `started` then `advanced` / `retry` / `waiting` / `failed`, with message and duration, plus intake `received`, sweep `claimed` and Dan's `approved` / `rejected`. A `started` with no outcome means the step was cut off (Vercel Hobby keeps function logs only ~1 hour, so this table is the record). When a post becomes `failed`, `lib/alerts.ts` emails the forwarding address the reason, a what-to-do hint and the post's history (once per post); the daily cron also emails a digest of posts stuck over an hour in an automatic status (nothing sent when none). `lib/pipeline.ts` `advancePost()` runs the automatic steps in order; each step uses `runStep()` (`lib/step.ts`), which guards on status, resets `attempts` on success, and marks the post `failed` after 3 temporary errors or one `PermanentError`. A scheduled function (Vercel Cron) advances rows between statuses and retries failures. There's no separate workflow engine. The Vercel account is on **Hobby**, which allows crons only once a day, so `/api/cron/advance` runs daily (`vercel.json`, 14:00 UTC, protected by `CRON_SECRET`) and every accepted inbound email also calls `advanceStalePosts()` after its own post. The sweep only touches posts in an automatic status untouched for 10+ minutes and claims each with an `updated_at` compare-and-set, so it never runs Build twice on the same post. Upgrading to Pro would allow a `*/5 * * * *` schedule.

## Stack

| Piece | Choice |
|---|---|
| App / API routes / cron | Next.js (App Router, TypeScript, Tailwind) on Vercel. Auto-deploys on push to `main`. |
| Database | Supabase Postgres (project linked via `supabase link`; region US East) |
| Inbound + outbound email | Resend (sending on playlistfaery.com; receiving on the `in.playlistfaery.com` subdomain) |
| Parsing / picks | Claude API via `@anthropic-ai/sdk`, structured output with a JSON schema / tool use |
| Playlists | Spotify Web API, logged in as the Playlist Faery Spotify account (Premium) |
| Social | Dan posts by hand (Threads API automation retired Oct 2026); X API (Phase 3, pay-per-use) not started |
| DNS / domain | Cloudflare (DNS only, no proxy, on Vercel records) |

Domain: **playlistfaery.com**. Handle everywhere: **@playlistfaery**. Contact address: hello@playlistfaery.com (Cloudflare Email Routing → Faery Gmail). Intake address: **add@in.playlistfaery.com** (official). Anything sent to `@in.playlistfaery.com` is accepted.

## Environment variables

Stored in Vercel, **Production only** (not Preview/Development). Pull locally with `vercel env pull --environment=production .env.local`; variables marked Sensitive come back as the literal `[SENSITIVE]`, so paste those values into `.env.local` by hand (this bit `ANTHROPIC_API_KEY` once). New variables only reach the live site after a redeploy. **Never commit `.env*` files and never hard-code keys.**

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: safe for the browser
- `SUPABASE_SECRET_KEY`: full database access; **server-only**, never import into client components
- `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`
- `ALLOWED_SENDERS`: comma-separated addresses whose forwards are processed
- `ANTHROPIC_API_KEY`
- `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`
- `THREADS_APP_ID`, `THREADS_APP_SECRET`
- `CRON_SECRET`: Vercel Cron sends it as `Authorization: Bearer <secret>`
- Not used: Threads tokens (automation retired; the stored login was deleted 2026-10-04). Not yet created: X API keys (Phase 3). Spotify's stored login lives in the `oauth_tokens` table, not an env var.

If a new secret is needed, tell Dan the variable name and where to get the value; he adds it in Vercel.

## Data model

All migrations live in `supabase/migrations/` and are applied (check with `supabase migration list`). Run CLI commands with `< /dev/null`: `supabase migration new` otherwise waits for SQL on stdin.

- `post_status` enum values: `received, captured, parsed, matched, built, awaiting_approval, approved, published, rejected, failed`. The enum's declared order is historical; the flow is `matched → awaiting_approval → approved → built → published` (Build moved after approval in Oct 2026). Nothing compares statuses by order.
- `post_events`: append-only history per post (`step`, `kind`, `from_status`/`to_status`, `message`, `duration_ms`); RLS on, no policies.
- `oauth_tokens`: one row per provider (`spotify` now, `threads` later) with the account id, refresh/access tokens and `authorized_at`.
- `posts`: one row per forwarded post. Includes intake info (`intake_message_id` unique for idempotency), source (`source_platform` threads/x/instagram/other, `source_url` unique, `author_handle`, `post_text`, `screenshot_path` / `screenshot_paths`, `post_image_url` (unused since 2026-10-05)), parsing (`list_type`, `playlist_title`, `posted_on`), the final Spotify name (`playlist_name`), Spotify (`spotify_playlist_id`, `spotify_playlist_url`), approval (`approval_token`, `approved_at`), Dan's typed `instructions`, Claude's doubts from parsing (`parse_notes`), distribution (`reply_url`, `faery_post_url`), and `error` / `attempts` for retries. `updated_at` is set by a trigger.
- `post_items`: one row per song/artist/album, with `raw_text` exactly as written, parsed fields, `suggested_titles` (artist-only items), `extra_tracks` (further picks per Dan's instructions), `spotify_track_id` / `spotify_uri` and the picked track's name/artists/album, `matched`, `match_note`.
- Row-level security is **on with no policies**: only server code using the secret key can read or write. The public catalog reads server-side with explicit public columns (see Catalog); don't add an anon read policy on `posts`.

Schema changes always go through `supabase migration new <name>` + `supabase db push`, committed to git. Never edit tables by hand in the dashboard.

## Platform constraints (as of Sept 2026; re-check docs before building each integration)

- **Spotify**: development mode needs the app owner on Premium (done) and allows max 5 users (only Faery logs in). Observed in dev mode (Oct 2026): `public: false` is silently ignored; `/artists/{id}/albums` caps `limit` at 10; hammering search escalates 429 Retry-After to ~1 hour, which blocks production too (test one post at a time); an account is "generally limited to 11000 playlists". Refresh tokens expire ~6 months after the original login, so re-authorize the Faery account about twice a year and surface a clear error when that happens. Redirect URIs registered: `https://playlistfaery.com/api/spotify/callback` and `http://127.0.0.1:3000/api/spotify/callback` (Spotify rejects "localhost").
- **Threads / Meta**: @playlistfaery was disabled 2026-10-04 (see Sharing). The Meta app "Playlist Faery" still exists only so its privacy policy and data-deletion callbacks (`/api/threads/delete`, `/api/threads/uninstall`, `lib/meta.ts`) keep working; Threads login/posting routes were removed. Findings kept for reference: in dev mode the app only sees accounts that accepted a Threads Tester invite; a Threads link's shortcode does not map to the API media id; replying to others' posts needs threads_manage_mentions (tagged posts) or threads_keyword_search (App Review). Capture no longer reads Threads/Instagram pages (screenshots only since 2026-10-05).
- **X** (Phase 3): replies via the self-serve API only work if the original author @mentioned or quoted the account. Quote-posts are Enterprise-only, so the Faery post links to the original instead. Costs roughly $0.40 per playlist. The account should carry X's "Automated" label.

## Build phases

1. **Phase 1 (current, nearly done)**: email intake → capture → parse → match → approval email → Spotify playlist on approval. No social posting.
2. **Phase 2 (re-scoped Oct 2026)**: make sharing effortless for Dan to do by hand instead of automated Threads posting. Done: share kit (copy-ready reply and announcement, open-post and compose links), public catalog page, privacy/terms pages, Meta data-deletion and deauthorize callbacks.
3. **Phase 3**: X sharing; given the Meta experience, prefer Dan-posted (e.g. X compose/reply intents) over API automation unless Dan decides otherwise.
4. **Phase 4**: Amazon Music, then Apple Music / YouTube Music. (Instagram as a source was pulled forward and works since Oct 2026.)

Phase 1 checklist (status as of 2026-10-02):
- [x] Posts table and statuses
- [x] Inbound email handler (`add@in.playlistfaery.com`, sender allowlist, DMARC)
- [x] Post capture: Threads, X, Instagram links and screenshots
- [x] Claude parsing prompt and output schema (incl. theme-aware suggested songs)
- [x] Spotify matching and pick rules (short-name fallback, pacing, rate-limit waits)
- [x] Playlist creation with credit and unmatched notes (after approval; `@handle - mm/dd/yy - title`)
- [x] Approval email with Approve/Reject (two taps by design, see step 5)
- [x] Scheduled function advancing statuses (daily cron + sweep on each forward), history and failure alerts
- [ ] Test on ~10 real posts of each input type (33 posts so far: 10 song lists, 8 artist lists, 5 album lists; sources 16 Threads, 2 X, 4 screenshots, 3 Instagram links since support plus 7 before it; 21 built. Still thin on X, albums and shared playlist links)

Extras built ahead of plan: public catalog homepage, Instagram source, playlist-cap counter.
Known gaps: recreating shared playlist links (recorded as unmatched); carousels/reels need a screenshot; X posts whose list is only in an attached image.

## Conventions

- TypeScript everywhere; server logic in Route Handlers under `app/api/...` and shared modules under `lib/...` (no `src/` folder).
- Every step is **idempotent**: safe to re-run on the same post without creating duplicate playlists, emails or replies. Check status and stored IDs before acting.
- Verify webhook signatures (Resend) and protect cron routes with `CRON_SECRET`.
- Keep third-party calls behind small wrapper modules (`lib/spotify.ts`, `lib/claude.ts`, `lib/resend.ts`, `lib/threads.ts`) so they're easy to test and swap.
- Run `npm run build` and `npm run lint` before committing. Small commits with clear messages; push to `main` deploys to production.
- Nothing posts publicly without an `approved` status set by Dan's approval link. Spotify playlists are only created after approval (step 6).
