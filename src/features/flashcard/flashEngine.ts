// Flashcard engine — rotation + persistence.
// A mutable object (reused across renders via a ref) that mirrors the legacy
// FlashEngine. Progress is keyed by question `id`, never index, so it survives
// deck reordering. sortCard() is the ONLY method that changes a card's standing,
// and every rule it applies comes from schedule.ts — keep it that way.
//
// Mastery is a two-stage mode, and the split is the whole design (see
// schedule.ts for the rationale): three spaced Know Its inside one session make
// a card *provisional*, and one cold hit on a later day retires it. A session
// therefore runs the cold checks it owes first, then works the ladder, and
// deliberately does NOT show provisional cards that aren't due yet.

import type { CardProgress, FlashCard, FlashSession, FlashState } from '../../types';
import { Storage } from '../../lib/Storage';
import { shuffleArray } from '../../lib/shuffle';
import {
  FILLER_BUDGET,
  advance,
  derivePiles,
  gapFor,
  lapse,
  localDayKey,
  newProgress,
  nextDueDate,
  normalize,
  partition,
  relearnGap,
  retire,
} from './schedule';

export interface FlashStartOptions {
  randomOrder?: boolean;
  /** Run the mastery ladder instead of a plain browse. */
  masteryMode?: boolean;
  /** Skip the saved-session resume and start a fresh round from the top. */
  forceRestart?: boolean;
}

// Undo has to put back more than a pile membership now: a sort can pull filler
// cards into the rotation and move the card itself an arbitrary distance down
// it, none of which is recoverable from the card's record alone. Snapshotting
// the queue is far cheaper to get right than replaying the mutation backwards.
interface UndoFrame {
  id: string;
  queue: string[];
  fillerUsed: string[];
  card: CardProgress;
  wasColdCheck: boolean;
  wasRelearning: boolean;
  wasLearned: boolean;
}

const UNDO_DEPTH = 30;

// The single shuffle site for both modes' starting order — mastery's queue is
// carved out of the same shuffled `ids`, so there's one randomization here and
// not a second one per mode. Uses lib/shuffle's Fisher-Yates rather than a
// `sort(() => Math.random() - 0.5)` comparator, which is measurably biased
// toward leaving cards near where they started.
function shuffleIfRandom(ids: string[], random: boolean): string[] {
  return random ? shuffleArray(ids) : ids;
}

// A saved session is "finished" when its round already ran out of cards — don't
// resume into a completed round, fall through to a fresh start instead. Mastery
// walks `queue` rather than `order`/`currentIdx`, so it finishes on an empty
// queue instead of on a run off the end.
export function sessionIsFinished(session: FlashSession): boolean {
  if (session.masteryMode) return (session.queue?.length ?? 0) === 0;
  return session.currentIdx >= session.order.length;
}

export function createFlashEngine(deckId: string, allQuestions: FlashCard[]) {
  return {
    deckId,
    allQuestions,
    deck: [] as FlashCard[],
    order: [] as string[],
    currentIdx: 0,
    // Mastery only: the live rotation. A card leaves it by going provisional
    // (three in a row) or by passing its cold check; it re-enters further down
    // on anything else.
    queue: [] as string[],
    /** Every card's standing, for the whole deck — not just this session's working set. */
    cards: {} as Record<string, CardProgress>,
    /** Provisional cards whose cold check came due — one Know It retires them. */
    coldCheck: new Set<string>(),
    /** Cards awaiting a relearn touch; their next Know It restores rather than advances. */
    relearning: new Set<string>(),
    /** Cards pulled in as rotation filler — each is eligible only once per session. */
    fillerUsed: new Set<string>(),
    /** Reached provisional or retired during this round, for the tally. */
    learned: new Set<string>(),
    /** Provisional but not due — excluded from this session, shown on the finish screen. */
    waiting: [] as string[],
    flipped: false,
    randomOrder: false,
    masteryMode: false,
    /** Local day the current mastery round began — see FlashSession.startedOn. */
    startedOn: '',
    undoStack: [] as UndoFrame[],

    // A "round" is one pass through `order`: Standard walks it a card at a time
    // and ends by stepping off the last one. Mastery instead runs until `queue`
    // empties, which happens once every due card has been dealt with.
    //
    // R12: entry resumes a saved unfinished session (a reload or a Back-then-
    // reopen lands on the same card with the same options); only an explicit
    // restart (forceRestart) or a finished/stale session starts fresh.
    start(options: FlashStartOptions = {}) {
      const state = normalize(Storage.getFlashState(this.deckId));
      this.cards = { ...(state.cards ?? {}) };
      // Every card in the deck gets a record, so no lookup below has to handle
      // a missing one.
      for (const q of this.allQuestions) {
        if (!this.cards[q.id]) this.cards[q.id] = newProgress();
      }
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

      this.coldCheck = new Set();
      this.relearning = new Set();
      this.fillerUsed = new Set();
      this.learned = new Set();
      this.waiting = [];
      this.currentIdx = 0;
      this.startedOn = localDayKey();

      if (this.masteryMode) {
        // Lapse counts are per-session — a card missed once yesterday shouldn't
        // start today one slip away from a hard reset.
        for (const id of Object.keys(this.cards)) this.cards[id].lapses = 0;

        const split = partition(ids, this.cards);
        // Cold checks run first: they're the point of coming back, and taking
        // them while the student is freshest is what makes them a real test.
        this.order = [...split.coldCheck, ...split.ladder];
        this.queue = this.order.slice();
        this.coldCheck = new Set(split.coldCheck);
        this.waiting = split.waiting;
      } else {
        // Standard browses the whole deck, including retired cards — it records
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
      if (sessionIsFinished(session)) return false;
      // Saved by the removed Piles mode: its `order` is a narrowed working set
      // (Still Learning only), and neither surviving mode walks a subset of the
      // deck that way. Start fresh rather than resume a round nothing can run.
      if (session.drillMode === 'learning') return false;
      // A mastery round belongs to the day it started on. Resuming yesterday's
      // leftover queue would work — but it would skip every cold check that came
      // due overnight, and those are the entire reason the student came back.
      // Starting fresh re-partitions the deck and puts them first.
      if (session.masteryMode && session.startedOn !== localDayKey()) return false;
      const cards = session.order.map((id) => this.allQuestions.find((q) => q.id === id));
      if (cards.some((c) => !c)) return false; // deck edited under the saved order

      const queue = session.queue ?? [];
      // Filler is drawn from outside the working set, so a queued id only has to
      // exist in the deck — not in `order`.
      const inDeck = new Set(this.allQuestions.map((q) => q.id));
      if (session.masteryMode && queue.some((id) => !inDeck.has(id))) return false;

      this.randomOrder = session.randomOrder;
      this.masteryMode = session.masteryMode;
      this.startedOn = session.startedOn ?? localDayKey();
      this.deck = cards as FlashCard[];
      this.order = session.order.slice();
      this.currentIdx = session.currentIdx;
      this.queue = session.masteryMode ? queue.slice() : [];

      // Restored rather than re-derived: which cards are mid-relearn, which are
      // cold checks and which were already pulled as filler are facts about how
      // this session has gone, and the records can't reconstruct any of them.
      this.coldCheck = new Set(session.coldCheck ?? []);
      this.relearning = new Set(session.relearning ?? []);
      this.fillerUsed = new Set(session.fillerUsed ?? []);
      this.learned = new Set(session.learned ?? []);
      this.waiting = this.masteryMode
        ? partition(
            this.allQuestions.map((q) => q.id),
            this.cards,
          ).waiting
        : [];

      this.flipped = false;
      return true;
    },

    currentCard(): FlashCard | null {
      const id = this.masteryMode ? this.queue[0] : this.order[this.currentIdx];
      if (id === undefined) return null;
      return this.allQuestions.find((q) => q.id === id) ?? null;
    },

    /** True when the card on screen is a cold check — a card being tested a day
     *  or more after it was learned. The screen says so, because the stakes and
     *  the honest answer are both different from a mid-ladder repeat. */
    currentIsColdCheck(): boolean {
      const id = this.queue[0];
      return id !== undefined && this.coldCheck.has(id);
    },

    /** True when the card on screen was pulled in only to keep the rotation
     *  honest. It's already learned; a hit costs nothing and a miss un-learns it. */
    currentIsFiller(): boolean {
      const id = this.queue[0];
      return id !== undefined && this.fillerUsed.has(id) && !this.coldCheck.has(id);
    },

    isComplete(): boolean {
      if (this.order.length === 0) return false; // empty working set is its own state
      return this.masteryMode ? this.queue.length === 0 : this.currentIdx >= this.order.length;
    },

    /** Mastery with nothing to do right now: every card is either retired or
     *  provisional-but-not-due. Distinct from an empty deck, and the only place
     *  the mode tells the student when to come back. */
    nothingDue(): boolean {
      return this.masteryMode && this.allQuestions.length > 0 && this.order.length === 0;
    },

    /** ISO time of the soonest cold check still ahead, or null. */
    nextDue(): string | null {
      return nextDueDate(
        this.allQuestions.map((q) => q.id),
        this.cards,
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

    // Mastery's progress. "Card X of Y" implies a fixed linear position that
    // stops holding the moment cards requeue. `remaining` excludes filler (it
    // isn't work the student signed up for) and is deduplicated by id, since a
    // requeued card is still one card.
    progressMastery(): { learned: number; remaining: number; coldChecks: number } {
      const remaining = new Set(this.queue.filter((id) => !this.fillerUsed.has(id)));
      return {
        learned: this.learned.size,
        remaining: remaining.size,
        coldChecks: this.queue.filter((id) => this.coldCheck.has(id)).length,
      };
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
      const p = this.cards[id] ?? newProgress();
      const isColdCheck = this.coldCheck.has(id);
      const isFiller = !isColdCheck && this.fillerUsed.has(id);

      if (pile === 'known') {
        if (isColdCheck) {
          // The one moment mastery is actually awarded.
          this.cards[id] = retire(p, now);
          this.coldCheck.delete(id);
          this.learned.add(id);
        } else if (isFiller) {
          // Already learned; this was free retrieval. Record that it happened
          // and leave the standing alone — filler must never be a shortcut to
          // mastery, or the rotation padding would start certifying cards.
          this.cards[id] = { ...p, lastSeen: now.toISOString() };
        } else if (this.relearning.has(id)) {
          // The relearn touch: closes the loop on a miss without advancing.
          // Passing a card 20 seconds after seeing its answer is recognition,
          // not recall, and it must not be worth a rung.
          this.relearning.delete(id);
          this.cards[id] = { ...p, lastSeen: now.toISOString() };
          this.reinsert(id, gapFor(p.step));
        } else {
          const next = advance(p, now);
          this.cards[id] = next;
          // Rung 3 is provisional, not mastered — it leaves the rotation with a
          // due date instead of being reinserted.
          if (next.step === 3) this.learned.add(id);
          else this.reinsert(id, gapFor(next.step));
        }
      } else {
        this.cards[id] = lapse(p, now);
        this.coldCheck.delete(id);
        this.learned.delete(id);
        this.relearning.add(id);
        this.reinsert(id, relearnGap());
      }

      this.persist();
      this.flipped = false;
    },

    // Puts a card back `gap` positions down, padding the rotation with
    // already-learned cards when it's too short to honour that gap. Without the
    // padding the gaps collapse at exactly the wrong moment — see FILLER_BUDGET.
    reinsert(id: string, gap: number) {
      while (this.queue.length < gap && this.fillerUsed.size < FILLER_BUDGET) {
        const filler = this.takeFiller();
        if (!filler) break;
        this.fillerUsed.add(filler);
        this.queue.push(filler);
      }
      this.queue.splice(Math.min(this.queue.length, gap), 0, id);
    },

    // A learned card (provisional or retired) that isn't already in the rotation
    // and hasn't been used as filler yet. Deliberately drawn from the whole deck
    // rather than this session's working set, so a deck that's nearly finished
    // still has spacers available.
    takeFiller(): string | null {
      const queued = new Set(this.queue);
      for (const q of this.allQuestions) {
        const p = this.cards[q.id];
        if (!p || (!p.mastered && p.step !== 3)) continue;
        if (queued.has(q.id) || this.fillerUsed.has(q.id)) continue;
        return q.id;
      }
      return null;
    },

    // Snapshots everything a sort can move. Must be called BEFORE the mutation,
    // or the "prior" state it records is the new one.
    pushUndo(id: string) {
      this.undoStack.push({
        id,
        queue: this.queue.slice(),
        fillerUsed: Array.from(this.fillerUsed),
        card: { ...(this.cards[id] ?? newProgress()) },
        wasColdCheck: this.coldCheck.has(id),
        wasRelearning: this.relearning.has(id),
        wasLearned: this.learned.has(id),
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
      this.fillerUsed = new Set(prev.fillerUsed);
      this.cards[prev.id] = { ...prev.card };
      if (prev.wasColdCheck) this.coldCheck.add(prev.id);
      else this.coldCheck.delete(prev.id);
      if (prev.wasRelearning) this.relearning.add(prev.id);
      else this.relearning.delete(prev.id);
      if (prev.wasLearned) this.learned.add(prev.id);
      else this.learned.delete(prev.id);

      this.persist();
      this.flipped = false;
      return true;
    },

    // Records + the in-progress session, written together on every sort (and on
    // start, so a reload can never resume a session the engine has moved past).
    // `known`/`learning` are derived here for the cloud table and Home's tally;
    // `cards` is the real state.
    persist() {
      const state: FlashState = {
        ...derivePiles(this.cards),
        cards: this.cards,
        session: {
          order: this.order,
          queue: this.masteryMode ? this.queue.slice() : undefined,
          coldCheck: this.masteryMode ? Array.from(this.coldCheck) : undefined,
          relearning: this.masteryMode ? Array.from(this.relearning) : undefined,
          fillerUsed: this.masteryMode ? Array.from(this.fillerUsed) : undefined,
          learned: this.masteryMode ? Array.from(this.learned) : undefined,
          startedOn: this.masteryMode ? this.startedOn : undefined,
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
