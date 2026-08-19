// Mastery scheduling policy — the rules, with no engine state and no I/O.
// flashEngine.ts owns the queue and calls into here for every decision about
// where a card sits and what a verdict does to it. Kept separate so the policy
// can be read (and changed) without reading the rotation machinery around it.
//
// The shape of the thing, in one paragraph: Mastery is a single-session drill. A
// card needs four Know Its IN A ROW, and each one buries it further down the
// rotation — 5 cards, then 10, then 15, then the whole way to the back — so
// every repeat is a real retrieval rather than a glance at something still in
// working memory. The fourth hit masters it; nothing before that does. A card
// seen for the very first time skips to 3/4 on a hit, so a deck full of things
// the student already knows clears in two passes instead of four. A miss sends
// the card down 3 and wipes the streak to zero. The spacing is fixed rather
// than settable. Mastery persists per deck across sessions, so a later
// round only offers what isn't mastered yet; cards mastered during a round keep
// circulating inside it, which is also what keeps the spacing honest late on,
// when little else is left in the rotation.

import type { CardProgress, FlashState } from '../../types';

/** Hits in a row needed to master a card. */
export const MASTERY_STREAK = 4;

/**
 * Mastery's spacing, in cards: how far down the rotation a card drops after the
 * hit that takes it to streak 1, 2 and 3, plus how far it drops on a miss. There
 * is deliberately no fourth number — the hit that MASTERS a card sends it to the
 * back of the rotation, a position rather than a distance.
 */
export interface MasteryGaps {
  rungs: [number, number, number];
  miss: number;
}

/**
 * The spacing every round runs at. Fixed, not a setting: the whole point of the
 * ladder is that each repeat is far enough out to be a real retrieval, and a
 * number the student can turn down is a number they turn down on the first deck
 * that feels slow. Small decks still get the cropping below, which is the only
 * case where the shape has to give.
 *
 * `miss` is deliberately much shorter than the first rung. A missed card is one
 * the student just saw the answer to, so bringing it back soon closes the loop
 * rather than testing retention — testing retention is what the streak is for.
 */
export const GAPS: MasteryGaps = { rungs: [5, 10, 15], miss: 3 };

export function newProgress(): CardProgress {
  return { streak: 0, lastSeen: null };
}

export function isMastered(p: CardProgress): boolean {
  return p.streak >= MASTERY_STREAK;
}

/** Never given a verdict — in any session, not just this one. */
export function isFresh(p: CardProgress): boolean {
  return p.lastSeen === null;
}

/**
 * A Know It. The first-ever verdict on a card lands it one hit short of mastered
 * in a single step: getting something right with no prior exposure is a far
 * stronger signal than getting it right shortly after being shown the answer, and
 * grinding four passes through cards the student already knew is how a 60-card
 * deck becomes a chore. It still costs a second, spaced retrieval to master —
 * a first look proves recall, not retention.
 */
export function hit(p: CardProgress, now: Date = new Date()): CardProgress {
  const streak = (
    isFresh(p) ? MASTERY_STREAK - 1 : Math.min(MASTERY_STREAK, p.streak + 1)
  ) as CardProgress['streak'];
  return { streak, lastSeen: now.toISOString() };
}

/**
 * A Still Learning. The streak resets outright rather than costing one rung —
 * "three in a row" only means something if a miss breaks the run, and a card that
 * was one hit from mastered but couldn't be recalled has shown exactly as much as
 * a card at zero. This also un-masters a mastered card that comes back around and
 * fails, which is the whole reason they keep circulating.
 *
 * Takes no prior record, unlike `hit()`: where a miss sends a card is the same
 * answer whatever it had built up, which is the rule.
 */
export function miss(now: Date = new Date()): CardProgress {
  return { streak: 0, lastSeen: now.toISOString() };
}

/**
 * Gaps scale down when the rotation is too short to honour them, keeping the
 * 1:2:3 shape rather than clamping each one to the back of the queue. Clamping
 * would collapse all three rungs onto the same real gap on a small deck, which
 * is exactly where the widening has to survive for the mode to mean anything.
 *
 * Scaled off the longest configured gap, so a rotation of `max` cards or more
 * runs at full spacing and nothing is cropped unnecessarily. `live` is the
 * rotation length with the current card already removed, which makes the longest
 * gap land exactly at the back of the queue on a cropped deck.
 *
 * That last part is load-bearing, not cosmetic: a card only moves toward the
 * front when another card is put back BEHIND it, so if every gap crops to less
 * than the rotation's length, whatever sits at the tail is never reached and the
 * round can't end. Cropping the longest gap to `live` (rather than `live - 1`)
 * is what guarantees the back of the queue keeps being reachable.
 */
function cropScale(live: number): number {
  const max = Math.max(...GAPS.rungs, GAPS.miss);
  if (max <= 0) return 1;
  return Math.min(1, Math.max(0, live / max));
}

// Ceil, not round: rounding sends the shorter gaps to zero long before the
// longest one crops at all, and a gap of zero re-shows the card immediately.
function crop(gap: number, scale: number): number {
  return Math.max(1, Math.ceil(gap * scale));
}

/**
 * How far down the rotation a card that just reached `streak` should go. Only
 * ever asked about the hits BELOW mastery — the mastering hit goes to the back
 * of the queue, which is the engine's call to make, not a gap — so the clamp is
 * to the number of rungs rather than to MASTERY_STREAK.
 */
export function gapFor(streak: number, live: number): number {
  const rung = GAPS.rungs[Math.min(Math.max(streak, 1), GAPS.rungs.length) - 1];
  return crop(rung, cropScale(live));
}

/** How far down a missed card goes. */
export function missGap(live: number): number {
  return crop(GAPS.miss, cropScale(live));
}

export interface MasteryPartition {
  /** Not mastered — this round's actual work. */
  work: string[];
  /** Mastered in an earlier session. Left out of the round entirely: there is
   *  nothing to do with them, and offering them would bury the cards that need
   *  the work. They come back only if the student resets the deck. */
  done: string[];
}

/**
 * Splits a deck by what this session should do with each card. Order within each
 * bucket is preserved from `ids`, so the caller's shuffle carries through rather
 * than being re-randomised here.
 */
export function partition(ids: string[], cards: Record<string, CardProgress>): MasteryPartition {
  const out: MasteryPartition = { work: [], done: [] };
  for (const id of ids) {
    const p = cards[id] ?? newProgress();
    (isMastered(p) ? out.done : out.work).push(id);
  }
  return out;
}

/** What Home shows per flashcard deck. Counted against `ids` — the deck's own
 *  cards — so a re-imported deck's leftover records can't inflate the numbers. */
export interface MasteryTally {
  total: number;
  mastered: number;
  /** Started but not yet mastered. */
  inProgress: number;
}

export function tally(ids: string[], cards: Record<string, CardProgress>): MasteryTally {
  const { work, done } = partition(ids, cards);
  return {
    total: ids.length,
    mastered: done.length,
    inProgress: work.filter((id) => !isFresh(cards[id] ?? newProgress())).length,
  };
}

/**
 * Back-fills `cards` for state written before the current streak model — the old
 * two-array localStorage shape, the ladder shape that replaced it, and anything
 * coming down from the cloud (whose table has only `known`/`learning`).
 *
 * Both paths land on the same idea: a card keeps the streak its past record
 * actually demonstrated, and no more. Old "known" meant a single Know It, which
 * is worth exactly what a first-attempt hit is worth here — 3, one spaced
 * retrieval short of mastered. Ladder records map rung for rung; its bar was
 * three hits, so one that had cleared it stays mastered and an unfinished one
 * lands one hit short.
 */
export function normalize(state: FlashState, now: Date = new Date()): FlashState {
  if (state.cards && !needsUpgrade(state)) return state;
  const stamp = now.toISOString();

  if (state.cards) {
    // The mastered ids as of the write, which is what tells an older model's
    // FINISHED card apart from this model's nearly-finished one.
    const wasMastered = new Set(state.known ?? []);
    const cards: Record<string, CardProgress> = {};
    for (const [id, raw] of Object.entries(state.cards)) {
      const old = raw as CardProgress & { step?: number; mastered?: boolean };
      const earned = old.streak ?? (old.mastered ? MASTERY_STREAK : (old.step ?? 0));
      // A streak of 3 WAS mastery under the three-hit model this replaced (hence
      // the bare 3 — it's a historical number, not the current bar). Taken at
      // face value every card finished under that model would come back as 3/4,
      // and a mastered deck would reopen as a full round. `known` separates the
      // two exactly: under the current model a 3/4 card is in `learning` and
      // never in `known`, so this can't misfire, and it stops firing on its own
      // once the state has been rewritten.
      const streak = earned === 3 && wasMastered.has(id) ? MASTERY_STREAK : earned;
      cards[id] = {
        streak: Math.max(0, Math.min(MASTERY_STREAK, streak)) as CardProgress['streak'],
        lastSeen: old.lastSeen ?? stamp,
      };
    }
    return { ...state, cards };
  }

  const cards: Record<string, CardProgress> = {};
  for (const id of state.learning ?? []) cards[id] = { streak: 0, lastSeen: stamp };
  // Known wins a collision — the old shape allowed an id in both arrays only
  // through a bug, and the more advanced record is the safer one to keep.
  for (const id of state.known ?? [])
    cards[id] = { streak: (MASTERY_STREAK - 1) as CardProgress['streak'], lastSeen: stamp };
  return { ...state, cards };
}

// Two shapes need lifting: a record from the ladder era has `step` and no
// `streak`, and one from the three-hit model sits at streak 3 while `known` says
// it was mastered. Checked per record rather than per state, since a merge from
// the cloud can leave a deck holding some of each.
function needsUpgrade(state: FlashState): boolean {
  const mastered = new Set(state.known ?? []);
  for (const [id, raw] of Object.entries(state.cards ?? {})) {
    const streak = (raw as { streak?: number }).streak;
    if (streak === undefined) return true;
    if (streak === 3 && mastered.has(id)) return true;
  }
  return false;
}

/**
 * The inverse of `derivePiles` — the shape a deck's state takes when it comes
 * back from somewhere that can only carry the two arrays (the cloud table has
 * no `cards` column). `known` there means MASTERED, because derivePiles only
 * ever puts mastered cards in it.
 *
 * Deliberately not folded into `normalize`'s legacy path, which reads the same
 * two arrays and must keep reading them the old way: in state written before
 * the streak model, `known` meant one Know It, worth 3. The two shapes are
 * indistinguishable by inspection, so the caller — which knows where the state
 * came from — is what tells them apart.
 */
export function fromPiles(
  known: string[] = [],
  learning: string[] = [],
  now: Date = new Date(),
): FlashState {
  const stamp = now.toISOString();
  const cards: Record<string, CardProgress> = {};
  for (const id of learning) cards[id] = { streak: 0, lastSeen: stamp };
  // Mastered wins a collision, as in normalize: an id in both arrays is only
  // reachable through a bug, and the more advanced record is the safer keep.
  for (const id of known) cards[id] = { streak: MASTERY_STREAK, lastSeen: stamp };
  return { known: [...known], learning: [...learning], cards };
}

/**
 * Rebuilds the legacy `known`/`learning` arrays from the records. Written on
 * every save purely so the cloud table keeps working — `cards` is the real state.
 */
export function derivePiles(cards: Record<string, CardProgress>): {
  known: string[];
  learning: string[];
} {
  const known: string[] = [];
  const learning: string[] = [];
  for (const [id, p] of Object.entries(cards)) {
    if (isMastered(p)) known.push(id);
    else if (p.lastSeen) learning.push(id);
  }
  return { known, learning };
}
