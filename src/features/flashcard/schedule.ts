// Mastery scheduling policy — the rules, with no engine state and no I/O.
// flashEngine.ts owns the queue and calls into here for every decision about
// where a card sits and when it comes back. Kept separate so the policy can be
// read (and changed) without reading the rotation machinery around it.
//
// The shape of the thing, in one paragraph: a card climbs a three-rung ladder
// inside a single session (three Know Its, spaced further apart each time). The
// third success does NOT mean mastered — it makes the card *provisional* and
// takes it out of the rotation with a due date on the next day. It comes back
// once, cold, in a later session; passing that retires it for good. Everything
// below exists to make those two sentences true.

import type { CardProgress, FlashState } from '../../types';

/**
 * How far down the rotation a card goes after landing on rung 1 and rung 2.
 * There is no third entry because reaching rung 3 removes the card from the
 * session entirely — the gap after the last success is measured in days, not
 * cards, which is the whole point of the mode.
 *
 * Sized so the card genuinely leaves working memory: a 5-card gap is ~40
 * seconds, which tests recognition rather than recall and is exactly the
 * illusion-of-competence this mode is meant to defeat.
 */
export const LADDER_GAPS = [6, 14] as const;

/**
 * A missed card comes back almost immediately, but that re-show is a *relearn
 * touch*, not a rung: passing it only clears the relearning flag. Without this
 * split the first success of every streak would be the one taken 20 seconds
 * after seeing the answer — systematically the least meaningful retrieval in
 * the system, and the one gating entry to the whole ladder.
 */
const RELEARN_GAP_MIN = 2;
const RELEARN_GAP_SPAN = 2; // → 2 or 3 cards later

/**
 * When the live rotation is shorter than the gap being asked for, it's padded
 * with already-learned cards so the gap is honoured anyway. Without this the
 * intervals silently collapse exactly when they matter most: late in a session
 * only the hard cards remain, so "14 cards later" degrades to "3 cards later"
 * at the moment a card is being certified.
 *
 * Budgeted rather than unlimited — honouring a 14-gap with three cards left
 * would otherwise pull eleven extra reviews and stretch a session well past
 * what the student was told it would be. Each card is filler at most once, so
 * this is a per-session ceiling on total extra retrievals.
 */
export const FILLER_BUDGET = 12;

/**
 * A second miss in the same session resets the ladder instead of costing one
 * rung. One slip is a slip; two on the same card in one sitting means it isn't
 * learned and the streak shouldn't be worth anything.
 */
const HARD_RESET_LAPSES = 2;

/**
 * Floor on the gap between going provisional and the cold check. The rule is
 * "start of the next local day", but studying at 11:50pm would otherwise make a
 * card due ten minutes later and call it a day's retention.
 */
const MIN_COLD_CHECK_MS = 8 * 60 * 60 * 1000;

export function newProgress(): CardProgress {
  return { step: 0, lapses: 0, dueAt: null, lastSeen: null, mastered: false };
}

/** Start of the next local day, but never sooner than MIN_COLD_CHECK_MS from now. */
export function nextDueAt(now: Date = new Date()): string {
  const nextDay = new Date(now);
  nextDay.setHours(0, 0, 0, 0);
  nextDay.setDate(nextDay.getDate() + 1);
  const floor = now.getTime() + MIN_COLD_CHECK_MS;
  return new Date(Math.max(nextDay.getTime(), floor)).toISOString();
}

/** A provisional card is due once its cold-check time has passed. */
export function isDue(p: CardProgress, now: Date = new Date()): boolean {
  if (p.mastered || p.step !== 3 || !p.dueAt) return false;
  const due = Date.parse(p.dueAt);
  return Number.isNaN(due) || due <= now.getTime();
}

/** Where a card goes after a Know It that isn't a cold check. */
export function advance(p: CardProgress, now: Date = new Date()): CardProgress {
  const step = Math.min(3, p.step + 1) as CardProgress['step'];
  return {
    ...p,
    step,
    lastSeen: now.toISOString(),
    dueAt: step === 3 ? nextDueAt(now) : null,
  };
}

/** Where a card goes after a Still Learning. */
export function lapse(p: CardProgress, now: Date = new Date()): CardProgress {
  const lapses = p.lapses + 1;
  const step = (lapses >= HARD_RESET_LAPSES ? 0 : Math.max(0, p.step - 1)) as CardProgress['step'];
  return { ...p, step, lapses, dueAt: null, mastered: false, lastSeen: now.toISOString() };
}

/** Passing the cold check — the only way a card ever retires. */
export function retire(p: CardProgress, now: Date = new Date()): CardProgress {
  return { ...p, step: 3, mastered: true, dueAt: null, lastSeen: now.toISOString() };
}

/** How far down the rotation a card at this rung should be reinserted. */
export function gapFor(step: CardProgress['step']): number {
  return LADDER_GAPS[step - 1] ?? LADDER_GAPS[0];
}

export function relearnGap(): number {
  return RELEARN_GAP_MIN + Math.floor(Math.random() * RELEARN_GAP_SPAN);
}

export interface MasteryPartition {
  /** Provisional and due — these run FIRST, one hit each, then they retire. */
  coldCheck: string[];
  /** Rungs 0-2, including never-seen cards. The body of the session. */
  ladder: string[];
  /** Provisional but not due yet — deliberately excluded from this session. */
  waiting: string[];
  /** Already retired. Never scheduled again; only ever used as rotation filler. */
  retired: string[];
}

/**
 * Splits a deck's cards into what this session should do with each. Order
 * within each bucket is preserved from `ids`, so the caller's shuffle carries
 * through rather than being re-randomised here.
 */
export function partition(
  ids: string[],
  cards: Record<string, CardProgress>,
  now: Date = new Date(),
): MasteryPartition {
  const out: MasteryPartition = { coldCheck: [], ladder: [], waiting: [], retired: [] };
  for (const id of ids) {
    const p = cards[id] ?? newProgress();
    if (p.mastered) out.retired.push(id);
    else if (p.step === 3) (isDue(p, now) ? out.coldCheck : out.waiting).push(id);
    else out.ladder.push(id);
  }
  return out;
}

/** Earliest cold check still in the future, or null when nothing is waiting. */
export function nextDueDate(
  ids: string[],
  cards: Record<string, CardProgress>,
  now: Date = new Date(),
): string | null {
  let soonest: number | null = null;
  for (const id of ids) {
    const p = cards[id];
    if (!p || p.mastered || p.step !== 3 || !p.dueAt) continue;
    const t = Date.parse(p.dueAt);
    if (Number.isNaN(t) || t <= now.getTime()) continue;
    if (soonest === null || t < soonest) soonest = t;
  }
  return soonest === null ? null : new Date(soonest).toISOString();
}

/**
 * Local calendar day as YYYY-MM-DD. Deliberately local and deliberately not an
 * ISO instant: "did I already do today's round?" is a question about the day the
 * student is living in, not about a UTC boundary.
 */
export function localDayKey(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** "later today" / "tomorrow" / "in 3 days" — calendar days, not 24h blocks. */
export function describeDue(iso: string, now: Date = new Date()): string {
  const days = calendarDaysBetween(now, new Date(iso));
  if (days <= 0) return 'later today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

// Math.round rather than floor, so the 23- and 25-hour days either side of a
// DST change don't report as a day short or a day long.
function calendarDaysBetween(from: Date, to: Date): number {
  const a = new Date(from);
  a.setHours(0, 0, 0, 0);
  const b = new Date(to);
  b.setHours(0, 0, 0, 0);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** What Home shows per flashcard deck. Counted against `ids` — the deck's own
 *  cards — so a re-imported deck's leftover records can't inflate the numbers. */
export interface MasteryTally {
  total: number;
  mastered: number;
  /** Provisional cards whose cold check is available now. */
  due: number;
  /** Started but not yet provisional. */
  inProgress: number;
}

export function tally(
  ids: string[],
  cards: Record<string, CardProgress>,
  now: Date = new Date(),
): MasteryTally {
  const p = partition(ids, cards, now);
  return {
    total: ids.length,
    mastered: p.retired.length,
    due: p.coldCheck.length,
    inProgress: p.ladder.filter((id) => (cards[id]?.lastSeen ?? null) !== null).length,
  };
}

/**
 * Back-fills `cards` for state written before the ladder existed — both the old
 * two-array localStorage shape and anything coming down from the cloud, whose
 * table has only the `known`/`learning` columns.
 *
 * Old "known" meant a SINGLE Know It in the one-pass mastery mode, which is a
 * much weaker claim than three-in-a-row. So those cards land as provisional and
 * immediately due: one cold check and they retire, rather than being granted
 * mastery they never demonstrated. Old "learning" cards start the ladder from
 * the bottom, since Still Learning is exactly the claim that they aren't.
 */
export function normalize(state: FlashState, now: Date = new Date()): FlashState {
  if (state.cards) return state;
  const cards: Record<string, CardProgress> = {};
  const stamp = now.toISOString();
  for (const id of state.learning ?? []) {
    cards[id] = { step: 0, lapses: 0, dueAt: null, lastSeen: stamp, mastered: false };
  }
  // Known wins a collision — the old shape allowed an id in both arrays only
  // through a bug, and the more advanced record is the safer one to keep.
  for (const id of state.known ?? []) {
    cards[id] = { step: 3, lapses: 0, dueAt: stamp, lastSeen: stamp, mastered: false };
  }
  return { ...state, cards };
}

/**
 * Rebuilds the legacy `known`/`learning` arrays from the records. These are
 * written on every save purely so the cloud table and Home's existing tally keep
 * working — `cards` is the source of truth.
 */
export function derivePiles(cards: Record<string, CardProgress>): {
  known: string[];
  learning: string[];
} {
  const known: string[] = [];
  const learning: string[] = [];
  for (const [id, p] of Object.entries(cards)) {
    if (p.mastered || p.step === 3) known.push(id);
    else if (p.lastSeen) learning.push(id);
  }
  return { known, learning };
}
