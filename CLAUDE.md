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
Intake → Capture → Parse → Match → Build playlist → Approval email → (Dan approves) → Distribute → Catalog

Statuses: received → captured → parsed → matched → built → awaiting_approval → approved → published
```

1. **Intake**: Dan shares a post link (or a screenshot) from his phone to the intake email address. Resend receives it and calls our webhook (`/api/inbound/resend`, event `email.received`). Only senders in `ALLOWED_SENDERS` are processed; others are logged and ignored.
2. **Capture**: require DMARC pass on the forwarded email, then pull the post text (Threads: public post page og: tags; X: free oEmbed at publish.x.com, no API key). Screenshots stay in Resend; `screenshot_path` is `resend:<email_id>/<attachment_id>`. Instagram links need a screenshot until Phase 4. Runs from the webhook via `after()`; temporary errors retry up to 3 times. If an image holds the list, Claude vision reads it at Parse.
3. **Parse**: Claude API (`claude-opus-5-5`, `messages.parse` + Zod schema in `lib/parse.ts`) returns structured data: list type, items (artist/title/album, `raw_text` verbatim), poster handle (screenshots only), suggested playlist title. Posters write both "Artist - Song" and "Song - Artist"; Claude decides which is which. A shared playlist becomes one item holding its link.
4. **Match** (`lib/match.ts`): code gathers Spotify candidates per item (songs: field-filtered track search, plain-text fallback; artists: two pages of `artist:` track search; albums: album search + tracklist of the top two versions), then one Claude call per post picks a candidate per item using the pick rules, or null with a `match_note`. Search uses the app's client-credentials token (`lib/spotify.ts`); no user login needed. Dev-mode limits (Feb 2026): no top-tracks endpoint, no popularity/genres, search max 10 per call. Playlist-link items are recorded as unmatched until recreating playlists is built.
5. **Build** (`lib/build.ts`): create a **private** playlist on the Faery Spotify account (`POST /me/playlists`) with a credit line in the description, save its id/URL immediately (so retries reuse it), then set its tracks (`PUT /playlists/{id}/items`). It becomes public only after approval. The Faery account's login is stored in `oauth_tokens` via `/api/spotify/login` → `/api/spotify/callback`; once stored, logins from other Spotify accounts are refused. If the login is missing or expired, steps throw `WaitError`: the post waits with a re-login message and the attempt isn't counted.
6. **Approve**: email Dan the tracklist, unmatched items and playlist link, with a one-tap Approve link (`/api/approve?token=...`, using `posts.approval_token`).
7. **Distribute** (Phase 2+): reply to the original post with the link, and publish a Faery post linking back. Both credit the poster.
8. **Catalog** (Phase 2): the public page on playlistfaery.com lists every published playlist.

Every post's status is recorded at each step, so nothing stalls unnoticed. `lib/pipeline.ts` `advancePost()` runs the automatic steps in order; each step uses `runStep()` (`lib/step.ts`), which guards on status, resets `attempts` on success, and marks the post `failed` after 3 temporary errors or one `PermanentError`. A scheduled function (Vercel Cron) advances rows between statuses and retries failures. There's no separate workflow engine.

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

Stored in Vercel (Production, Preview, Development). Pull locally with `vercel env pull .env.local`. **Never commit `.env*` files and never hard-code keys.**

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: safe for the browser
- `SUPABASE_SECRET_KEY`: full database access; **server-only**, never import into client components
- `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`
- `ALLOWED_SENDERS`: comma-separated addresses whose forwards are processed
- `ANTHROPIC_API_KEY`
- `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`
- `THREADS_APP_ID`, `THREADS_APP_SECRET`
- Not yet created: X API keys (Phase 3), `CRON_SECRET`, Threads stored tokens. (Spotify's stored login lives in the `oauth_tokens` table, not an env var.)

If a new secret is needed, tell Dan the variable name and where to get the value; he adds it in Vercel.

## Data model

Proposed first migration (`supabase/migrations/*_create_posts.sql`). Check whether it has been applied before re-creating it.

- `post_status` enum: `received → captured → parsed → matched → built → awaiting_approval → approved → published`, plus `rejected` and `failed`.
- `oauth_tokens`: one row per provider (`spotify` now, `threads` later) with the account id, refresh/access tokens and `authorized_at`.
- `posts`: one row per forwarded post. Includes intake info (`intake_message_id` unique for idempotency), source (`source_platform`, `source_url` unique, `author_handle`, `post_text`, `screenshot_path`), parsing (`list_type`, `playlist_title`), Spotify (`spotify_playlist_id`, `spotify_playlist_url`), approval (`approval_token`, `approved_at`), Claude's doubts from parsing (`parse_notes`), distribution (`reply_url`, `faery_post_url`), and `error` / `attempts` for retries. `updated_at` is set by a trigger.
- `post_items`: one row per song/artist/album, with `raw_text` exactly as written, parsed fields, `spotify_track_id` / `spotify_uri`, `matched`, `match_note`.
- Row-level security is **on with no policies**: only server code using the secret key can read or write. Add a narrow read policy later for the public catalog.

Schema changes always go through `supabase migration new <name>` + `supabase db push`, committed to git. Never edit tables by hand in the dashboard.

## Platform constraints (as of Sept 2026; re-check docs before building each integration)

- **Spotify**: development mode needs the app owner on Premium (done) and allows max 5 users (only Faery logs in). Refresh tokens expire ~6 months after the original login, so re-authorize the Faery account about twice a year and surface a clear error when that happens. Redirect URIs registered: `https://playlistfaery.com/api/spotify/callback` and `http://127.0.0.1:3000/api/spotify/callback` (Spotify rejects "localhost").
- **Threads**: Meta app "Playlist Faery" created with threads_basic, threads_content_publish, threads_manage_replies, threads_read_replies and threads_manage_mentions. playlistfaery is a Threads Tester. Replying to *other people's* posts requires threads_manage_mentions or threads_keyword_search and may need Meta App Review; verify when building Phase 2. Callback URLs registered: `/api/threads/callback`, `/api/threads/uninstall`, `/api/threads/delete`. Limit: 1,000 API replies per 24h.
- **X** (Phase 3): replies via the self-serve API only work if the original author @mentioned or quoted the account. Quote-posts are Enterprise-only, so the Faery post links to the original instead. Costs roughly $0.40 per playlist. The account should carry X's "Automated" label.

## Build phases

1. **Phase 1 (current)**: email intake → capture → parse → Spotify playlist → approval email. No social posting.
2. **Phase 2**: Threads reply + Faery post; public catalog page; privacy/terms pages; Faery bio encouraging @mentions.
3. **Phase 3**: X posting (replies for mention-sourced posts only).
4. **Phase 4**: Amazon Music, then Apple Music / YouTube Music; Instagram as a source.

Phase 1 checklist: posts table and statuses → inbound email handler → post capture (X/Threads links + screenshots) → Claude parsing prompt and output schema → Spotify matching and pick rules → playlist creation with credit and unmatched notes → approval email with one-tap Approve → scheduled function advancing statuses → test on ~10 real posts of each input type.

## Conventions

- TypeScript everywhere; server logic in Route Handlers under `app/api/...` and shared modules under `lib/...` (no `src/` folder).
- Every step is **idempotent**: safe to re-run on the same post without creating duplicate playlists, emails or replies. Check status and stored IDs before acting.
- Verify webhook signatures (Resend) and protect cron routes with `CRON_SECRET`.
- Keep third-party calls behind small wrapper modules (`lib/spotify.ts`, `lib/claude.ts`, `lib/resend.ts`, `lib/threads.ts`) so they're easy to test and swap.
- Run `npm run build` and `npm run lint` before committing. Small commits with clear messages; push to `main` deploys to production.
- Nothing posts publicly without an `approved` status set by Dan's approval link.
