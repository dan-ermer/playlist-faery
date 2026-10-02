# Playlist Faery

Frees playlists stuck inside social media posts: forward a Threads, X or Instagram post (or a screenshot) to the intake address, approve the result by email, and it becomes a Spotify playlist that credits the poster and appears on [playlistfaery.com](https://playlistfaery.com).

How it works, the rules, the stack and the current status are all in [CLAUDE.md](CLAUDE.md).

## Running locally

```bash
vercel env pull --environment=production .env.local   # then paste any [SENSITIVE] values by hand
npm install
npm run dev -- -H 127.0.0.1                            # Spotify login callbacks need 127.0.0.1, not localhost
```

Before committing: `npm run lint && npm run build`. Pushing to `main` deploys to production.
