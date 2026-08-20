// Storage — the ONLY module that touches localStorage.
// Every other module goes through this surface so persistence concerns (quota
// handling, key naming, atomic deletes, id-keyed piles) stay in one place and a
// future IndexedDB migration is a one-module change.

import type { HistoryEntry, FlashState } from '../types';
import { showError } from './toast';
import * as SupabaseClient from './SupabaseClient';

const HISTORY_KEY = 'studydeck_history';
const FLASH_PREFIX = 'studydeck_flash_';
const MOTION_KEY = 'studydeck_ambient_motion';
// Deliberately NOT under FLASH_PREFIX: clearLocal() wipes every key with that
// prefix as deck progress, and neither of these is deck progress.
const SWIPE_HINT_KEY = 'studydeck_swipe_hint';
const CARD_BUTTONS_KEY = 'studydeck_card_buttons';

// Flash state is keyed by the deck's stable id, not its title — mastery
// scheduling is worth more than a display string is stable. `legacyFlashKey`
// is the pre-2026-08-17 title-keyed name, read once per deck so existing
// progress moves across rather than being orphaned (see getFlashState).
function flashKey(deckId: string): string {
  return FLASH_PREFIX + deckId;
}

function legacyFlashKey(title: string): string {
  return FLASH_PREFIX + title;
}

// Ids minted by a read whose write-back failed — a full localStorage that
// eviction couldn't make room in. Without this, every subsequent read mints
// fresh ids for the same decks and each read files mastery progress under a key
// the next one can't find. Keyed by title, the only other stable handle a
// history entry has. Cleared as soon as a write-back gets through.
const unpersistedIds = new Map<string, string>();

function newDeckId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through to the manual id */
  }
  return `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
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

  // Used by the auth feature's hydration/migration step to write a full
  // history array back into the local cache and notify screens.
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
      // Nothing left for a remembered id to belong to.
      unpersistedIds.clear();
    } catch (e) {
      console.error('Storage.clearLocal failed', e);
    }
    notifySubscribers();
  },

  // Same as replaceHistory but for one deck's flash pile — used when
  // hydration restores per-deck state that didn't already exist locally.
  replaceFlashState(deckId: string, state: FlashState): void {
    this.set(flashKey(deckId), state);
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
        const history = this.readHistoryRaw();
        if (history.length > 0) {
          // "oldest" = last element, because saveFile prepends newest-first (R9).
          const oldest = history[history.length - 1];
          // deleteLocal, NOT deleteFile: eviction is a local-cache problem, so
          // it must never mirror a delete to the account. Otherwise a full
          // localStorage permanently destroys the user's oldest cloud deck —
          // the exact opposite of the cloud being the durable copy. The deck
          // stays in the account and comes back down on the next login.
          this.deleteLocal(oldest.title);
          showError('Storage full — oldest file removed from this device to make room.');
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

  // R4: always an array. R23: every returned entry is guaranteed to have an
  // `id` — entries persisted before ids existed (and anything merged down from
  // the cloud, whose table has no id column) get one assigned here and written
  // back, so a deck's id is stable from the first read onward.
  getHistory(): HistoryEntry[] {
    const history = this.readHistoryRaw();
    const seen = new Set<string>();
    let assigned = false;
    for (const entry of history) {
      // Reassigns on duplicates as well as on absence. Ids can arrive from
      // outside this device (a deck merged down from the account), and two
      // decks sharing one id would share one deck's mastery progress — one
      // deck's answers silently marking another deck's cards learned.
      if (!entry.id || seen.has(entry.id)) {
        const remembered = unpersistedIds.get(entry.title);
        entry.id = remembered && !seen.has(remembered) ? remembered : newDeckId();
        assigned = true;
      }
      seen.add(entry.id);
    }
    if (assigned) {
      if (this.set(HISTORY_KEY, history)) {
        unpersistedIds.clear();
      } else {
        // Couldn't persist, so hold the assignment in memory instead: an id that
        // changes between two reads orphans the flash state written under it.
        for (const entry of history) if (entry.id) unpersistedIds.set(entry.title, entry.id);
      }
    }
    return history;
  },

  // The un-back-filled read. Exists so `set`'s quota-eviction path can inspect
  // history without re-entering `set` through getHistory's write-back — that
  // would be an infinite recursion on a full localStorage, which is precisely
  // when the eviction path runs.
  readHistoryRaw(): HistoryEntry[] {
    return this.get<HistoryEntry[]>(HISTORY_KEY) || [];
  },

  /** The stable id for a deck title, or null when no such deck is in history. */
  deckIdForTitle(title: string): string | null {
    return this.getHistory().find((e) => e.title === title)?.id ?? null;
  },

  // R5: upsert by title (replace in place, else prepend as newest).
  // R13/R14: local write is unchanged; a logged-in session additionally fires
  // a non-blocking async mirror to Supabase.
  saveFile(entry: HistoryEntry): boolean {
    const history = this.getHistory();
    const idx = history.findIndex((f) => f.title === entry.title);
    if (idx >= 0) {
      // Re-importing a deck under a title already in history keeps that deck's
      // id, and with it every card's mastery progress. The incoming entry's own
      // id (if any) loses, because the id already on disk is the one the
      // persisted flash state is filed under.
      entry.id = history[idx].id ?? entry.id ?? newDeckId();
      history[idx] = entry;
    } else {
      entry.id = entry.id ?? newDeckId();
      history.unshift(entry);
    }
    const ok = this.set(HISTORY_KEY, history);
    if (SupabaseClient.isLoggedIn()) mirror(SupabaseClient.saveDeck(entry));
    return ok;
  },

  // R6: atomic across BOTH keys — history entry AND its flash-pile state.
  // Local-cache only: the account copy is deliberately left alone, so this is
  // safe to call for reasons that aren't "the user deleted this deck" (see the
  // quota-eviction path in `set`). User-initiated deletes go through
  // deleteFile, which is this plus the cloud mirror.
  deleteLocal(title: string): void {
    // readHistoryRaw, NOT getHistory: this runs from `set`'s quota-eviction
    // path, and getHistory writes back its id back-fill through `set` — which
    // on a full localStorage lands straight back here. That recursion has no
    // base case (nothing about the state changes between trips) and ends in a
    // RangeError, which isn't a DOMException and so escapes every catch in this
    // module. An entry with no id has no id-keyed pile to remove anyway.
    const all = this.readHistoryRaw();
    const doomed = all.find((f) => f.title === title);
    this.set(
      HISTORY_KEY,
      all.filter((f) => f.title !== title),
    );
    try {
      // Both keys: the id-keyed state this deck uses now, and the title-keyed
      // one it may still have if it was never opened since the migration.
      // Leaving either behind would strand bytes that nothing can ever read.
      if (doomed?.id) localStorage.removeItem(flashKey(doomed.id));
      localStorage.removeItem(legacyFlashKey(title));
    } catch {
      /* flash-key removal must never throw out */
    }
  },

  // R13/R15: local delete is unchanged; a logged-in session additionally
  // mirrors the delete to both cloud tables, independently (a failure on one
  // never rolls back the other or the local delete). Note the mirror is
  // best-effort with no retry — a delete that fails to reach the account comes
  // back down on the next login's merge (accepted, Davis 2026-08-16).
  deleteFile(title: string): void {
    this.deleteLocal(title);
    if (SupabaseClient.isLoggedIn()) {
      mirror(SupabaseClient.deleteDeck(title));
      mirror(SupabaseClient.deleteFlashState(title));
    }
  },

  // R7: default pile state when absent.
  //
  // R24: one-time key migration. State written before decks had ids lives under
  // the title; the first read for a deck moves it to the id key and clears the
  // old one. Deliberately a move and not a copy — two live copies of the same
  // deck's progress would silently diverge the moment the title one went stale.
  //
  // Returns the persisted SHAPE untouched: back-filling the mastery records off
  // the legacy known/learning arrays is the flashcard feature's business
  // (schedule.ts `normalize`), not Storage's.
  getFlashState(deckId: string): FlashState {
    const existing = this.get<FlashState>(flashKey(deckId));
    if (existing) return existing;

    const title = this.getHistory().find((e) => e.id === deckId)?.title;
    if (title) {
      const legacy = this.get<FlashState>(legacyFlashKey(title));
      if (legacy) {
        this.set(flashKey(deckId), legacy);
        try {
          localStorage.removeItem(legacyFlashKey(title));
        } catch {
          /* the move already succeeded; a stale leftover key is harmless */
        }
        return legacy;
      }
    }
    return { known: [], learning: [] };
  },

  // Whether the decorative ambient motion (Flashcards' mode atmosphere) is
  // allowed to animate. Off unless explicitly turned on — decoration should be
  // opt-in, and a study screen is the wrong place to make someone opt out of
  // movement they didn't ask for.
  //
  // Deliberately NOT mirrored to Supabase and deliberately NOT cleared by
  // clearLocal(): motion tolerance belongs to the device you're sitting at, not
  // to the account, and logout exists to scrub the previous user's content off
  // a shared machine — not their comfort settings.
  getAmbientMotion(): boolean {
    return this.get<boolean>(MOTION_KEY) === true;
  },

  setAmbientMotion(on: boolean): boolean {
    return this.set(MOTION_KEY, on);
  },

  // Whether this device has already been shown — and used — the swipe gesture
  // on a flashcard. Written once, on the first swipe that commits, and read to
  // decide whether the card still needs a line under it naming the gesture.
  // Device-local for the same reason motion is: what you've learned to do with
  // your thumb belongs to the thumb, not to the account.
  getSwipeHintSeen(): boolean {
    return this.get<boolean>(SWIPE_HINT_KEY) === true;
  },

  setSwipeHintSeen(seen: boolean): boolean {
    return this.set(SWIPE_HINT_KEY, seen);
  },

  // The escape hatch on touch: the flashcard's action buttons hide themselves
  // wherever a finger is the primary pointer, and this brings them back. Absent
  // means hidden, so the swipe-only layout is what a touch device gets by
  // default and the buttons are something you ask for.
  getCardButtons(): boolean {
    return this.get<boolean>(CARD_BUTTONS_KEY) === true;
  },

  setCardButtons(on: boolean): boolean {
    return this.set(CARD_BUTTONS_KEY, on);
  },

  // R8: persist piles (inherits R3 quota handling via set).
  // R13/R14: local write is unchanged; a logged-in session additionally fires
  // a non-blocking async mirror to Supabase.
  // The cloud `flash_state` table is still keyed by title and still has only the
  // known/learning columns, so the mirror resolves the deck's title and sends
  // the derived piles. The streak records stay device-local until that table
  // grows a `cards` column (deliberate — Davis, 2026-08-17: get the mode's shape
  // right in use before freezing it into a schema).
  setFlashState(deckId: string, state: FlashState): boolean {
    const ok = this.set(flashKey(deckId), state);
    if (SupabaseClient.isLoggedIn()) {
      const title = this.getHistory().find((e) => e.id === deckId)?.title;
      if (title) mirror(SupabaseClient.setFlashState(title, state));
    }
    return ok;
  },
};
