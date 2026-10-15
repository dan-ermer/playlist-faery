-- What Dan typed in the forwarded email ("two per artist", "do the whole
-- album", "only the top 10"). Trusted: it overrides the default pick rules.
alter table public.posts add column instructions text;

-- Further tracks picked for an item when Dan's instructions ask for more than
-- one (e.g. a whole album). Each: {id, uri, name, artists, album}, in order.
-- The first pick stays in the item's spotify_* columns.
alter table public.post_items add column extra_tracks jsonb;
