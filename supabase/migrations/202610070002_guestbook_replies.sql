-- Run AFTER 202610070001_guestbook.sql. Existing guestbook messages are preserved.
begin;
create table if not exists public.guestbook_replies (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.guestbook_entries(id) on delete cascade,
  parent_id uuid,
  author text not null check (char_length(btrim(author)) between 1 and 30),
  message text not null check (char_length(btrim(message)) between 1 and 500),
  created_at timestamptz not null default now(),
  unique (entry_id, id),
  check (parent_id is null or parent_id <> id),
  foreign key (entry_id, parent_id) references public.guestbook_replies(entry_id, id) on delete cascade
);
create index if not exists guestbook_replies_thread on public.guestbook_replies(entry_id, created_at, id);
alter table public.guestbook_replies enable row level security;
revoke all on public.guestbook_replies from public, anon, authenticated;
grant select on public.guestbook_replies to anon, authenticated;
grant insert (id, entry_id, parent_id, author, message) on public.guestbook_replies to anon, authenticated;
drop policy if exists replies_public_read on public.guestbook_replies;
create policy replies_public_read on public.guestbook_replies for select to anon, authenticated using (true);
drop policy if exists replies_public_write on public.guestbook_replies;
create policy replies_public_write on public.guestbook_replies for insert to anon, authenticated
  with check (char_length(btrim(author)) between 1 and 30 and char_length(btrim(message)) between 1 and 500);
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
    and schemaname = 'public' and tablename = 'guestbook_replies') then
    alter publication supabase_realtime add table public.guestbook_replies;
  end if;
end $$;
commit;
