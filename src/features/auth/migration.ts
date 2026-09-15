// migration — runs on every login. Always does
// both directions: MERGE-DOWN adds every cloud deck/pile that isn't already
// present locally, then UPLOAD pushes every local deck/pile up to the account
// (upsert by title, so it never destroys cloud data). Local data is never
// replaced or removed by this process — only ever added to — so a deck you
// just created while logged out is never at risk of being clobbered by an
// account that already has other decks in it.
//
// Same-title collisions between a local deck and a DIFFERENT cloud deck keep
// both copies: the incoming cloud deck is renamed "Title (2)" rather than
// dropped (Davis's call, 2026-08-15 — the previous order silently overwrote
// the account's copy with the local one and there was no way to get it back).

import { fromPiles } from '../flashcard/schedule';
import { syncSharedNames } from '../share/shareSync';
import { canonicalDeck, freeTitle, retitle } from '../../lib/deckIdentity';
import { Storage } from '../../lib/Storage';
import * as SupabaseClient from '../../lib/SupabaseClient';
import { showError } from '../../lib/toast';
import type { HistoryEntry, FlashState } from '../../types';

// R11: never throws out — a failure here must never block or undo the login
// that already succeeded. It does surface a soft toast, so a partial sync
// isn't invisible to the student (they might log out and clear the local
// cache, per R21, believing everything reached the cloud).
export async function syncOnLogin(): Promise<void> {
  try {
    // Settle shared names BEFORE either direction, because both key off the
    // title. A set whose owner renamed it is still under the old name locally
    // until this runs — and mergeDown, seeing the account's copy under a name
    // no local deck holds, would take it for a different deck and add a second
    // copy of it. Signing in is also what settles which linked decks are this
    // student's OWN, so it has to come before the upload that writes them.
    await syncSharedNames();
    // Pull BEFORE pushing. upload() upserts by title, so a colliding cloud
    // deck's content is gone the moment we push — we need the account's
    // original copy in hand to tell "same deck" from "different deck with
    // the same name". (This ordering is load-bearing; don't flip it back.)
    const [cloudDecks, cloudFlash] = await Promise.all([
      SupabaseClient.getDecks(),
      SupabaseClient.getAllFlashState(),
    ]);
    mergeDown(cloudDecks, cloudFlash);
    // Uploading after the merge also pushes up anything that just came down
    // (idempotent upserts) plus any renamed copy, so the rename sticks in the
    // account and the next login sees two matching decks instead of colliding
    // on the same title all over again.
    const failed = await upload();
    if (failed > 0) {
      showError("Couldn't sync everything to your account — your decks are saved on this device.");
    }
  } catch (e) {
    console.error('auth: syncOnLogin failed', e);
    showError("Couldn't sync your account — your decks are saved on this device.");
  }
}

// Push every local deck/pile up to the account. Upsert by title, so this is
// additive from the cloud's perspective too — it never deletes a cloud-only
// deck, it only adds/refreshes the ones that exist locally. Best-effort per
// entry: one deck failing must not abort the rest of the loop (a single
// oversized deck used to strand every deck after it in the array). Returns
// the number of failed writes so the caller can toast once.
async function upload(): Promise<number> {
  const history = Storage.getHistory();
  let failed = 0;
  for (const entry of history) {
    try {
      const { error } = await SupabaseClient.saveDeck(entry);
      if (error) {
        console.error('auth: upload failed for deck', entry.title, error);
        failed++;
      }
      // Storage keys flash state by deck id now; the cloud table is still keyed
      // by title, so the upload maps one to the other. Entries out of
      // getHistory() always carry an id (Storage back-fills on read).
      const flash = entry.id ? Storage.getFlashState(entry.id) : { known: [], learning: [] };
      if (flash.known.length > 0 || flash.learning.length > 0) {
        const { error: flashError } = await SupabaseClient.setFlashState(entry.title, flash);
        if (flashError) {
          console.error('auth: upload failed for pile', entry.title, flashError);
          failed++;
        }
      }
    } catch (e) {
      console.error('auth: upload threw for', entry.title, e);
      failed++;
    }
  }
  return failed;
}

// R14/R15: ADDS cloud decks/piles that aren't already present locally —
// never overwrites an existing local entry. This is what makes it safe to
// run unconditionally on every login: a deck that's local-only (just
// created, or that failed to upload above) is never touched by this step,
// so it can never be lost to an account that already has other decks.
//
// A cloud deck whose title IS taken locally is either the same deck (skip,
// nothing to merge) or genuinely different content under a reused name, in
// which case it comes down under a free "(2)" title so neither copy is lost.
function mergeDown(cloudDecks: HistoryEntry[], cloudFlash: Record<string, FlashState>): void {
  const localHistory = Storage.getHistory();
  const localByTitle = new Map(localHistory.map((e) => [e.title, e]));
  const takenTitles = new Set(localByTitle.keys());
  // cloud title -> the local title it landed under, so its flash pile follows it.
  const landedAs = new Map<string, string>();
  const added: HistoryEntry[] = [];

  for (const cloudDeck of cloudDecks) {
    const local = localByTitle.get(cloudDeck.title);
    if (local) {
      // Same deck on both sides — leave the local copy exactly as it is.
      if (sameDeck(local, cloudDeck)) continue;
      const title = freeTitle(cloudDeck.title, takenTitles);
      takenTitles.add(title);
      landedAs.set(cloudDeck.title, title);
      added.push(retitle(cloudDeck, title));
    } else {
      takenTitles.add(cloudDeck.title);
      added.push(cloudDeck);
    }
  }

  if (added.length > 0) {
    Storage.replaceHistory([...localHistory, ...added]);
  }

  for (const [cloudTitle, state] of Object.entries(cloudFlash)) {
    const target = landedAs.get(cloudTitle) ?? cloudTitle;
    // The cloud table is keyed by title; local state is keyed by deck id. This
    // runs after replaceHistory, so every deck (including one that just came
    // down) already has an id assigned by getHistory's back-fill.
    const deckId = Storage.deckIdForTitle(target);
    if (!deckId) continue;
    const local = Storage.getFlashState(deckId);
    // Only fill in when local truly has nothing for this deck yet — avoids
    // overwriting in-progress local state with a stale cloud copy. A renamed
    // deck's key is always free, so its progress comes down too.
    //
    // The incoming copy has no mastery records (the table has only the two pile
    // columns), so the records are rebuilt here rather than left to `normalize`.
    // Only this call site knows the arrays came from the CURRENT model, where
    // `known` means mastered — normalize's legacy path reads the same two arrays
    // as pre-streak state, where `known` was worth 3, and left to it a deck
    // mastered on one device would land on the second at 0 mastered and then
    // mirror that emptied pile back up, destroying the account's record.
    if (local.known.length === 0 && local.learning.length === 0 && !local.cards) {
      Storage.replaceFlashState(deckId, fromPiles(state.known, state.learning));
    }
  }
}

// Compares deck CONTENT, ignoring history metadata (lastOpened differs by
// definition between the two copies) and, critically, key order — see
// canonicalDeck in lib/deckIdentity.ts for why that matters.
function sameDeck(a: HistoryEntry, b: HistoryEntry): boolean {
  return canonicalDeck(a.data) === canonicalDeck(b.data);
}
