// shareSync — the live half of sharing: keeping a recipient's copy in step with
// the set its owner published, and pushing an owner's rename out to everyone
// holding their link.
//
// The rule this module exists to enforce (Davis, 2026-09-14): the person who
// shares a study set is the only one who can change it. Everyone else holds a
// read-only copy whose NAME tracks the owner's, while every bit of progress
// against it — mastery streaks, quiz stats, question order — stays their own.
//
// Kept out of Storage for the same reason shareLibrary is: Storage is a
// persistence surface, and "whose set is this, and what is it called now?" is a
// share question. Storage.renameFile still does all the actual writing.
//
// SCOPE, deliberately: names only. A deck's QUESTIONS cannot be edited anywhere
// in the app yet, so a snapshot's payload never changes and there is nothing
// else to pull down. When editing lands, this is the seam it plugs into — the
// sync already carries each snapshot's content hash for exactly that reason;
// see docs/sharing/design-doc.md.

import type { HistoryEntry } from '../../types';
import { Storage } from '../../lib/Storage';
import * as SupabaseClient from '../../lib/SupabaseClient';
import { freeTitle } from '../../lib/deckIdentity';
import { showError } from '../../lib/toast';
import { isSharedCopy } from './shareLibrary';

const RENAME_MIRROR_FAILED =
  "Renamed here, but couldn't update the name for the people you shared it with.";

/**
 * Rename a study set the student owns, everywhere it is known by that name.
 *
 * The one rename path the UI may call. Local first and synchronously, because
 * that is the copy the next render reads; the share snapshot follows as a
 * best-effort mirror, exactly like every other cloud write in the app.
 *
 * Refuses a copy of someone else's share. Home never offers the control on one,
 * so this is the backstop rather than the explanation — the refusal is for a
 * caller, not for a student.
 */
export function renameSharedDeck(entry: HistoryEntry, newTitle: string): boolean {
  if (isSharedCopy(entry)) return false;
  if (!Storage.renameFile(entry.title, newTitle)) return false;

  // Only a published set has recipients to tell. `data.title` stays untouched
  // by renameFile, so the content hash every copy is matched on survives this —
  // which is why renaming can never orphan a link or spawn a second snapshot.
  if (entry.shareToken && entry.shareOwner) {
    SupabaseClient.renameShare(entry.shareToken, newTitle)
      .then(({ error }) => {
        if (error) {
          console.error('shareSync: renameShare failed', error);
          showError(RENAME_MIRROR_FAILED);
        }
      })
      .catch((e) => {
        console.error('shareSync: renameShare threw', e);
        showError(RENAME_MIRROR_FAILED);
      });
  }
  return true;
}

// One pull per app session is what "silent, on next open" means: a recipient
// opens StudyDeck and the set is called whatever its owner calls it now. Home
// mounts on every return from a quiz, so without this it would re-fetch a dozen
// times a sitting for an answer that cannot have changed in between.
let pulled = false;

/** The once-per-session pull, for Home's mount. */
export async function syncSharedNamesOnce(): Promise<boolean> {
  if (pulled) return false;
  pulled = true;
  return syncSharedNames();
}

/**
 * Pull the current published name for every linked deck in this library, and
 * settle which of them this student actually owns.
 *
 * Works signed out — a deck added from a link while logged out has no cloud row
 * to sync through, so its token is the only handle it has. Returns whether
 * anything changed locally, so a caller can re-read.
 *
 * Never throws: a failed sync leaves every deck exactly as it was, under the
 * name it already had. Being a session behind is not worth an error screen.
 */
export async function syncSharedNames(): Promise<boolean> {
  try {
    const linked = Storage.getHistory().filter((e) => e.shareToken);
    if (linked.length === 0) return false;

    await SupabaseClient.ready();
    const { titles } = await SupabaseClient.fetchSharedTitles(
      linked.map((e) => e.shareToken as string),
    );
    if (titles.length === 0) return false;

    const published = new Map(titles.map((t) => [t.token, t]));
    const owners = applyOwnership(published);
    const names = applyNames(published);
    const changed = owners || names;
    // Tell already-mounted screens to re-read. Storage.renameFile and saveFile
    // write without notifying — they are called from event handlers, where the
    // caller re-reads for itself — but this pass runs on its own, and at login
    // it runs behind a Home that is already on screen. Without this, a set
    // renamed by its owner would sit under the old name until the next mount,
    // which is exactly the stale name the sync exists to clear.
    if (changed) Storage.replaceHistory(Storage.getHistory());
    return changed;
  } catch (e) {
    console.error('shareSync: syncSharedNames failed', e);
    return false;
  }
}

/**
 * Settle the shareOwner flag from the account, which is the only real authority
 * on it — the token itself is stamped on the publisher's deck AND on every copy
 * made from it, so locally the two are indistinguishable.
 *
 * Signed out, every answer comes back `is_owner: false`, which says nothing
 * about ownership — so nothing is written. That also leaves decks published
 * before this flag existed reading as read-only until their owner signs in,
 * which is the right way round: renaming a share has to reach the snapshot, and
 * that needs a session anyway.
 */
function applyOwnership(published: Map<string, SupabaseClient.SharedTitle>): boolean {
  if (!SupabaseClient.isLoggedIn()) return false;
  let changed = false;
  for (const entry of Storage.getHistory()) {
    const row = entry.shareToken ? published.get(entry.shareToken) : undefined;
    if (!row || entry.shareOwner === row.isOwner) continue;
    Storage.saveFile({ ...entry, shareOwner: row.isOwner });
    changed = true;
  }
  return changed;
}

/**
 * Bring every read-only copy to the name its owner publishes it under.
 *
 * Goes through Storage.renameFile rather than writing history, so the rename
 * carries everything a rename has to carry: the deck keeps its id (and with it
 * every mastery streak and quiz-order preference, both keyed by id), and the
 * title-keyed cloud rows for the deck and its flashcard piles are moved rather
 * than stranded. A recipient's progress survives the owner renaming the set —
 * that is the whole point of their copy being their own.
 *
 * An owner's own deck is never touched here. Their local name is the one they
 * typed, and the snapshot is downstream of it, not the other way round.
 */
function applyNames(published: Map<string, SupabaseClient.SharedTitle>): boolean {
  let changed = false;
  // Re-read inside the loop: applyOwnership may have just rewritten entries,
  // and each rename below changes the set of taken titles the next must dodge.
  for (const entry of Storage.getHistory()) {
    if (!isSharedCopy(entry)) continue;
    const row = entry.shareToken ? published.get(entry.shareToken) : undefined;
    if (!row) continue;

    const taken = new Set(
      Storage.getHistory()
        .filter((e) => e.id !== entry.id)
        .map((e) => e.title),
    );
    // A local deck already sitting on the published name is no reason to give
    // up on the rename — park beside it under "(2)", the same resolution adding
    // a shared deck already uses for the same collision. Computed against
    // everything BUT this deck, so a copy already parked there reads as settled
    // instead of drifting to "(3)" on every sync; and if the deck it was
    // dodging is removed later, the next sync moves it onto the real name.
    const desired = taken.has(row.title) ? freeTitle(row.title, taken) : row.title;
    if (entry.title === desired) continue;
    if (Storage.renameFile(entry.title, desired)) changed = true;
  }
  return changed;
}
