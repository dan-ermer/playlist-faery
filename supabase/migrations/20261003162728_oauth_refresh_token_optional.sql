-- Threads has no separate refresh token: its 60-day access token is renewed
-- itself. So refresh_token is only set for providers that have one (Spotify).
alter table public.oauth_tokens alter column refresh_token drop not null;
