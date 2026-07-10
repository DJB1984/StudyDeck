// Storage — the ONLY module that touches localStorage (spec: src/lib/Storage.spec.md).
// Every other module goes through this surface so persistence concerns (quota
// handling, key naming, atomic deletes, id-keyed piles) stay in one place and a
// future IndexedDB migration is a one-module change.

import type { HistoryEntry, FlashState } from '../types';
import { showError } from './toast';

const HISTORY_KEY = 'studydeck_history';
const FLASH_PREFIX = 'studydeck_flash_';

function flashKey(title: string): string {
  return FLASH_PREFIX + title;
}

export const Storage = {
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
  saveFile(entry: HistoryEntry): boolean {
    const history = this.getHistory();
    const idx = history.findIndex((f) => f.title === entry.title);
    if (idx >= 0) {
      history[idx] = entry;
    } else {
      history.unshift(entry);
    }
    return this.set(HISTORY_KEY, history);
  },

  // R6: atomic across BOTH keys — history entry AND its flash-pile state.
  deleteFile(title: string): void {
    const history = this.getHistory().filter((f) => f.title !== title);
    this.set(HISTORY_KEY, history);
    try {
      localStorage.removeItem(flashKey(title));
    } catch {
      /* flash-key removal must never throw out */
    }
  },

  // R7: default pile state when absent.
  getFlashState(title: string): FlashState {
    return this.get<FlashState>(flashKey(title)) || { known: [], learning: [] };
  },

  // R8: persist piles (inherits R3 quota handling via set).
  setFlashState(title: string, state: FlashState): boolean {
    return this.set(flashKey(title), state);
  },
};
