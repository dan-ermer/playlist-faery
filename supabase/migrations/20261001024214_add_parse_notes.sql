-- Claude's doubts about specific items (ambiguous or obscure entries),
-- shown to Dan in the approval email.
alter table public.posts add column parse_notes text;
