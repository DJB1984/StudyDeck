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
 * Whether this deck is a copy of someone else's share — and so read-only.
 *
 * The one place the ownership rule is written down (Davis, 2026-09-14: the
 * person who shares a set is the only one who can change it). A linked deck is
 * the student's own only when they published it; absence of the flag means
 * "not known to be mine", which reads as read-only on purpose — a rename has to
 * reach the snapshot, and a student who can't prove they own it can't do that
 * anyway. Signing in back-fills the flag from shared_decks.owner_id.
 *
 * A deck with no share link at all is nobody's copy: freely renameable, as
 * every unshared deck has always been.
 */
export function isSharedCopy(entry: HistoryEntry): boolean {
  return entry.shareToken !== undefined && entry.shareOwner !== true;
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
    // Ownership is deliberately left unset rather than stamped false: this deck
    // arrived some other way, so nothing here knows whose share it is. The next
    // signed-in sync settles it from shared_decks.owner_id — which matters for
    // the publisher opening their own link on a device that only ever had the
    // deck as a file. Until then it reads as a copy, which is the safe way to
    // be wrong.
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
    // Someone else's set: read-only here, and its name is theirs to change.
    // A publisher who lands on their own link never reaches this function —
    // findExistingCopy matches their deck by token first.
    shareOwner: false,
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
