-- What the matched Spotify track actually is, saved at Match time so the
-- approval email (and later the catalog) can show it without extra lookups.
alter table public.post_items
  add column spotify_track_name text,
  add column spotify_artists text,
  add column spotify_album text;
