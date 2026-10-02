-- Build now runs after approval (approved -> built). Posts approved under the
-- old flow already have their playlist, so mark them built; otherwise the
-- sweep would try to build them again.
update public.posts
set status = 'built'
where status = 'approved'
  and spotify_playlist_id is not null;
