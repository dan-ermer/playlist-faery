-- Stored logins for the accounts Playlist Faery acts as (Spotify now, Threads
-- in Phase 2). One row per provider. Row-level security on with no policies:
-- only server code using the secret key can read these.
create table public.oauth_tokens (
  provider text primary key,
  account_id text not null,
  refresh_token text not null,
  access_token text,
  access_expires_at timestamptz,
  scope text,
  -- When the account last logged in; Spotify refresh tokens expire ~6 months after this.
  authorized_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger oauth_tokens_set_updated_at
  before update on public.oauth_tokens
  for each row execute function public.set_updated_at();

alter table public.oauth_tokens enable row level security;

-- New step between matched and awaiting_approval: the Spotify playlist exists.
alter type public.post_status add value 'built' after 'matched';
