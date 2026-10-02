-- History of everything that happens to a post, so stalls and failures can be
-- explained later (Vercel Hobby keeps function logs for only about an hour).
-- A "started" event with no outcome after it means the step was cut off.
create table public.post_events (
  id bigint generated always as identity primary key,
  post_id uuid not null references public.posts (id) on delete cascade,
  at timestamptz not null default now(),
  step text not null,          -- capture, parse, match, approval-email, build, sweep, decision, intake
  kind text not null check (kind in ('received', 'started', 'advanced', 'retry', 'waiting', 'failed', 'claimed', 'approved', 'rejected')),
  from_status public.post_status,
  to_status public.post_status,
  message text,
  duration_ms integer
);

create index post_events_post_id_at_idx on public.post_events (post_id, at);

alter table public.post_events enable row level security;
