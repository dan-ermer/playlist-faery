-- Instagram becomes a supported source (pulled forward from Phase 4).
alter table public.posts
  drop constraint posts_source_platform_check,
  add constraint posts_source_platform_check
    check (source_platform in ('threads', 'x', 'instagram', 'other'));

-- The post's own picture (e.g. Instagram og:image), read by Claude at Parse
-- when Dan didn't attach a screenshot. These URLs are signed and expire, so
-- they're only good for the minutes between Capture and Parse.
alter table public.posts add column post_image_url text;
