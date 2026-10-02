-- For artist-only items: songs Claude suggested at Parse time that fit the
-- post's theme and the pick rules. Match searches for them on Spotify and
-- adds them to the candidates.
alter table public.post_items add column suggested_titles text[];
