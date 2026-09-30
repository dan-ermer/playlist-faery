-- Posts forwarded by Dan, and the songs/artists/albums parsed out of them.
-- Row-level security is on with no policies: only server code using the
-- secret key can read or write. A narrow read policy for the public
-- catalog comes later (Phase 2).

-- Pipeline status, in order. `rejected` and `failed` are off-ramps.
create type public.post_status as enum (
  'received',
  'captured',
  'parsed',
  'matched',
  'awaiting_approval',
  'approved',
  'published',
  'rejected',
  'failed'
);

-- Keeps updated_at current on every row change.
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  status public.post_status not null default 'received',

  -- Intake (the forwarded email). Unique so a re-delivered webhook is a no-op.
  intake_message_id text unique,
  intake_from text,
  intake_subject text,

  -- Source post. source_url is unique so the same post isn't processed twice;
  -- it can be null when Dan forwards only a screenshot.
  source_platform text check (source_platform in ('threads', 'x', 'other')),
  source_url text unique,
  author_handle text,
  post_text text,
  screenshot_path text,

  -- Parsing
  list_type text check (list_type in ('artist_songs', 'artists', 'artist_albums', 'playlist_link')),
  playlist_title text,

  -- Spotify
  spotify_playlist_id text,
  spotify_playlist_url text,

  -- Approval. The token goes in the one-tap Approve link (64 random hex chars).
  approval_token text not null unique
    default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  approved_at timestamptz,

  -- Distribution (Phase 2+)
  reply_url text,
  faery_post_url text,

  -- Retries
  error text,
  attempts integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The scheduled function looks up rows by status.
create index posts_status_idx on public.posts (status);

create trigger posts_set_updated_at
  before update on public.posts
  for each row execute function public.set_updated_at();

create table public.post_items (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  position integer not null,

  -- Exactly as written in the post, plus what Claude parsed out of it.
  raw_text text not null,
  artist text,
  title text,
  album text,

  -- Spotify match. Unmatched items stay here with a note, never dropped.
  spotify_track_id text,
  spotify_uri text,
  matched boolean not null default false,
  match_note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One item per position, so re-running the parse step can't duplicate items.
  unique (post_id, position)
);

create trigger post_items_set_updated_at
  before update on public.post_items
  for each row execute function public.set_updated_at();

alter table public.posts enable row level security;
alter table public.post_items enable row level security;
