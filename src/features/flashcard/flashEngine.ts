// Flashcard engine — pile logic + persistence.
// A mutable object (reused across renders via a ref) that mirrors the legacy
// FlashEngine. Piles are keyed by question `id`, never index, so progress
// survives deck reordering. sortCard() is the ONLY method that decides pile
// membership, isolated so a future spaced-repetition scheduler can replace it.

import type { FlashCard, FlashSession } from '../../types';
import { Storage } from '../../lib/Storage';
import { shuffleArray } from '../../lib/shuffle';

export interface FlashStartOptions {
  randomOrder?: boolean;
  /** Interleave Still Learning cards back into the rotation until all are Known. */
  masteryMode?: boolean;
  /** Skip the saved-session resume and start a fresh round from the top. */
  forceRestart?: boolean;
}

// The single shuffle site for both modes' starting order — mastery mode's queue
// is carved out of the same shuffled `ids`, so there's one randomization here
// and not a second one per mode. Uses lib/shuffle's Fisher-Yates rather than a
// `sort(() => Math.random() - 0.5)` comparator, which is measurably biased
// toward leaving cards near where they started.
function shuffleIfRandom(ids: string[], random: boolean): string[] {
  return random ? shuffleArray(ids) : ids;
}

// A saved session is "finished" when its round already ran out of cards — don't
// resume into a completed round, fall through to a fresh start instead. Mastery
// mode walks `queue` rather than `order`/`currentIdx`, so it finishes on an
// empty queue (every card sorted Know It) instead of on a run off the end.
export function sessionIsFinished(session: FlashSession): boolean {
  if (session.masteryMode) return (session.queue?.length ?? 0) === 0;
  return session.currentIdx >= session.order.length;
}

export function createFlashEngine(title: string, allQuestions: FlashCard[]) {
  return {
    title,
    allQuestions,
    deck: [] as FlashCard[],
    order: [] as string[],
    currentIdx: 0,
    // Mastery mode only: the live rotation. A card leaves it for good on Know It
    // and is re-inserted a few positions later on Still Learning, so the session
    // can't complete until every card has been marked Known at least once.
    queue: [] as string[],
    known: new Set<string>(),
    learning: new Set<string>(),
    roundKnown: new Set<string>(),
    roundLearning: new Set<string>(),
    flipped: false,
    randomOrder: false,
    masteryMode: false,
    // One entry per sort this session, recording the pile AND round-tally
    // membership the card had BEFORE it was sorted, so goBack() can restore it
    // exactly. Deliberately not persisted — a reload starts with nothing to undo.
    undoStack: [] as {
      id: string;
      wasKnown: boolean;
      wasLearning: boolean;
      wasRoundKnown: boolean;
      wasRoundLearning: boolean;
    }[],

    // A "round" is one pass through `order`: Standard walks it a card at a time
    // and ends by stepping off the last one. Mastery instead runs until `queue`
    // empties, which only happens once every card has been marked Know It.
    //
    // R12: entry resumes a saved unfinished session (a reload or a Back-then-
    // reopen lands on the same card with the same options); only an explicit
    // restart (forceRestart) or a finished/stale session starts fresh.
    start(options: FlashStartOptions = {}) {
      const state = Storage.getFlashState(this.title);
      this.known = new Set(state.known);
      this.learning = new Set(state.learning);
      this.undoStack = [];

      if (!options.forceRestart && state.session) {
        if (this.restoreSession(state.session)) return;
      }

      this.randomOrder = !!options.randomOrder;
      this.masteryMode = !!options.masteryMode;
      this.deck = this.allQuestions;

      const ids = shuffleIfRandom(
        this.deck.map((q) => q.id),
        this.randomOrder,
      );

      this.order = ids;
      this.currentIdx = 0;
      // `order` stays the session's full working set in both modes (it's what
      // "N cards" counts and what a jump-to-card lookup resolves against);
      // `queue` is the mastery-mode rotation carved out of it.
      this.queue = this.masteryMode ? ids.slice() : [];
      this.roundKnown = new Set();
      this.roundLearning = new Set();
      this.flipped = false;
      this.persist();
    },

    // Rebuilds the live session from a saved one. Returns false (and leaves the
    // engine untouched) when the saved session can't be trusted — already
    // finished, or built from a deck whose questions have since changed — so
    // start() falls through to its fresh-start path.
    restoreSession(session: FlashSession): boolean {
      if (sessionIsFinished(session)) return false;
      // Saved by the removed Piles mode: its `order` is a narrowed working set
      // (Still Learning only), and neither surviving mode walks a subset of the
      // deck. Start fresh rather than resume a round nothing can run.
      if (session.drillMode === 'learning') return false;
      const cards = session.order.map((id) => this.allQuestions.find((q) => q.id === id));
      if (cards.some((c) => !c)) return false; // deck edited under the saved order

      const queue = session.queue ?? [];
      if (session.masteryMode && queue.some((id) => !session.order.includes(id))) return false;

      this.randomOrder = session.randomOrder;
      this.masteryMode = session.masteryMode;
      this.deck = cards as FlashCard[];
      this.order = session.order.slice();
      this.currentIdx = session.currentIdx;
      this.queue = session.masteryMode ? queue.slice() : [];

      // The round tallies aren't persisted — derive them from the piles instead.
      // Only mastery has any to derive: a browse round marks nothing, and the
      // piles its cards sit in came from earlier sessions, so crediting them
      // here would invent a tally the student never made.
      this.roundKnown = new Set();
      this.roundLearning = new Set();
      if (this.masteryMode) {
        // A card leaves `queue` only by being marked Know It, so everything in
        // the working set that's no longer queued was mastered this session;
        // anything still queued and sitting in `learning` was missed at least once.
        for (const id of this.order) {
          if (!this.queue.includes(id)) {
            if (this.known.has(id)) this.roundKnown.add(id);
          } else if (this.learning.has(id)) {
            this.roundLearning.add(id);
          }
        }
      }
      this.flipped = false;
      return true;
    },

    currentCard(): FlashCard | null {
      const id = this.masteryMode ? this.queue[0] : this.order[this.currentIdx];
      if (id === undefined) return null;
      return this.allQuestions.find((q) => q.id === id) ?? null;
    },

    isComplete(): boolean {
      if (this.order.length === 0) return false; // R11: empty-from-start is its own state
      return this.masteryMode ? this.queue.length === 0 : this.currentIdx >= this.order.length;
    },

    // Standard mode = the whole deck, walked one card at a time, with no pile
    // sorting at all — the student just flips through. Kept as a named check
    // rather than `!masteryMode` at each call site because the callers care
    // about "does this round record verdicts?", not about which flag says so.
    isBrowseMode(): boolean {
      return !this.masteryMode;
    },

    // Standard mode's navigation. Deliberately separate from sortCard(): a
    // browse step records nothing, so there's no pile write, no round tally and
    // no undo entry — Left Arrow here means "previous card", not "undo".
    stepBack(): boolean {
      if (this.currentIdx <= 0) return false;
      this.currentIdx--;
      this.flipped = false;
      this.persist();
      return true;
    },

    // Stepping off the last card is what ends a browse round (currentIdx ===
    // order.length is isComplete()'s linear condition), so unlike stepBack this
    // intentionally does not clamp one short of the end.
    stepForward(): boolean {
      if (this.currentIdx >= this.order.length) return false;
      this.currentIdx++;
      this.flipped = false;
      this.persist();
      return true;
    },

    progress(): { current: number; total: number } {
      const total = this.order.length;
      const current = Math.min(this.currentIdx + 1, total);
      return { current, total };
    },

    // Mastery mode's progress: "Card X of Y" implies a fixed linear position that
    // no longer holds once cards requeue. Remaining is deduplicated by id since a
    // requeued card is still one card.
    progressMastery(): { mastered: number; remaining: number } {
      return { mastered: this.roundKnown.size, remaining: new Set(this.queue).size };
    },

    flip() {
      this.flipped = !this.flipped;
    },

    // The only method that decides pile assignment (keep it that way) — the seam
    // a spaced-repetition scheduler would replace. Mastery mode is the only
    // round that gives verdicts; Standard browses and records nothing.
    sortCard(pile: 'known' | 'learning') {
      const id = this.queue.shift();
      if (id === undefined) return;
      this.pushUndo(id);
      if (pile === 'known') {
        this.known.add(id);
        this.learning.delete(id);
        this.roundKnown.add(id);
        // Mastered now, so it no longer counts as missed — which is what keeps
        // the completion screen from reporting cards the student just finished
        // mastering as still outstanding.
        this.roundLearning.delete(id);
        // Not requeued — Know It removes the card for good, which is why a known
        // card can never resurface and get double-counted.
      } else {
        this.learning.add(id);
        this.known.delete(id);
        this.roundLearning.add(id);
        this.roundKnown.delete(id);
        // 3-6 cards later, not immediately next — otherwise the mode degrades
        // into re-showing the same card until it's guessed right.
        const insertAt = Math.min(this.queue.length, 3 + Math.floor(Math.random() * 4));
        this.queue.splice(insertAt, 0, id);
      }
      this.persist();
      this.flipped = false;
    },

    // Snapshots a card's pile and round-tally membership before sortCard()
    // overwrites it. Must be called BEFORE the mutation, or the "prior" state it
    // records is the new one.
    pushUndo(id: string) {
      this.undoStack.push({
        id,
        wasKnown: this.known.has(id),
        wasLearning: this.learning.has(id),
        wasRoundKnown: this.roundKnown.has(id),
        wasRoundLearning: this.roundLearning.has(id),
      });
    },

    canGoBack(): boolean {
      return this.undoStack.length > 0;
    },

    // Undoes the LAST sort only — one step per call, not a history browser.
    // Restores the card's exact prior pile membership (which may be neither pile,
    // for a card seen for the first time) and puts it back at the front.
    goBack(): boolean {
      const prev = this.undoStack.pop();
      if (!prev) return false;

      // Restore all four sets from the snapshot rather than just clearing the
      // round tallies: a card can be sorted several times in one mastery round,
      // so "it's in roundLearning" doesn't imply the sort being undone put it there.
      if (prev.wasKnown) this.known.add(prev.id);
      else this.known.delete(prev.id);
      if (prev.wasLearning) this.learning.add(prev.id);
      else this.learning.delete(prev.id);
      if (prev.wasRoundKnown) this.roundKnown.add(prev.id);
      else this.roundKnown.delete(prev.id);
      if (prev.wasRoundLearning) this.roundLearning.add(prev.id);
      else this.roundLearning.delete(prev.id);

      // Drop the requeued copy a Still Learning sort left further down the queue
      // before putting the card back at the front — unshifting alone would leave
      // the same id in the rotation twice.
      const requeued = this.queue.indexOf(prev.id);
      if (requeued !== -1) this.queue.splice(requeued, 1);
      this.queue.unshift(prev.id);

      this.persist();
      this.flipped = false;
      return true;
    },

    // Piles + the in-progress session, written together on every sort (and on
    // start, so a reload can never resume a session the engine has moved past).
    persist() {
      Storage.setFlashState(this.title, {
        known: Array.from(this.known),
        learning: Array.from(this.learning),
        session: {
          order: this.order,
          queue: this.masteryMode ? this.queue.slice() : undefined,
          currentIdx: this.currentIdx,
          randomOrder: this.randomOrder,
          masteryMode: this.masteryMode,
        },
      });
    },
  };
}

export type FlashEngine = ReturnType<typeof createFlashEngine>;
