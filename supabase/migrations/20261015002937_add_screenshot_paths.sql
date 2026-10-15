-- All screenshots Dan attached, in email order (a long list scrolled across
-- several screenshots, or carousel slides). screenshot_path keeps the first.
alter table public.posts add column screenshot_paths text[];
