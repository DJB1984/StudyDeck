// migration — runs on every login (spec: Auth.spec.md R11-R15). Always does
// both directions: UPLOAD pushes every local deck/pile up to the account
// (upsert by title, so it never destroys cloud data), then MERGE-DOWN adds
// any cloud deck/pile whose title isn't already present locally. Local data
// is never replaced or removed by this process — only ever added to — so a
// deck you just created while logged out is never at risk of being clobbered
// by an account that already has other decks in it.

import { Storage } from '../../lib/Storage';
import * as SupabaseClient from '../../lib/SupabaseClient';
import type { HistoryEntry, FlashState } from '../../types';

// R11: never throws out — a failure here must never block or undo the login
// that already succeeded.
export async function syncOnLogin(): Promise<void> {
  try {
    await upload();
    const [cloudDecks, cloudFlash] = await Promise.all([
      SupabaseClient.getDecks(),
      SupabaseClient.getAllFlashState(),
    ]);
    mergeDown(cloudDecks, cloudFlash);
  } catch (e) {
    console.error('auth: syncOnLogin failed', e);
  }
}

// Push every local deck/pile up to the account. Upsert by title, so this is
// additive from the cloud's perspective too — it never deletes a cloud-only
// deck, it only adds/refreshes the ones that exist locally. A failure on any
// one entry doesn't stop the rest (best-effort, per-entry).
async function upload(): Promise<void> {
  const history = Storage.getHistory();
  for (const entry of history) {
    await SupabaseClient.saveDeck(entry);
    const flash = Storage.getFlashState(entry.title);
    if (flash.known.length > 0 || flash.learning.length > 0) {
      await SupabaseClient.setFlashState(entry.title, flash);
    }
  }
}

// R14/R15: ADDS cloud decks/piles that aren't already present locally —
// never overwrites an existing local entry. This is what makes it safe to
// run unconditionally on every login: a deck that's local-only (just
// created, or that failed to upload above) is never touched by this step,
// so it can never be lost to an account that already has other decks.
function mergeDown(cloudDecks: HistoryEntry[], cloudFlash: Record<string, FlashState>): void {
  const localHistory = Storage.getHistory();
  const localTitles = new Set(localHistory.map((e) => e.title));
  const missing = cloudDecks.filter((d) => !localTitles.has(d.title));
  if (missing.length > 0) {
    Storage.replaceHistory([...localHistory, ...missing]);
  }

  for (const [title, state] of Object.entries(cloudFlash)) {
    const local = Storage.getFlashState(title);
    // Only fill in when local truly has nothing for this title yet — avoids
    // overwriting in-progress local pile state with a stale cloud copy.
    if (local.known.length === 0 && local.learning.length === 0) {
      Storage.replaceFlashState(title, state);
    }
  }
}
