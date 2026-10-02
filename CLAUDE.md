# Playlist Faery

Playlist Faery frees playlists that are stuck inside social media posts. When someone posts a list of songs, artists or albums on Threads or X, Playlist Faery turns it into a real Spotify playlist, shares it back where people found it, credits the original poster, and adds it to a public catalog at playlistfaery.com.

"Faery" is spelled that way on purpose (old-timey branding). Never "correct" it to "Fairy".

## Owner and how to work with him

- Owner: Dan. Strong on data, forecasting and product; fluent in ML concepts; not a day-to-day software engineer. Explain what you're doing and why in plain language, one step at a time.
- Ask before anything destructive or hard to undo (dropping tables, force-pushing, deleting files, rotating keys, posting publicly).
- Progress is tracked in a to-do doc outside the repo: https://claude.ai/code/artifact/d024028d-ce03-4f45-aa10-fadc7aeb741f
- Full requirements and plan: https://claude.ai/code/artifact/cdfad97e-cead-44e4-beb5-4f49a6f5ae29

## Core rules (from the requirements)

- Two human decisions only: **Dan chooses what goes in** (by forwarding) and **Dan approves before anything is posted publicly**. Everything else is automatic.
- An @mention of Playlist Faery never triggers processing on its own. Only forwarded posts are processed.
- Always credit the original poster by handle, in the playlist description, the reply, and the Faery post.
- Input types and track-pick rules:
  - Artist + song pairs (most common): match each song.
  - Artists only: one popular track per artist.
  - Artists + albums: one standout track per album.
  - Existing playlist link (edge case): recreate it on Spotify.
  - Picks should be representative but a little unpredictable, not always the #1 hit. Never whole albums or discographies.
- Unmatched items are recorded on the post's record (not silently dropped) for reporting or fixing later.
- Low overhead for Dan: self-contained, automatic, few moving parts.

## Pipeline

```
Intake → Capture → Parse → Match → Approval email → (Dan approves) → Build playlist → Distribute → Catalog

Statuses: received → captured → parsed → matched → awaiting_approval → approved → built → published
```

1. **Intake**: Dan shares a post link (or a screenshot) from his phone to the intake email address. Resend receives it and calls our webhook (`/api/inbound/resend`, event `email.received`). Only senders in `ALLOWED_SENDERS` are processed; others are logged and ignored.
2. **Capture**: require DMARC pass on the forwarded email, then pull the post text (Threads: public post page og: tags; X: free oEmbed at publish.x.com, no API key; Instagram: public post page og: tags, whose `og:description` holds handle, date and caption, plus the post's picture saved as `post_image_url` because the list is usually in it: the largest image from the post's `/embed/` page (uncropped, up to ~1700px), falling back to `og:image`, which is a 640px square crop that cuts off long lists). Screenshots stay in Resend; `screenshot_path` is `resend:<email_id>/<attachment_id>`. Instagram links work without a screenshot (pulled forward from Phase 4, Oct 2026), except when the list isn't on the first image (carousels give only the first slide; reels give only the cover frame); then Dan attaches a screenshot, which takes priority over `post_image_url`. If Instagram blocks the page and a screenshot is attached, Capture continues with the screenshot. Meta's terms restrict automated collection and it may block us; Dan accepted that risk. The post date goes in `posted_on`: Threads from the post's `/embed` page ("9:11 AM · Sep 30, 2026"; the main page has no date), X from the oEmbed blockquote, screenshots from Parse when a full date is visible. Runs from the webhook via `after()`; temporary errors retry up to 3 times. If an image holds the list, Claude vision reads it at Parse.
3. **Parse**: Claude API (`claude-opus-5-5`, `messages.parse` + Zod schema in `lib/parse.ts`) returns structured data: list type, items (artist/title/album, `raw_text` verbatim), poster handle, post date and app (screenshots only), suggested playlist title. Reads the screenshot if Dan attached one, else the post's own image (`post_image_url`). Posters write both "Artist - Song" and "Song - Artist"; Claude decides which is which. A shared playlist becomes one item holding its link.
4. **Match** (`lib/match.ts`): code gathers Spotify candidates per item (songs: field-filtered track search, plain-text fallback; artists: searches for the 3 `suggested_titles` Parse proposed for the post's theme, then `artist:` track search only if those didn't find the artist, then an artist-first fallback (exact-name artist search → a compilation, earliest and latest album) for short/common names like Sloan or James; albums: album search + tracklist of the top two versions), then one Claude call per post, given the post's text and title, picks a candidate per item using the pick rules and the post's theme (e.g. a vocalists list → songs that person sings lead on), or null with a `match_note`. Spotify calls are paced (~8/s); a short 429 is retried in place, a long one (Spotify escalates to ~1 hour when hammered) throws `WaitError` so posts wait instead of failing. Dev mode caps `/artists/{id}/albums` at limit 10 (undocumented). Search uses the app's client-credentials token (`lib/spotify.ts`); no user login needed. Dev-mode limits (Feb 2026): no top-tracks endpoint, no popularity/genres, search max 10 per call. Playlist-link items are recorded as unmatched until recreating playlists is built.
5. **Approve** (`lib/approval.ts`): right after Match (`matched → awaiting_approval`), email the forwarding address the tracklist (each track linked), unmatched items, Claude's notes and a playlist counter ("Faery playlists so far: N of about 11,000"), with Approve/Reject links (`/api/approve?token=...`, `/api/reject?token=...`, using `posts.approval_token`). The link opens a confirmation page and only its button (POST) acts, because email link scanners open links. Resend idempotency keys prevent duplicate emails.
6. **Build** (`lib/build.ts`, `approved → built`): runs only after Dan approves. The approve page starts it straight away and shows the playlist link; if Spotify is unavailable the post stays `approved` and the sweep builds it later. Creates a **public** playlist on the Faery Spotify account (`POST /me/playlists`), named `@handle - mm/dd/yy - title` (handle omitted if unknown; date is `posted_on`, else the build date in US Eastern) and saved to `posts.playlist_name`, with a credit line in the description; saves its id/URL immediately (so retries reuse it), then sets its tracks (`PUT /playlists/{id}/items`). Spotify silently ignores `public: false` from this app (dev mode, observed Oct 2026), which is one reason Build moved after approval. The Faery account's login is stored in `oauth_tokens` via `/api/spotify/login` → `/api/spotify/callback`; once stored, logins from other Spotify accounts are refused. If the login is missing or expired, steps throw `WaitError`: the post waits with a re-login message and the attempt isn't counted.
   **Playlist cap:** Spotify docs say an account is "generally limited to a maximum of 11000 playlists" (what counts, e.g. deleted or followed playlists, is undocumented). `lib/limits.ts` counts playlists Faery created (posts with `spotify_playlist_id`); the daily cron emails the first `ALLOWED_SENDERS` address once past 9,000. Plan when that fires: overflow to a second Faery Spotify account (dev mode allows 5 users).
7. **Distribute** (Phase 2+): reply to the original post with the link, and publish a Faery post linking back. Both credit the poster.
8. **Catalog** (built Oct 2026, ahead of Phase 2): the homepage (`app/page.tsx`, data from `lib/catalog.ts`) lists every playlist that exists (status `built` or `published`), newest first, with title, credited handle linking to the original post, date, track count, a few artists and a Spotify link. It renders per request (`await connection()`; this Next.js version dropped `export const revalidate` outside Cache Components, which we haven't enabled) and reads with the secret key on the server, selecting only public columns. That's deliberately instead of an RLS read policy: policies are row-level, so a policy on `posts` would expose `intake_from` and `approval_token` to the publishable key. Look: IM Fell English for display type, warm paper palette with dark mode (`app/globals.css`).

Every post's status is recorded at each step, so nothing stalls unnoticed. Each step run is also logged to `post_events` (`lib/events.ts`): `started` then `advanced` / `retry` / `waiting` / `failed`, with message and duration, plus intake `received`, sweep `claimed` and Dan's `approved` / `rejected`. A `started` with no outcome means the step was cut off (Vercel Hobby keeps function logs only ~1 hour, so this table is the record). When a post becomes `failed`, `lib/alerts.ts` emails the forwarding address the reason, a what-to-do hint and the post's history (once per post); the daily cron also emails a digest of posts stuck over an hour in an automatic status (nothing sent when none). `lib/pipeline.ts` `advancePost()` runs the automatic steps in order; each step uses `runStep()` (`lib/step.ts`), which guards on status, resets `attempts` on success, and marks the post `failed` after 3 temporary errors or one `PermanentError`. A scheduled function (Vercel Cron) advances rows between statuses and retries failures. There's no separate workflow engine. The Vercel account is on **Hobby**, which allows crons only once a day, so `/api/cron/advance` runs daily (`vercel.json`, 14:00 UTC, protected by `CRON_SECRET`) and every accepted inbound email also calls `advanceStalePosts()` after its own post. The sweep only touches posts in an automatic status untouched for 10+ minutes and claims each with an `updated_at` compare-and-set, so it never runs Build twice on the same post. Upgrading to Pro would allow a `*/5 * * * *` schedule.

## Stack

| Piece | Choice |
|---|---|
| App / API routes / cron | Next.js (App Router, TypeScript, Tailwind) on Vercel. Auto-deploys on push to `main`. |
| Database | Supabase Postgres (project linked via `supabase link`; region US East) |
| Inbound + outbound email | Resend (sending on playlistfaery.com; receiving on the `in.playlistfaery.com` subdomain) |
| Parsing / picks | Claude API via `@anthropic-ai/sdk`, structured output with a JSON schema / tool use |
| Playlists | Spotify Web API, logged in as the Playlist Faery Spotify account (Premium) |
| Social | Threads API (Phase 2), X API (Phase 3, pay-per-use) |
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
- Not yet created: X API keys (Phase 3), Threads stored tokens. (Spotify's stored login lives in the `oauth_tokens` table, not an env var.)

If a new secret is needed, tell Dan the variable name and where to get the value; he adds it in Vercel.

## Data model

All migrations live in `supabase/migrations/` and are applied (check with `supabase migration list`). Run CLI commands with `< /dev/null`: `supabase migration new` otherwise waits for SQL on stdin.

- `post_status` enum values: `received, captured, parsed, matched, built, awaiting_approval, approved, published, rejected, failed`. The enum's declared order is historical; the flow is `matched → awaiting_approval → approved → built → published` (Build moved after approval in Oct 2026). Nothing compares statuses by order.
- `post_events`: append-only history per post (`step`, `kind`, `from_status`/`to_status`, `message`, `duration_ms`); RLS on, no policies.
- `oauth_tokens`: one row per provider (`spotify` now, `threads` later) with the account id, refresh/access tokens and `authorized_at`.
- `posts`: one row per forwarded post. Includes intake info (`intake_message_id` unique for idempotency), source (`source_platform` threads/x/instagram/other, `source_url` unique, `author_handle`, `post_text`, `screenshot_path`, `post_image_url`), parsing (`list_type`, `playlist_title`, `posted_on`), the final Spotify name (`playlist_name`), Spotify (`spotify_playlist_id`, `spotify_playlist_url`), approval (`approval_token`, `approved_at`), Claude's doubts from parsing (`parse_notes`), distribution (`reply_url`, `faery_post_url`), and `error` / `attempts` for retries. `updated_at` is set by a trigger.
- `post_items`: one row per song/artist/album, with `raw_text` exactly as written, parsed fields, `suggested_titles` (artist-only items), `spotify_track_id` / `spotify_uri` and the picked track's name/artists/album, `matched`, `match_note`.
- Row-level security is **on with no policies**: only server code using the secret key can read or write. The public catalog reads server-side with explicit public columns (see Catalog); don't add an anon read policy on `posts`.

Schema changes always go through `supabase migration new <name>` + `supabase db push`, committed to git. Never edit tables by hand in the dashboard.

## Platform constraints (as of Sept 2026; re-check docs before building each integration)

- **Spotify**: development mode needs the app owner on Premium (done) and allows max 5 users (only Faery logs in). Observed in dev mode (Oct 2026): `public: false` is silently ignored; `/artists/{id}/albums` caps `limit` at 10; hammering search escalates 429 Retry-After to ~1 hour, which blocks production too (test one post at a time); an account is "generally limited to 11000 playlists". Refresh tokens expire ~6 months after the original login, so re-authorize the Faery account about twice a year and surface a clear error when that happens. Redirect URIs registered: `https://playlistfaery.com/api/spotify/callback` and `http://127.0.0.1:3000/api/spotify/callback` (Spotify rejects "localhost").
- **Threads**: Meta app "Playlist Faery" created with threads_basic, threads_content_publish, threads_manage_replies, threads_read_replies and threads_manage_mentions. playlistfaery is a Threads Tester. Replying to *other people's* posts requires threads_manage_mentions or threads_keyword_search and may need Meta App Review; verify when building Phase 2. Callback URLs registered: `/api/threads/callback`, `/api/threads/uninstall`, `/api/threads/delete`. Limit: 1,000 API replies per 24h.
- **X** (Phase 3): replies via the self-serve API only work if the original author @mentioned or quoted the account. Quote-posts are Enterprise-only, so the Faery post links to the original instead. Costs roughly $0.40 per playlist. The account should carry X's "Automated" label.

## Build phases

1. **Phase 1 (current, nearly done)**: email intake → capture → parse → match → approval email → Spotify playlist on approval. No social posting.
2. **Phase 2**: Threads reply + Faery post; privacy/terms pages; Faery bio encouraging @mentions. (The public catalog page was pulled forward and is live.)
3. **Phase 3**: X posting (replies for mention-sourced posts only).
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
