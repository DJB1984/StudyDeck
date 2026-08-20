// shareLibrary — the library half of sharing: deciding whether a shared deck is
// already in this student's collection, and adding it if it isn't.
//
// Kept out of Storage.ts on purpose. Storage is a persistence surface; "is this
// the same study set?" is a question about deck CONTENT, which lives in
// lib/deckIdentity.ts. This module is the seam between them.

import type { HistoryEntry } from '../../types';
import type { SharedDeck } from '../../lib/SupabaseClient';
import { Storage } from '../../lib/Storage';
import { deckHash, freeTitle } from '../../lib/deckIdentity';

function today(): string {
  return new Date().toLocaleDateString();
}

/**
 * The deck this student already has for `shared`, or null.
 *
 * Two passes, in order of confidence:
 *
 * 1. The stamped share token. Survives a rename, and never confuses two
 *    genuinely different decks that happen to share a title.
 * 2. The content hash — for a deck that arrived some other way (imported as a
 *    file, or synced down from the account before it was ever shared) and so
 *    has no token yet. A match stamps the token on, so pass 1 catches it from
 *    then on and the deck's cloud row can drop its duplicate payload.
 *
 * Title is deliberately NOT a matching rule: "Chapter 4" from two different
 * classes is two different study sets, and treating them as one would hand a
 * student someone else's questions under their own deck's name.
 */
export function findExistingCopy(shared: SharedDeck): HistoryEntry | null {
  const history = Storage.getHistory();

  const byToken = history.find((e) => e.shareToken === shared.token);
  if (byToken) return byToken;

  const byHash = history.find((e) => deckHash(e.data) === shared.hash);
  if (byHash) {
    const stamped: HistoryEntry = { ...byHash, shareToken: shared.token };
    Storage.saveFile(stamped);
    return stamped;
  }

  return null;
}

/**
 * Add a shared deck to this student's library and return the saved entry.
 *
 * Works logged in or out: Storage writes locally either way and mirrors to the
 * account when there is one. The stamped `shareToken` is what makes the cloud
 * copy a pointer at the shared snapshot rather than a second payload.
 *
 * Callers must check findExistingCopy first — this function always adds.
 */
export function addSharedDeck(shared: SharedDeck): HistoryEntry {
  const taken = new Set(Storage.getHistory().map((e) => e.title));
  const base: HistoryEntry = {
    name: `${shared.title}.json`,
    title: shared.title,
    count: shared.data.questions.length,
    lastOpened: today(),
    shareToken: shared.token,
    data: shared.data,
  };
  // Storage upserts by title, so an unrelated local deck already holding this
  // name would be overwritten by the incoming one. Same resolution login
  // migration uses for the same collision: keep both, under a free "(2)" name.
  //
  // Renames the ENTRY only, deliberately unlike migration's retitle() — the
  // inner data.title is left exactly as the sharer published it. `data` has to
  // stay byte-identical to the snapshot for two reasons: its hash is how a
  // later click of the same link recognizes this copy, and the cloud row for it
  // is a pointer at that snapshot rather than a payload of its own. Nothing
  // renders data.title, so the rename costs nothing visible.
  const title = taken.has(base.title) ? freeTitle(base.title, taken) : base.title;
  const entry: HistoryEntry = { ...base, title, name: `${title}.json` };
  Storage.saveFile(entry);
  return entry;
}
