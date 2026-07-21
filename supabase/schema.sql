-- StudyDeck auth feature — Phase 1 schema + Row Level Security.
-- Paste this whole file into the Supabase dashboard's SQL Editor and run it
-- once. Safe to re-run (uses IF NOT EXISTS / DROP POLICY IF EXISTS guards).
--
-- Source of truth: design-doc-auth.md "Data Model". Do not hand-edit the
-- table shapes without updating that doc too.

create table if not exists decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  title text not null,
  question_count int not null,
  last_opened timestamptz not null default now(),
  data jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, title)
);

create table if not exists flash_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  deck_title text not null,
  known jsonb not null default '[]',
  learning jsonb not null default '[]',
  updated_at timestamptz not null default now(),
  unique (user_id, deck_title)
);

alter table decks enable row level security;
alter table flash_state enable row level security;

-- RLS is the ONLY thing stopping the browser's public anon key from reading
-- or writing every user's rows. This is the single most important part of
-- this file — see design-doc-auth.md "Row Level Security is not optional."

drop policy if exists "decks_select_own" on decks;
create policy "decks_select_own" on decks
  for select using (user_id = auth.uid());

drop policy if exists "decks_insert_own" on decks;
create policy "decks_insert_own" on decks
  for insert with check (user_id = auth.uid());

drop policy if exists "decks_update_own" on decks;
create policy "decks_update_own" on decks
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "decks_delete_own" on decks;
create policy "decks_delete_own" on decks
  for delete using (user_id = auth.uid());

drop policy if exists "flash_state_select_own" on flash_state;
create policy "flash_state_select_own" on flash_state
  for select using (user_id = auth.uid());

drop policy if exists "flash_state_insert_own" on flash_state;
create policy "flash_state_insert_own" on flash_state
  for insert with check (user_id = auth.uid());

drop policy if exists "flash_state_update_own" on flash_state;
create policy "flash_state_update_own" on flash_state
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "flash_state_delete_own" on flash_state;
create policy "flash_state_delete_own" on flash_state
  for delete using (user_id = auth.uid());
