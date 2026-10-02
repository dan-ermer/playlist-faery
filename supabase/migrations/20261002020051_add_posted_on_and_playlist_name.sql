-- posted_on: the date the original post was published, when we can tell
-- (Threads embed page, X oEmbed, or a date visible in a screenshot).
-- playlist_name: the exact Spotify playlist name Build used,
-- "@handle - mm/dd/yy - title".
alter table public.posts
  add column posted_on date,
  add column playlist_name text;
