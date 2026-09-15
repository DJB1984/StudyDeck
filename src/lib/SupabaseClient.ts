// SupabaseClient — the ONLY module that imports @supabase/supabase-js or
// holds a reference to a Supabase client instance.
// Storage.ts and the auth UI reach Supabase exclusively through the functions
// exported here, mirroring the "Storage.ts is the only module that touches
// localStorage" rule in the root CLAUDE.md.

import { createClient, type Session } from '@supabase/supabase-js';
import type { HistoryEntry, FlashState } from '../types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

const client =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

if (!client) {
  console.warn(
    'SupabaseClient: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set — login is disabled, app runs in guest-only mode.',
  );
}

// R18: in-memory session, kept current by a single onAuthStateChange
// subscription established once at module load, so Storage.ts can branch on
// auth state synchronously without itself becoming async or touching Supabase.
let currentSession: Session | null = null;
let sessionReady: Promise<void> = Promise.resolve();

if (client) {
  sessionReady = client.auth.getSession().then(({ data }) => {
    currentSession = data.session;
  });
  client.auth.onAuthStateChange((_event, session) => {
    currentSession = session;
  });
}

export function isLoggedIn(): boolean {
  return currentSession !== null;
}

export function getUserId(): string | null {
  return currentSession?.user.id ?? null;
}

export function getUserEmail(): string | null {
  return currentSession?.user.email ?? null;
}

// Resolves once the initial getSession() check has settled, so callers that
// run at startup (e.g. the auth listener wiring in App.tsx) can wait for a
// real answer instead of racing the synchronous isLoggedIn() default of false.
export function ready(): Promise<void> {
  return sessionReady;
}

export function onAuthStateChange(callback: (session: Session | null) => void): () => void {
  if (!client) return () => {};
  const {
    data: { subscription },
  } = client.auth.onAuthStateChange((_event, session) => callback(session));
  return () => subscription.unsubscribe();
}

// Fires only on Supabase's 'SIGNED_IN' event — a real login just completed
// (magic-link redirect landed), not "a session already existed on page
// load" (that's 'INITIAL_SESSION'). This is the exact signal migration.ts
// needs to run once per login.
export function onSignedIn(callback: () => void): () => void {
  if (!client) return () => {};
  const {
    data: { subscription },
  } = client.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN') callback();
  });
  return () => subscription.unsubscribe();
}

export async function signInWithOtp(email: string): Promise<{ error: string | null }> {
  if (!client) return { error: 'Login is not configured for this deployment.' };
  const { error } = await client.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  });
  return { error: error ? error.message : null };
}

export async function signOut(): Promise<void> {
  if (!client) return;
  await client.auth.signOut();
}

// --- decks table -----------------------------------------------------------

interface DeckRow {
  title: string;
  question_count: number;
  last_opened: string;
  /** Null on a row that points at a shared snapshot — see share_token. */
  data: HistoryEntry['data'] | null;
  share_token: string | null;
}

export async function getDecks(): Promise<HistoryEntry[]> {
  if (!client || !currentSession) return [];
  const { data, error } = await client
    .from('decks')
    .select('title, question_count, last_opened, data, share_token')
    .order('last_opened', { ascending: false });
  if (error) {
    console.error('SupabaseClient.getDecks failed', error);
    return [];
  }
  const rows = data as DeckRow[];
  // Rows added from a share link carry a pointer, not a payload — that is what
  // keeps one deck shared with fifty people down to one stored copy. Resolve
  // the pointers in ONE follow-up query rather than a PostgREST embed, so
  // nothing depends on a generated relationship name.
  const snapshots = await resolveSharePayloads(rows);
  const entries: HistoryEntry[] = [];
  for (const row of rows) {
    const snapshot = row.share_token ? snapshots.get(row.share_token) : undefined;
    const deck = row.data ?? snapshot?.data;
    if (!deck) {
      // A pointer whose snapshot is gone (owner deleted it) has no questions to
      // study. Dropping it beats handing the app a deck-shaped hole.
      console.error('SupabaseClient.getDecks: unresolvable deck', row.title);
      continue;
    }
    entries.push({
      name: `${row.title}.json`,
      title: row.title,
      count: row.question_count,
      // HistoryEntry.lastOpened is always a pre-formatted display string
      // elsewhere in the app (HomeScreen's today() uses toLocaleDateString()) —
      // reformat Postgres's raw ISO timestamp to match, or the card shows the
      // raw "2026-07-20T00:00:00+00:00" string until the deck is opened once.
      lastOpened: new Date(row.last_opened).toLocaleDateString(),
      shareToken: row.share_token ?? undefined,
      // owner_id on the snapshot is the real authority on "is this mine?" — the
      // token alone is stamped on the publisher's deck and on every copy made
      // from it. A login is therefore what corrects a local guess, in either
      // direction. Left undefined when the snapshot didn't resolve, so a failed
      // lookup can't demote an owner's own deck to a read-only copy.
      shareOwner: snapshot ? snapshot.ownerId === currentSession.user.id : undefined,
      data: deck,
    });
  }
  return entries;
}

interface Snapshot {
  data: HistoryEntry['data'];
  ownerId: string;
}

async function resolveSharePayloads(rows: DeckRow[]): Promise<Map<string, Snapshot>> {
  const out = new Map<string, Snapshot>();
  const tokens = rows.filter((r) => !r.data && r.share_token).map((r) => r.share_token as string);
  if (!client || tokens.length === 0) return out;
  const { data, error } = await client
    .from('shared_decks')
    .select('token, data, owner_id')
    .in('token', tokens);
  if (error) {
    console.error('SupabaseClient: resolving shared payloads failed', error);
    return out;
  }
  for (const row of data as Array<{
    token: string;
    data: HistoryEntry['data'];
    owner_id: string;
  }>) {
    out.set(row.token, { data: row.data, ownerId: row.owner_id });
  }
  return out;
}

export async function saveDeck(entry: HistoryEntry): Promise<{ error: string | null }> {
  if (!client || !currentSession) return { error: 'Not logged in.' };
  // A deck linked to a share stores the POINTER only — the payload already
  // lives in shared_decks, and writing it here as well is exactly the
  // duplication the share model exists to avoid. This device keeps its own full
  // copy in the local cache regardless, so nothing here depends on a read-back.
  const { error } = await client.from('decks').upsert(
    {
      user_id: currentSession.user.id,
      title: entry.title,
      question_count: entry.count,
      last_opened: entry.lastOpened,
      share_token: entry.shareToken ?? null,
      data: entry.shareToken ? null : entry.data,
    },
    { onConflict: 'user_id,title' },
  );
  return { error: error ? error.message : null };
}

export async function deleteDeck(title: string): Promise<{ error: string | null }> {
  if (!client || !currentSession) return { error: 'Not logged in.' };
  const { error } = await client
    .from('decks')
    .delete()
    .eq('user_id', currentSession.user.id)
    .eq('title', title);
  return { error: error ? error.message : null };
}

// --- shared_decks table ------------------------------------------------------

/** One published snapshot, as the get_shared_deck RPC returns it. */
export interface SharedDeck {
  token: string;
  title: string;
  count: number;
  hash: string;
  data: HistoryEntry['data'];
}

/**
 * Resolve a share link's token. Deliberately does NOT require a session —
 * adding a shared deck works signed out (Davis, 2026-08-19) — which is why it
 * goes through a SECURITY DEFINER function instead of a table select: an
 * exact-token lookup is a capability, while a readable table would be a
 * directory of every shared deck on the service.
 */
export async function fetchSharedDeck(
  token: string,
): Promise<{ deck: SharedDeck | null; error: string | null }> {
  if (!client) return { deck: null, error: 'Sharing is not set up for this deployment.' };
  const { data, error } = await client.rpc('get_shared_deck', { p_token: token });
  if (error) {
    console.error('SupabaseClient.fetchSharedDeck failed', error);
    return { deck: null, error: error.message };
  }
  const row = (data as Array<Record<string, unknown>> | null)?.[0];
  if (!row) return { deck: null, error: null };
  return {
    deck: {
      token: row.token as string,
      title: row.title as string,
      count: row.question_count as number,
      hash: row.content_hash as string,
      data: row.data as HistoryEntry['data'],
    },
    error: null,
  };
}

/**
 * Publish a deck and return its link token. Idempotent per (owner, content):
 * sharing the same deck twice returns the token it already has rather than
 * minting a second snapshot, so a re-share spreads the same link.
 */
export async function createShare(
  entry: HistoryEntry,
  hash: string,
): Promise<{ token: string | null; error: string | null }> {
  if (!client) return { token: null, error: 'Sharing is not set up for this deployment.' };
  if (!currentSession) return { token: null, error: 'Not logged in.' };
  const { data, error } = await client.rpc('create_share', {
    p_title: entry.title,
    p_question_count: entry.count,
    p_hash: hash,
    p_data: entry.data,
  });
  if (error) {
    console.error('SupabaseClient.createShare failed', error);
    return { token: null, error: error.message };
  }
  return { token: data as string, error: null };
}

/**
 * Rename a share the caller owns. The owner's name for a study set IS the name
 * every recipient sees (Davis, 2026-09-14), so a rename has to reach the
 * snapshot — the one and only write into an existing `shared_decks` row.
 *
 * Touches `title` alone. `data` and `content_hash` stay exactly as published,
 * which is what keeps every recipient's copy hashing to the same deck and the
 * link's dedupe working across any number of renames.
 *
 * A call for a token the caller doesn't own matches no row and reports success,
 * deliberately — it neither changes anything nor confirms the token exists.
 */
export async function renameShare(
  token: string,
  title: string,
): Promise<{ error: string | null }> {
  if (!client) return { error: 'Sharing is not set up for this deployment.' };
  if (!currentSession) return { error: 'Not logged in.' };
  const { error } = await client.rpc('rename_share', { p_token: token, p_title: title });
  if (error) console.error('SupabaseClient.renameShare failed', error);
  return { error: error ? error.message : null };
}

/** One share's current published state, as get_shared_titles returns it. */
export interface SharedTitle {
  token: string;
  title: string;
  count: number;
  hash: string;
  /** Whether the caller is this share's publisher. Always false signed out. */
  isOwner: boolean;
}

/**
 * The current names of shares we already hold tokens for — how a recipient's
 * read-only copy picks up the owner's rename.
 *
 * Deliberately does NOT require a session, like fetchSharedDeck: a deck added
 * from a link while signed out has no cloud row to sync through, so the token
 * in local storage is the only handle it has. One round trip for the whole
 * library rather than a call per deck.
 */
export async function fetchSharedTitles(
  tokens: string[],
): Promise<{ titles: SharedTitle[]; error: string | null }> {
  if (!client || tokens.length === 0) return { titles: [], error: null };
  const { data, error } = await client.rpc('get_shared_titles', { p_tokens: tokens });
  if (error) {
    console.error('SupabaseClient.fetchSharedTitles failed', error);
    return { titles: [], error: error.message };
  }
  const rows = (data as Array<Record<string, unknown>> | null) ?? [];
  return {
    titles: rows.map((row) => ({
      token: row.token as string,
      title: row.title as string,
      count: row.question_count as number,
      hash: row.content_hash as string,
      isOwner: row.is_owner === true,
    })),
    error: null,
  };
}

// --- flash_state table -------------------------------------------------------

interface FlashStateRow {
  deck_title: string;
  known: string[];
  learning: string[];
}

export async function getAllFlashState(): Promise<Record<string, FlashState>> {
  if (!client || !currentSession) return {};
  const { data, error } = await client.from('flash_state').select('deck_title, known, learning');
  if (error) {
    console.error('SupabaseClient.getAllFlashState failed', error);
    return {};
  }
  const result: Record<string, FlashState> = {};
  for (const row of data as FlashStateRow[]) {
    result[row.deck_title] = { known: row.known, learning: row.learning };
  }
  return result;
}

export async function setFlashState(
  deckTitle: string,
  state: FlashState,
): Promise<{ error: string | null }> {
  if (!client || !currentSession) return { error: 'Not logged in.' };
  const { error } = await client.from('flash_state').upsert(
    {
      user_id: currentSession.user.id,
      deck_title: deckTitle,
      known: state.known,
      learning: state.learning,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,deck_title' },
  );
  return { error: error ? error.message : null };
}

export async function deleteFlashState(deckTitle: string): Promise<{ error: string | null }> {
  if (!client || !currentSession) return { error: 'Not logged in.' };
  const { error } = await client
    .from('flash_state')
    .delete()
    .eq('user_id', currentSession.user.id)
    .eq('deck_title', deckTitle);
  return { error: error ? error.message : null };
}
