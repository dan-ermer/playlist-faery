-- 'note': something worth recording that isn't a step outcome
-- (e.g. Distribute skipped the Threads reply because the API can't see the post yet).
alter table public.post_events
  drop constraint post_events_kind_check,
  add constraint post_events_kind_check
    check (kind in ('received', 'started', 'advanced', 'retry', 'waiting', 'failed', 'claimed', 'approved', 'rejected', 'note'));
