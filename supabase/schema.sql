-- StudyDeck auth feature — Phase 1 schema + Row Level Security.
-- Paste this whole file into the Supabase dashboard's SQL Editor and run it
-- once. Safe to re-run (uses IF NOT EXISTS / DROP POLICY IF EXISTS guards).
--
-- Source of truth: docs/auth/design-doc.md "Data Model". Do not hand-edit the
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
-- this file — see docs/auth/design-doc.md "Row Level Security is not optional."

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

-- ---------------------------------------------------------------------------
-- Sharing (docs/sharing/design-doc.md)
-- ---------------------------------------------------------------------------
-- A share is a SNAPSHOT of a deck stored exactly once, addressed by an
-- unguessable token that lives in the link. Recipients' library rows POINT at
-- that snapshot (decks.share_token) instead of storing the payload again, so
-- fifty recipients cost one payload row, not fifty.

create table if not exists shared_decks (
  id uuid primary key default gen_random_uuid(),
  -- The capability in the URL: studydeck.brookslanding.com/?s=<token>.
  token text unique not null,
  owner_id uuid references auth.users not null,
  title text not null,
  question_count int not null,
  -- Canonical hash of `data` (src/lib/deckIdentity.ts deckHash). Two things
  -- key off it: re-sharing the same deck returns the SAME token instead of
  -- minting a second snapshot, and a recipient who already imported the same
  -- deck by file is recognized as already having it.
  content_hash text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  unique (owner_id, content_hash)
);

-- A library row is now EITHER self-contained (data) or a pointer at a share
-- (share_token) — never both. Guarded so the whole file stays re-runnable.
alter table decks alter column data drop not null;
alter table decks add column if not exists share_token text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'decks_share_token_fkey'
  ) then
    alter table decks
      add constraint decks_share_token_fkey
      foreign key (share_token) references shared_decks (token);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'decks_payload_present'
  ) then
    alter table decks
      add constraint decks_payload_present
      check (data is not null or share_token is not null);
  end if;
end $$;

alter table shared_decks enable row level security;

-- Deliberately NO blanket public select. A `using (true)` policy would let
-- anyone holding the (public, browser-shipped) anon key list every shared deck
-- on the service. Reads by token go through get_shared_deck() below instead,
-- which answers only for an exact token — a capability, not a directory.
drop policy if exists "shared_decks_select_visible" on shared_decks;
create policy "shared_decks_select_visible" on shared_decks
  for select using (
    owner_id = auth.uid()
    or exists (
      select 1 from decks d
      where d.share_token = shared_decks.token and d.user_id = auth.uid()
    )
  );

drop policy if exists "shared_decks_delete_own" on shared_decks;
create policy "shared_decks_delete_own" on shared_decks
  for delete using (owner_id = auth.uid());

-- Read one share by token. SECURITY DEFINER so a logged-OUT recipient can
-- resolve a link (adding works signed out); the exact-token match is what
-- keeps it from becoming an enumeration endpoint.
create or replace function get_shared_deck(p_token text)
returns table (token text, title text, question_count int, content_hash text, data jsonb)
language sql
security definer
stable
set search_path = public
as $$
  select s.token, s.title, s.question_count, s.content_hash, s.data
  from shared_decks s
  where s.token = p_token
  limit 1;
$$;

-- Publish a deck, or return the token it already has. SECURITY DEFINER for the
-- token-uniqueness loop; the auth.uid() guard is what replaces the RLS check
-- that definer rights bypass. Creating a link requires a login (Davis,
-- 2026-08-19) — no anonymous write path into this table exists.
create or replace function create_share(
  p_title text,
  p_question_count int,
  p_hash text,
  p_data jsonb
)
returns text
language plpgsql
security definer
-- `extensions` is on the path deliberately: gen_random_bytes() below comes
-- from pgcrypto, which Supabase installs there, and a definer function pins
-- its own search_path — leave it off and every share attempt fails with
-- "function gen_random_bytes(integer) does not exist".
set search_path = public, extensions
as $$
declare
  v_token text;
  v_count int;
begin
  if auth.uid() is null then
    raise exception 'Sign in to create a share link.';
  end if;
  -- 2MB ceiling: the anon key is public, so this is the one write path an
  -- abuser could aim volume at. Real decks are a few hundred KB at worst.
  if pg_column_size(p_data) > 2000000 then
    raise exception 'Study set is too large to share.';
  end if;

  select s.token into v_token
  from shared_decks s
  where s.owner_id = auth.uid() and s.content_hash = p_hash;
  if v_token is not null then
    return v_token;
  end if;

  select count(*) into v_count from shared_decks s where s.owner_id = auth.uid();
  if v_count >= 100 then
    raise exception 'Share limit reached (100 study sets). Remove a shared set first.';
  end if;

  loop
    -- 9 random bytes -> 12 URL-safe base64 chars. Unguessable, and short
    -- enough that the link survives a text message unbroken.
    v_token := translate(encode(gen_random_bytes(9), 'base64'), '+/', '-_');
    exit when not exists (select 1 from shared_decks s where s.token = v_token);
  end loop;

  insert into shared_decks (token, owner_id, title, question_count, content_hash, data)
  values (v_token, auth.uid(), p_title, p_question_count, p_hash, p_data);
  return v_token;
end;
$$;

grant execute on function get_shared_deck(text) to anon, authenticated;
revoke execute on function create_share(text, int, text, jsonb) from public;
grant execute on function create_share(text, int, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Per-account ceilings
-- ---------------------------------------------------------------------------
-- 100 study sets per account. MIRRORED IN `src/lib/Storage.ts` (MAX_DECKS) and
-- in create_share() above; this copy is the one that binds, because the anon
-- key ships in the browser bundle and anything enforced only in TypeScript is
-- a suggestion to whoever opens devtools.
--
-- The cap is on ADDING a deck, never on updating one already held: an account
-- sitting at the limit must still be able to open its decks (every open
-- rewrites the row's last_opened) and sync them.
create or replace function enforce_deck_limits()
returns trigger
language plpgsql
security definer
-- Definer so the count is authoritative rather than whatever RLS lets the
-- caller see, and pinned so the body can't be redirected at objects someone
-- else created — the same hardening the two share functions get.
set search_path = public
as $$
declare
  v_count int;
begin
  -- Also the only size ceiling on a deck row: create_share guards the shared
  -- snapshot, but nothing guarded what a client could upsert into its own
  -- library. Null on a row that points at a share, which is why this is
  -- guarded rather than compared directly.
  if new.data is not null and pg_column_size(new.data) > 2000000 then
    raise exception 'Study set is too large to save to your account.';
  end if;

  -- An upsert fires this trigger as an INSERT even when it will resolve to an
  -- update, so "is there already a row under this title?" — not TG_OP alone —
  -- is what separates adding from replacing. Without that test, an account at
  -- exactly the limit could no longer open any of its own decks.
  if tg_op = 'INSERT' and not exists (
    select 1 from decks d where d.user_id = new.user_id and d.title = new.title
  ) then
    select count(*) into v_count from decks d where d.user_id = new.user_id;
    if v_count >= 100 then
      raise exception 'Study set limit reached (100). Remove one to add another.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists decks_enforce_limits on decks;
create trigger decks_enforce_limits
  before insert or update on decks
  for each row execute function enforce_deck_limits();
