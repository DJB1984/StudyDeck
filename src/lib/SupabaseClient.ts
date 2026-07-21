// SupabaseClient — the ONLY module that imports @supabase/supabase-js or
// holds a reference to a Supabase client instance (spec: Auth.spec.md R17).
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
// needs to run once per login, per Auth.spec.md R11/R14.
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
  data: HistoryEntry['data'];
}

export async function getDecks(): Promise<HistoryEntry[]> {
  if (!client || !currentSession) return [];
  const { data, error } = await client
    .from('decks')
    .select('title, question_count, last_opened, data')
    .order('last_opened', { ascending: false });
  if (error) {
    console.error('SupabaseClient.getDecks failed', error);
    return [];
  }
  return (data as DeckRow[]).map((row) => ({
    name: `${row.title}.json`,
    title: row.title,
    count: row.question_count,
    // HistoryEntry.lastOpened is always a pre-formatted display string
    // elsewhere in the app (HomeScreen's today() uses toLocaleDateString()) —
    // reformat Postgres's raw ISO timestamp to match, or the card shows the
    // raw "2026-07-20T00:00:00+00:00" string until the deck is opened once.
    lastOpened: new Date(row.last_opened).toLocaleDateString(),
    data: row.data,
  }));
}

export async function saveDeck(entry: HistoryEntry): Promise<{ error: string | null }> {
  if (!client || !currentSession) return { error: 'Not logged in.' };
  const { error } = await client.from('decks').upsert(
    {
      user_id: currentSession.user.id,
      title: entry.title,
      question_count: entry.count,
      last_opened: entry.lastOpened,
      data: entry.data,
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
