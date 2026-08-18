// Flashcard engine — rotation + persistence.
// A mutable object (reused across renders via a ref) that mirrors the legacy
// FlashEngine. Progress is keyed by question `id`, never index, so it survives
// deck reordering. sortCard() is the ONLY method that changes a card's standing,
// and every rule it applies comes from schedule.ts — keep it that way.
//
// Mastery is a single-session drill (see schedule.ts for the rationale): four
// Know Its in a row master a card, each hit burying it further down the rotation
// and the last one sending it the whole way to the back. The rotation itself
// never shrinks — a verdict always takes a card off the front and puts it back
// further down, mastered or not — so the round ends on every card being mastered
// rather than on the queue running dry. Mastered cards circulating is deliberate:
// it's what keeps the gaps honest at the end of a round, when there'd otherwise
// be two cards left to space a repeat against.

import type {
  CardProgress,
  FlashCard,
  FlashSession,
  FlashState,
  MasteryGaps,
} from '../../types';
import { Storage } from '../../lib/Storage';
import { shuffleArray } from '../../lib/shuffle';
import {
  derivePiles,
  gapFor,
  hit,
  isFresh,
  isMastered,
  miss,
  missGap,
  newProgress,
  normalize,
  partition,
  sanitizeGaps,
} from './schedule';

export interface FlashStartOptions {
  randomOrder?: boolean;
  /** Run the mastery drill instead of a plain browse. */
  masteryMode?: boolean;
  /** Skip the saved-session resume and start a fresh round from the top. */
  forceRestart?: boolean;
}

// Undo has to put back more than a card's record: a sort moves the card an
// arbitrary distance down the rotation, and reversing that from the record alone
// isn't possible. Snapshotting the queue is far cheaper to get right than
// replaying the mutation backwards.
interface UndoFrame {
  id: string;
  queue: string[];
  card: CardProgress;
}

const UNDO_DEPTH = 30;

// The single shuffle site for both modes' starting order — mastery's working set
// is carved out of the same shuffled `ids`, so there's one randomization here and
// not a second one per mode. Uses lib/shuffle's Fisher-Yates rather than a
// `sort(() => Math.random() - 0.5)` comparator, which is measurably biased
// toward leaving cards near where they started.
function shuffleIfRandom(ids: string[], random: boolean): string[] {
  return random ? shuffleArray(ids) : ids;
}

export function createFlashEngine(deckId: string, allQuestions: FlashCard[]) {
  return {
    deckId,
    allQuestions,
    deck: [] as FlashCard[],
    order: [] as string[],
    currentIdx: 0,
    // Mastery only: the live rotation. Same ids as `order`, endlessly reordered.
    queue: [] as string[],
    /** Every card's standing, for the whole deck — not just this round's working set. */
    cards: {} as Record<string, CardProgress>,
    /** Spacing in force right now. Seeded at start and swapped live by the
     *  settings panel, which is why it's engine state and not a per-call
     *  argument: a mid-round change re-spaces everything from that point on
     *  without disturbing the rotation the student is already inside. */
    gaps: {} as MasteryGaps,
    flipped: false,
    randomOrder: false,
    masteryMode: false,
    undoStack: [] as UndoFrame[],

    // A "round" is one pass through `order` in Standard mode: it walks a card at
    // a time and ends by stepping off the last one. Mastery instead runs until
    // every card in its working set is mastered.
    //
    // R12: entry resumes a saved unfinished session (a reload or a Back-then-
    // reopen lands on the same card with the same options); only an explicit
    // restart (forceRestart) or a finished/stale session starts fresh.
    start(options: FlashStartOptions = {}) {
      const state = normalize(Storage.getFlashState(this.deckId));
      this.cards = { ...(state.cards ?? {}) };
      // Every card in the deck gets a record, so no lookup below has to handle a
      // missing one.
      for (const q of this.allQuestions) {
        if (!this.cards[q.id]) this.cards[q.id] = newProgress();
      }
      this.gaps = sanitizeGaps(Storage.getMasteryGaps());
      this.undoStack = [];

      if (!options.forceRestart && state.session) {
        if (this.restoreSession(state.session)) return;
      }

      this.randomOrder = !!options.randomOrder;
      this.masteryMode = !!options.masteryMode;
      this.deck = this.allQuestions;
      this.currentIdx = 0;

      const ids = shuffleIfRandom(
        this.deck.map((q) => q.id),
        this.randomOrder,
      );

      if (this.masteryMode) {
        // Cards mastered in an earlier session are left out: there's nothing to
        // do with them, and the round would open on work already finished.
        this.order = partition(ids, this.cards).work;
        this.queue = this.order.slice();
      } else {
        // Standard browses the whole deck, mastered cards included — it records
        // nothing, so there's no reason to hide anything from it.
        this.order = ids;
        this.queue = [];
      }

      this.flipped = false;
      this.persist();
    },

    // Rebuilds the live session from a saved one. Returns false (and leaves the
    // engine untouched) when the saved session can't be trusted — already
    // finished, or built from a deck whose questions have since changed — so
    // start() falls through to its fresh-start path.
    restoreSession(session: FlashSession): boolean {
      // Saved by the removed Piles mode: its `order` is a narrowed working set
      // (Still Learning only), and neither surviving mode walks a subset of the
      // deck that way. Start fresh rather than resume a round nothing can run.
      if (session.drillMode === 'learning') return false;
      const cards = session.order.map((id) => this.allQuestions.find((q) => q.id === id));
      if (cards.some((c) => !c)) return false; // deck edited under the saved order

      if (session.masteryMode) {
        const queue = session.queue ?? [];
        // The rotation and the working set are the same multiset for a round's
        // whole life, so anything else is a session from an older model.
        if (queue.length !== session.order.length) return false;
        const inOrder = new Set(session.order);
        if (queue.some((id) => !inOrder.has(id))) return false;
        // Don't resume a round that's already been won.
        if (session.order.every((id) => isMastered(this.cards[id] ?? newProgress()))) return false;
        this.queue = queue.slice();
      } else {
        if (session.currentIdx >= session.order.length) return false; // round already ran out
        this.queue = [];
      }

      this.randomOrder = session.randomOrder;
      this.masteryMode = session.masteryMode;
      this.deck = cards as FlashCard[];
      this.order = session.order.slice();
      this.currentIdx = session.currentIdx;
      this.flipped = false;
      return true;
    },

    currentCard(): FlashCard | null {
      const id = this.masteryMode ? this.queue[0] : this.order[this.currentIdx];
      if (id === undefined) return null;
      return this.allQuestions.find((q) => q.id === id) ?? null;
    },

    /** The card on screen's streak toward mastery, for the bar above it. */
    currentStreak(): number {
      const id = this.queue[0];
      return id === undefined ? 0 : (this.cards[id]?.streak ?? 0);
    },

    /** True when the card on screen is already mastered and only circulating —
     *  a hit costs nothing and a miss un-masters it, so the screen says so. */
    currentIsMastered(): boolean {
      const id = this.queue[0];
      return id !== undefined && isMastered(this.cards[id] ?? newProgress());
    },

    /** True when the card on screen has never had a verdict, in any session —
     *  the one exposure whose Know It goes straight to one short of mastered. */
    currentIsFresh(): boolean {
      const id = this.queue[0];
      return id !== undefined && isFresh(this.cards[id] ?? newProgress());
    },

    isComplete(): boolean {
      if (this.order.length === 0) return false; // empty working set is its own state
      return this.masteryMode
        ? this.order.every((id) => isMastered(this.cards[id] ?? newProgress()))
        : this.currentIdx >= this.order.length;
    },

    /** Mastery opened on a deck that's already fully mastered. Distinct from an
     *  empty deck and from finishing a round, and the only state that has
     *  nothing to offer but a reset. */
    nothingDue(): boolean {
      return this.masteryMode && this.allQuestions.length > 0 && this.order.length === 0;
    },

    /** Whole deck mastered, counting cards this round never offered. */
    allMastered(): boolean {
      return (
        this.allQuestions.length > 0 &&
        this.allQuestions.every((q) => isMastered(this.cards[q.id] ?? newProgress()))
      );
    },

    // Standard mode = the whole deck, walked one card at a time, with nothing
    // recorded — the student just flips through. Kept as a named check rather
    // than `!masteryMode` at each call site because the callers care about
    // "does this round record verdicts?", not about which flag says so.
    isBrowseMode(): boolean {
      return !this.masteryMode;
    },

    // Standard mode's navigation. Deliberately separate from sortCard(): a
    // browse step records nothing, so there's no write, no tally and no undo
    // entry — Left Arrow here means "previous card", not "undo".
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

    // Mastery's progress. "Card X of Y" would imply a fixed linear position,
    // which stops holding the moment a card requeues — what's left is a count of
    // cards, not a position in a list.
    progressMastery(): { mastered: number; remaining: number; total: number } {
      let mastered = 0;
      for (const id of this.order) {
        if (isMastered(this.cards[id] ?? newProgress())) mastered++;
      }
      return { mastered, remaining: this.order.length - mastered, total: this.order.length };
    },

    /** New spacing from the settings panel, applied from the next verdict on.
     *  Deliberately does NOT rebuild the queue: the cards already placed under
     *  the old gaps are where they are, and yanking them would cost the student
     *  their position mid-round to no benefit. */
    applyGaps(gaps: MasteryGaps) {
      this.gaps = sanitizeGaps(gaps);
    },

    flip() {
      this.flipped = !this.flipped;
    },

    // The ONLY method that changes a card's standing (keep it that way). Every
    // rule it applies lives in schedule.ts; what's here is which rule applies.
    sortCard(pile: 'known' | 'learning') {
      const id = this.queue[0];
      if (id === undefined) return;
      this.pushUndo(id);
      this.queue.shift();

      const now = new Date();

      if (pile === 'known') {
        // hit() owns the streak arithmetic, including the first-attempt jump to
        // 3 — which is why the gap is read off the NEW streak rather than the old
        // one plus one.
        const next = hit(this.cards[id] ?? newProgress(), now);
        this.cards[id] = next;
        // The hit that MASTERS a card sends it to the very back rather than a
        // rung's distance: it has nothing left to prove, so the only useful thing
        // it can do is get out of the way of the cards that do — which also makes
        // it the best spacer in the rotation, and guarantees every unmastered
        // card keeps advancing toward the front. An already-mastered card known
        // again takes the same trip, since hit() holds it at the top of the
        // ladder; that repeat is a free victory lap, not a fifth rung.
        this.reinsert(
          id,
          isMastered(next) ? this.queue.length : gapFor(next.streak, this.queue.length, this.gaps),
        );
      } else {
        this.cards[id] = miss(now);
        this.reinsert(id, missGap(this.queue.length, this.gaps));
      }

      this.persist();
      this.flipped = false;
    },

    // Puts a card back `gap` positions down. The gap is already cropped to the
    // rotation's length by schedule.ts, so the clamp here is belt-and-braces
    // against a gap longer than the queue rather than the mechanism that keeps
    // small decks working.
    reinsert(id: string, gap: number) {
      this.queue.splice(Math.min(this.queue.length, gap), 0, id);
    },

    // Snapshots everything a sort can move. Must be called BEFORE the mutation,
    // or the "prior" state it records is the new one.
    pushUndo(id: string) {
      this.undoStack.push({
        id,
        queue: this.queue.slice(),
        card: { ...(this.cards[id] ?? newProgress()) },
      });
      if (this.undoStack.length > UNDO_DEPTH) this.undoStack.shift();
    },

    canGoBack(): boolean {
      return this.undoStack.length > 0;
    },

    // Undoes the LAST sort only — one step per call, not a history browser.
    goBack(): boolean {
      const prev = this.undoStack.pop();
      if (!prev) return false;

      this.queue = prev.queue.slice();
      this.cards[prev.id] = { ...prev.card };

      this.persist();
      this.flipped = false;
      return true;
    },

    /** Wipes this deck's mastery entirely and starts a fresh round. The only way
     *  back into a fully-mastered deck, so it's the one action the caught-up
     *  screen offers. */
    resetProgress() {
      this.cards = {};
      for (const q of this.allQuestions) this.cards[q.id] = newProgress();
      // Written before the restart, not after: start() re-reads the records from
      // Storage, so a wipe that only lived in memory would be read straight back
      // over by the round it was meant to clear.
      this.persist();
      this.start({
        randomOrder: this.randomOrder,
        masteryMode: this.masteryMode,
        forceRestart: true,
      });
    },

    // Records + the in-progress session, written together on every sort (and on
    // start, so a reload can never resume a session the engine has moved past).
    // `known`/`learning` are derived here for the cloud table; `cards` is the
    // real state.
    persist() {
      const state: FlashState = {
        ...derivePiles(this.cards),
        cards: this.cards,
        session: {
          order: this.order,
          queue: this.masteryMode ? this.queue.slice() : undefined,
          currentIdx: this.currentIdx,
          randomOrder: this.randomOrder,
          masteryMode: this.masteryMode,
        },
      };
      Storage.setFlashState(this.deckId, state);
    },
  };
}

export type FlashEngine = ReturnType<typeof createFlashEngine>;
