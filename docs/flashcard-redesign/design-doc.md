---
type: design-doc
project: StudyDeck
date: 2026-08-15
status: draft
tags: [studydeck, design, architecture, flashcard-redesign]
---

## Relationship to the core design doc

This extends `docs/core/design-doc.md`'s Flashcard-related sections (Screens: "Flashcard screen," localStorage schema: "Flashcard piles," App Architecture's `FlashEngine` reference). Once implemented, fold the updated `FlashState` shape and screen description back into `docs/core/design-doc.md` per CLAUDE.md's "keep design-doc.md in sync" instruction — that sync is a follow-up edit, not part of this doc itself. This document is the working design for the redesign batch; `docs/core/design-doc.md` remains the long-term source of truth once shipped.

All changes here are additive to `FlashState` and `FlashStartOptions` — every field is optional, so any `studydeck_flash_{title}` blob written by today's app (`{known: [], learning: []}`) continues to parse and behave exactly as it does now. `src/features/flashcard/Flashcard.spec.md`'s R1–R11 are unaffected; R12 and R13 are revised (see below).

## Engine changes (`src/features/flashcard/flashEngine.ts`)

### 1. Session persistence (resume on reload)

`FlashState` (`src/types.ts`) gains an optional `session` field:

```ts
export interface FlashState {
  known: string[];
  learning: string[];
  session?: {
    order: string[];        // linear mode
    queue?: string[];       // mastery mode only (see §3)
    currentIdx: number;     // linear mode position; unused in mastery mode
    drillMode: 'all' | 'learning';
    randomOrder: boolean;
    masteryMode: boolean;
  };
}
```

`persist()` writes `session` alongside `known`/`learning` on every `sortCard()` call (same call site as today, no new persistence trigger needed). `start()` changes to prefer resuming:

```ts
start(options: FlashStartOptions = {}) {
  const state = Storage.getFlashState(this.title);
  this.known = new Set(state.known);
  this.learning = new Set(state.learning);

  if (!options.forceRestart && state.session && !sessionIsFinished(state.session)) {
    // Resume: restore order/queue/currentIdx/toggles from the saved session
    // instead of recomputing from scratch.
    this.restoreSession(state.session);
    return;
  }

  // ...today's fresh-start logic unchanged, using options.drillMode/randomOrder/masteryMode...
}
```

`sessionIsFinished` is true when `currentIdx >= order.length` (linear) or `queue.length === 0` (mastery) — i.e. don't resume into a round that already completed; fall through to a fresh start instead.

`FlashStartOptions` gains `forceRestart?: boolean`, set by "Restart All" and by toggling Drill/Random/Mastery (those still restart from the top, per existing R7 — a resume is only for *unchanged* re-entry, e.g. a reload or Back-then-reopen with the same settings).

### 2. Revises `Flashcard.spec.md` R12/R13

R12 currently mandates a **fresh full-deck session on every entry**, drill/random off. This is the behavior directly responsible for "reload loses your place." Revised: entry into `FlashcardScreen` for a deck **resumes an in-progress session if one is saved and unfinished** (same resume path as a reload — entry and reload become the same code path, since both just call `start()` on a fresh engine instance). If no session is saved, or the saved one already finished, entry falls back to today's fresh full-deck session, drill/random/mastery all off. R13 (Back exits to Home) is unchanged in destination, but no longer implies losing progress — Back exits, and the next entry resumes.

### 3. "Study Until Mastered" (opt-in interleaving)

`masteryMode`, alongside the existing Drill/Random toggles in `FlashcardScreen.tsx` — **off by default**, per the PRD's explicit call that today's single-pass-then-choose flow stays the default. When on, the engine switches from the linear `order`/`currentIdx` walk to a queue:

```ts
// Mastery mode only. Cards sorted "known" are removed from the queue;
// cards sorted "learning" are requeued at a randomized later position
// (not immediately next, so it doesn't just become "keep re-showing the
// same card"), instead of only recirculating at round-end.
queue: string[] = [];

startMastery(ids: string[]) {
  this.queue = shuffleIfRandom(ids, this.randomOrder);
},

currentCardMastery(): FlashCard | null {
  return this.queue.length ? this.byId(this.queue[0]) : null;
},

sortCardMastery(pile: 'known' | 'learning') {
  const id = this.queue.shift()!;
  if (pile === 'known') {
    this.known.add(id); this.learning.delete(id); this.roundKnown.add(id);
  } else {
    this.learning.add(id); this.known.delete(id); this.roundLearning.add(id);
    const insertAt = Math.min(this.queue.length, 3 + Math.floor(Math.random() * 4)); // 3-6 cards later
    this.queue.splice(insertAt, 0, id);
    this.roundLearning.add(id); // may already be marked known-in-this-round earlier — see caution below
  }
  this.persist();
  this.flipped = false;
}
```

`isComplete()` in mastery mode is `this.queue.length === 0` — the session doesn't reach completion until every card in the working set has been sorted Know It at least once, satisfying the PRD's success criterion directly. `sortCard()` stays the single call site `FlashcardScreen.tsx` invokes; it dispatches to `sortCardMastery` when `this.masteryMode` is true, `sortCardLinear` (today's existing body) otherwise — preserving `Flashcard.spec.md` R5's isolation guarantee (still exactly one place decides pile assignment, just with a mode-dependent body).

**Caution carried into implementation**: a card can flip between known/learning multiple times within one mastery-mode session (sort Know It, later — no, it can't resurface after Know It since Know It removes it from the queue entirely; only Still Learning requeues). So a card visits the queue exactly once more per Still Learning sort, and exits for good on a Know It sort — no risk of a known card resurfacing and getting double-counted in `roundKnown`.

Progress display changes for mastery mode: `progress()` returns `{ current, total }` for linear mode as today; add `progressMastery(): { mastered: number; remaining: number }` — `mastered` = cards in `roundKnown` this session, `remaining` = `queue.length` (deduplicated by id, since a Still-Learning card can appear once in `queue` but represents one card regardless of requeue count). `FlashcardScreen.tsx` renders `"{mastered} mastered · {remaining} left"` instead of `"Card {current} of {total}"` when `masteryMode` is on, since "Card X of Y" implies a fixed linear position that doesn't hold once cards can requeue.

**UI (amended 2026-08-16):** `masteryMode` and `drillMode` are no longer two checkboxes ("Study until mastered", "Drill Still Learning only"). They're one three-up segmented pill — **Standard | Piles | Mastery** — with a sliding thumb, above the surviving Random-order toggle, plus a one-line hint under the row describing the selected mode. Checkboxes left the default modes unnamed, so both read as add-ons rather than as the three ways a round actually runs.

**Piles removed (2026-08-16, same day):** the pill is now two-up — **Standard | Mastery**. `drillMode` is gone from the engine and from `FlashStartOptions`; every round runs over the whole deck, and `isBrowseMode()` is just `!masteryMode`. Removing the one mode that narrowed the working set made the whole linear sorting path unreachable, so `sortCardLinear()`, `continueWithRoundLearning()` (and its "Continue with Still Learning" button — Mastery can never end with cards outstanding), the `customDeck` start option and the linear branches of `goBack()`/`restoreSession()` went with it. `FlashSession.drillMode` survives as an optional legacy field, read only so `restoreSession()` can reject a saved Piles round (its `order` is a subset of the deck) instead of resuming one nothing can walk. The paragraphs below describe the three-mode design as shipped that morning.

The engine contract is unchanged: `drillMode` and `masteryMode` remain two independent fields (they're separate concerns down there — which cards are in the working set vs. how the round walks it), and the pill writes both through the same `start({ forceRestart: true })` path. `FlashcardScreen` owns the projection: Standard = `{ drillMode: 'all', masteryMode: false }`, Piles = `{ drillMode: 'learning', masteryMode: false }`, Mastery = `{ drillMode: 'all', masteryMode: true }`. The learning-subset-under-mastery combination is no longer reachable from the UI — it was available before and effectively unused, and "master the cards I'm still learning" is what "Continue with Still Learning" already does at round end. A session saved by the old UI carrying both flags still resumes and runs correctly; the pill reads Mastery until the next explicit mode pick. Standard is still the default. See DESIGN.md → Components → Segmented Pill.

### 4. Back / undo-last-sort

New engine method, used by both linear and mastery modes:

```ts
undoStack: { id: string; wasKnown: boolean; wasLearning: boolean }[] = [];

// Called at the top of both sortCard bodies, before mutating known/learning.
pushUndo(id: string) {
  this.undoStack.push({ id, wasKnown: this.known.has(id), wasLearning: this.learning.has(id) });
},

goBack() {
  const prev = this.undoStack.pop();
  if (!prev) return; // nothing to undo — Back is disabled in the UI in this state
  if (prev.wasKnown) { this.known.add(prev.id); this.roundKnown.delete(prev.id); }
  else { this.known.delete(prev.id); }
  if (prev.wasLearning) { this.learning.add(prev.id); }
  else { this.learning.delete(prev.id); this.roundLearning.delete(prev.id); }

  if (this.masteryMode) {
    this.queue.unshift(prev.id); // whatever requeue position it had, put it back at the front
  } else {
    this.currentIdx--;
  }
  this.persist();
  this.flipped = false;
}
```

`FlashcardScreen.tsx` shows a "Back" button (mirroring Quiz's always-visible Back) disabled when `eng.undoStack.length === 0` or `sortingRef.current` is true (same 350ms-debounce guard flip/sort already respect, per `Flashcard.spec.md` R1/R2's cautions — Back must respect the same lock so it can't race an in-flight sort animation). Going back is a pure undo of the *last* sort action — it does not chain further back than one step per click, matching the PRD's "correct a misclick" scope (not a full history browser; that's what the overview grid is for).

## Deck overview grid

New component, `src/features/flashcard/FlashOverview.tsx`, rendered as an overlay (same portal-to-`document.body` pattern already used by `CopyPromptModal` in `HomeScreen.tsx`) opened via a new "Overview" button in `FlashcardScreen`'s `.flash-options` row.

- Renders one cell per `deck.questions`, labeled with a truncated `front` (KaTeX stripped/plain-text for legibility at grid scale — full KaTeX rendering per cell isn't necessary at this size and would be expensive for large decks).
- Cell color: known → `--accent` (Starlight Blue) fill, learning → a warm/amber existing token, unseen (in neither pile) → neutral `--surface`. No new colors — reuse `src/theme/tokens.css` tokens per CLAUDE.md's constraint against introducing new colors.
- Data source: `eng.known` / `eng.learning` directly (already in memory) — no new Storage read, no new persisted shape beyond `FlashState` above.
- Clicking a cell jumps the session directly to that card: in linear mode, sets `currentIdx` to that id's index in `order` (if the id isn't in the current `order` — e.g. it's excluded by an active Drill filter — jumping is a no-op, cell shows as disabled/dimmed for filtered-out cards); in mastery mode, moves that id to the front of `queue` (adding it if it had already exited via Know It, since re-visiting a known card to review it doesn't have to re-sort it — flipping still works, sorting it again just re-applies whichever pile the student picks). Closes the overlay after jumping.

## Home screen mastery badge

`src/features/home/HomeScreen.tsx`'s `.file-card` rendering (currently `{file.count} questions · {file.lastOpened}`) gains a conditional third line for flashcard decks:

```tsx
{file.data.type === 'flashcard' && (() => {
  const state = Storage.getFlashState(file.title);
  return <div className="meta-flash">{state.known.length} / {file.count} known</div>;
})()}
```

This is a **live snapshot read**, not a new stored value — `Storage.getFlashState` already exists and already defaults safely to `{known: [], learning: []}` for a deck with no saved state (a never-opened flashcard deck correctly shows "0 / N known"). No change to `Storage.ts` needed for this piece. Explicitly not a trend/history (per PRD non-goals) — it's recomputed fresh every time `HomeScreen` renders, same as `file.count`/`file.lastOpened` are.

## Shuffle fix

Both the existing linear shuffle (`ids.sort(() => Math.random() - 0.5)`, `flashEngine.ts`) and the new mastery-mode `shuffleIfRandom` helper use a proper Fisher-Yates shuffle instead of the statistically-biased comparator-based pattern. One small shared helper (e.g. `src/lib/shuffle.ts`, which already exists per CLAUDE.md's module list for quiz question-order shuffling — reuse it rather than adding a second shuffle implementation) is used by both.

## Keyboard shortcuts

Extends the existing `keydown` listener in `FlashcardScreen.tsx` (currently Space/Enter = flip only): add Left Arrow = Back (when enabled), Right Arrow = Know It, Down Arrow = Still Learning — chosen to not collide with Space/Enter and to roughly mirror Quiz's directional Back/Next-adjacent muscle memory, without claiming Quizlet's exact bindings (Quizlet uses arrows for navigation and a separate "3" key for reveal-both, which doesn't map cleanly onto StudyDeck's binary sort actions).

## Explicitly out of scope

- `Deck.inputMode: 'type'` — untouched. No UI reads it; the field stays a dormant schema stub.
- No new `src/features/stats/` integration — flashcard sessions still produce no persisted record; the Round Complete screen (`FlashcardScreen.tsx`) stays the only session summary, unchanged in kind (only its progress-text source changes per mastery mode, per §3 above).
- No changes to `Storage.deleteFile()`'s atomicity contract — the new `session` field lives inside the same `studydeck_flash_{title}` key it already deletes, so no additional cleanup path is needed.
