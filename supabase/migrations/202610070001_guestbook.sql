-- Run once in your Supabase project's SQL Editor. Safe to rerun for this schema.
begin;

create table if not exists public.guestbook_entries (
  id uuid primary key default gen_random_uuid(),
  author text not null check (char_length(btrim(author)) between 1 and 30),
  message text not null check (char_length(btrim(message)) between 1 and 500),
  color text not null default 'butter' check (color in ('butter', 'rose', 'mint', 'sky', 'lavender')),
  created_at timestamptz not null default now()
);
create index if not exists guestbook_entries_newest on public.guestbook_entries (created_at desc, id desc);
alter table public.guestbook_entries enable row level security;

-- Visitors may read/write messages, but cannot update or delete anyone's posts.
revoke all on public.guestbook_entries from public, anon, authenticated;
grant usage on schema public to anon, authenticated;
grant select on public.guestbook_entries to anon, authenticated;
grant insert (id, author, message, color) on public.guestbook_entries to anon, authenticated;
drop policy if exists guestbook_public_read on public.guestbook_entries;
create policy guestbook_public_read on public.guestbook_entries for select to anon, authenticated using (true);
drop policy if exists guestbook_public_write on public.guestbook_entries;
create policy guestbook_public_write on public.guestbook_entries for insert to anon, authenticated
  with check (char_length(btrim(author)) between 1 and 30 and char_length(btrim(message)) between 1 and 500);

-- Include this table in the Realtime publication without duplicating it on rerun.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
    and schemaname = 'public' and tablename = 'guestbook_entries') then
    alter publication supabase_realtime add table public.guestbook_entries;
  end if;
end $$;
commit;
