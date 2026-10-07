-- Run after 202610070001_guestbook.sql. Preserves existing notes and replies.
begin;
alter table public.guestbook_entries
  add column if not exists minimi_seed integer check (minimi_seed between 0 and 2147483647);
grant insert (minimi_seed) on public.guestbook_entries to anon, authenticated;
commit;
