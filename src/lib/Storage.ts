// Storage — the ONLY module that touches localStorage (spec: src/lib/Storage.spec.md).
// Every other module goes through this surface so persistence concerns (quota
// handling, key naming, atomic deletes, id-keyed piles) stay in one place and a
// future IndexedDB migration is a one-module change.

import type { HistoryEntry, FlashState } from '../types';
import { showError } from './toast';
import * as SupabaseClient from './SupabaseClient';

const HISTORY_KEY = 'studydeck_history';
const FLASH_PREFIX = 'studydeck_flash_';

function flashKey(title: string): string {
  return FLASH_PREFIX + title;
}

// R17: modeled on toast.ts's single-listener bus. Fired after a login-time
// hydration pull or migration bulk-overwrites the local cache, so already-
// mounted screens (which read Storage once via useState(() => ...)) know to
// re-read rather than silently going stale.
type Listener = () => void;
const listeners = new Set<Listener>();

function notifySubscribers(): void {
  for (const l of listeners) l();
}

// R14/R15: best-effort async mirror. Never awaited by the caller, never
// throws, never undoes the synchronous local write that already succeeded.
function mirror(promise: Promise<{ error: string | null }>): void {
  promise
    .then(({ error }) => {
      if (error) {
        console.error('Storage: Supabase mirror failed', error);
        showError('Sync to your account failed — saved locally, will retry next login.');
      }
    })
    .catch((e) => {
      console.error('Storage: Supabase mirror threw', e);
      showError('Sync to your account failed — saved locally, will retry next login.');
    });
}

export const Storage = {
  // R17: register for "local cache was bulk-overwritten externally" events.
  // Returns an unsubscribe function.
  subscribe(callback: Listener): () => void {
    listeners.add(callback);
    return () => listeners.delete(callback);
  },

  // Used by the auth feature's hydration/migration step (Auth.spec.md R14) to
  // write a full history array back into the local cache and notify screens.
  // Goes through the same `set` used everywhere else — no separate write path.
  replaceHistory(history: HistoryEntry[]): void {
    this.set(HISTORY_KEY, history);
    notifySubscribers();
  },

  // Wipes every deck and flash pile from the local cache. Called on logout
  // (Davis, 2026-07-19: shared-device privacy beats "never strand the user" —
  // logging out should return to a clean guest slate, not leave the last
  // logged-in account's decks visible to whoever opens the browser next).
  // Cloud data is untouched; logging back in restores it via hydration.
  clearLocal(): void {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key === HISTORY_KEY || key?.startsWith(FLASH_PREFIX)) keysToRemove.push(key);
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
    } catch (e) {
      console.error('Storage.clearLocal failed', e);
    }
    notifySubscribers();
  },

  // Same as replaceHistory but for one deck's flash pile — used when
  // hydration restores per-deck state that didn't already exist locally.
  replaceFlashState(title: string, state: FlashState): void {
    this.set(flashKey(title), state);
    notifySubscribers();
  },

  // R1: parse-or-null, never throws.
  get<T>(key: string): T | null {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (e) {
      console.warn('Storage.get failed for', key, e);
      return null;
    }
  },

  // R2/R3/R9: stringify-and-write with single-retry quota eviction. Never throws.
  set(key: string, val: unknown): boolean {
    try {
      localStorage.setItem(key, JSON.stringify(val));
      return true;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'QuotaExceededError') {
        const history = this.getHistory();
        if (history.length > 0) {
          // "oldest" = last element, because saveFile prepends newest-first (R9).
          const oldest = history[history.length - 1];
          this.deleteFile(oldest.title);
          showError('Storage full — oldest file removed to make room.');
          try {
            localStorage.setItem(key, JSON.stringify(val));
            return true;
          } catch (e2) {
            console.error('Storage.set failed after eviction', e2);
            return false;
          }
        }
      }
      console.error('Storage.set failed for', key, e);
      return false;
    }
  },

  // R4: always an array.
  getHistory(): HistoryEntry[] {
    return this.get<HistoryEntry[]>(HISTORY_KEY) || [];
  },

  // R5: upsert by title (replace in place, else prepend as newest).
  // R13/R14: local write is unchanged; a logged-in session additionally fires
  // a non-blocking async mirror to Supabase.
  saveFile(entry: HistoryEntry): boolean {
    const history = this.getHistory();
    const idx = history.findIndex((f) => f.title === entry.title);
    if (idx >= 0) {
      history[idx] = entry;
    } else {
      history.unshift(entry);
    }
    const ok = this.set(HISTORY_KEY, history);
    if (SupabaseClient.isLoggedIn()) mirror(SupabaseClient.saveDeck(entry));
    return ok;
  },

  // R6: atomic across BOTH keys — history entry AND its flash-pile state.
  // R13/R15: local delete is unchanged; a logged-in session additionally
  // mirrors the delete to both cloud tables, independently (a failure on one
  // never rolls back the other or the local delete).
  deleteFile(title: string): void {
    const history = this.getHistory().filter((f) => f.title !== title);
    this.set(HISTORY_KEY, history);
    try {
      localStorage.removeItem(flashKey(title));
    } catch {
      /* flash-key removal must never throw out */
    }
    if (SupabaseClient.isLoggedIn()) {
      mirror(SupabaseClient.deleteDeck(title));
      mirror(SupabaseClient.deleteFlashState(title));
    }
  },

  // R7: default pile state when absent.
  getFlashState(title: string): FlashState {
    return this.get<FlashState>(flashKey(title)) || { known: [], learning: [] };
  },

  // R8: persist piles (inherits R3 quota handling via set).
  // R13/R14: local write is unchanged; a logged-in session additionally fires
  // a non-blocking async mirror to Supabase.
  setFlashState(title: string, state: FlashState): boolean {
    const ok = this.set(flashKey(title), state);
    if (SupabaseClient.isLoggedIn()) mirror(SupabaseClient.setFlashState(title, state));
    return ok;
  },
};
