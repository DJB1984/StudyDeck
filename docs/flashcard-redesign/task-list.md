---
type: task-list
project: StudyDeck
date: 2026-08-15
status: draft
tags: [studydeck, claude-code, implementation, flashcard-redesign]
---

Hand this file to [[Claude Code]] along with `PRD.md` and `design-doc.md` (this folder). Work phase by phase — each phase should leave the app in a working, typecheck-clean state before moving to the next. Run `npm run typecheck` and exercise the feature in the dev server after each phase before moving on. Update `src/features/flashcard/Flashcard.spec.md` (R12/R13 revisions, new requirements for session-resume, Back, and mastery mode) as behavior changes land, not as a final catch-up pass — and update `docs/core/design-doc.md`'s Flashcard sections + the `FlashState` shape once the whole batch ships, per CLAUDE.md's sync instruction.

---

## Phase 1 — Session Persistence (Resume on Reload)

**Goal:** Reloading mid-round resumes the same card and settings instead of restarting. This is the single highest-leverage fix for "hard to keep track of where your flashcards are."

- [x] Add optional `session` field to `FlashState` in `src/types.ts` per the design doc's shape (`order`, `currentIdx`, `drillMode`, `randomOrder`, `masteryMode` — `queue` added in Phase 3, not yet needed here)
- [x] `flashEngine.ts`: `persist()` writes `session` alongside `known`/`learning` on every `sortCard()` call
- [x] `flashEngine.ts`: `start()` resumes from a saved unfinished `session` instead of always starting fresh, unless `options.forceRestart` is set; add `sessionIsFinished()` helper (`currentIdx >= order.length`)
- [x] `FlashStartOptions`: add `forceRestart?: boolean`; wire "Restart All" and the Drill/Random toggle handlers in `FlashcardScreen.tsx` to pass `forceRestart: true` (they still reset to the top, per existing R7 — only a bare reload/re-entry with unchanged settings resumes)
- [x] Revise `Flashcard.spec.md` R12: entry into `FlashcardScreen` resumes an in-progress session if one exists and is unfinished; falls back to today's fresh full-deck session otherwise. Update the change log.
- [x] Verify: sort a few cards, reload the browser, confirm you land back on the same card with the same piles and the same Drill/Random toggle state; confirm "Restart All" still genuinely restarts from card 1

---

## Phase 2 — Back (Undo Last Sort)

**Goal:** A student can correct a misclick without losing later progress.

- [x] `flashEngine.ts`: add `undoStack` and `pushUndo(id)`, called at the top of `sortCard()` before mutating `known`/`learning`
- [x] `flashEngine.ts`: add `goBack()` restoring the popped entry's prior known/learning membership and decrementing `currentIdx` (linear mode only in this phase — mastery-mode requeue handling lands in Phase 3)
- [x] `FlashcardScreen.tsx`: add a Back button next to Know It / Still Learning, disabled when `undoStack.length === 0` or a sort animation is in flight (same `sortingRef` guard as existing sort debounce) — **labeled "Undo"**, not "Back", to avoid colliding with the header's exit-to-Home "← Back"
- [x] Add Left Arrow keyboard shortcut for Back (extends the existing Space/Enter-only `keydown` listener), disabled under the same conditions as the button
- [x] Update `Flashcard.spec.md` with the new Back requirement, including the debounce-guard caution (R17)
- [x] Verify: sort a card Know It, click Back, confirm it returns to unsorted/prior state and `currentIdx` moves back exactly one; confirm Back is disabled immediately after landing on a fresh session (nothing to undo) and while a sort animation is playing

---

## Phase 3 — "Study Until Mastered" (Opt-In Interleaving)

**Goal:** An opt-in mode where Still Learning cards interweave into the rotation until every card is Known — off by default, today's single-pass flow unchanged when off.

- [x] `flashEngine.ts`: add `masteryMode` state, `queue`, `startMastery()`, `currentCardMastery()`, `sortCardMastery()` per the design doc (Still Learning re-inserts 3-6 positions later; Know It removes permanently)
- [x] `sortCard()` dispatches to `sortCardMastery` vs. today's linear body based on `this.masteryMode` — confirm this preserves `Flashcard.spec.md` R5 (still exactly one call site decides pile assignment)
- [x] `isComplete()` branches on mode: `queue.length === 0` for mastery, existing `currentIdx >= order.length` for linear
- [x] Add `progressMastery()` (`{ mastered, remaining }`); `FlashcardScreen.tsx` renders `"{mastered} mastered · {remaining} left"` instead of `"Card X of Y"` when `masteryMode` is on
- [x] Add the third toggle ("Study Until Mastered") to `.flash-options` in `FlashcardScreen.tsx`, off by default; toggling it, like Drill/Random, restarts the session (`forceRestart: true`)
- [x] Extend `goBack()` (Phase 2) to handle mastery mode: unshift the undone card back to the front of `queue` instead of decrementing `currentIdx`
- [x] Add Right Arrow (Know It) / Down Arrow (Still Learning) keyboard shortcuts, active in both modes
- [x] Verify: with the toggle on, mark a card Still Learning repeatedly and confirm it keeps resurfacing (not just at a round boundary) until marked Know It, and the session only reaches its completion screen once every card in the working set is in `known`; confirm the toggle off reproduces today's exact behavior byte-for-byte (existing R1-R11 tests still pass)

---

## Phase 4 — Deck Overview Grid

**Goal:** A glanceable, clickable view of the whole deck's mastery state, mid-session.

- [ ] Build `src/features/flashcard/FlashOverview.tsx` — portal overlay (same pattern as `HomeScreen.tsx`'s `CopyPromptModal`), one cell per `deck.questions`, colored via existing `--accent`/warm/`--surface` tokens for known/learning/unseen, truncated plain-text `front` label per cell
- [ ] Add an "Overview" button to `FlashcardScreen.tsx`'s `.flash-options` row, opening the overlay
- [ ] Wire cell clicks to jump the session: linear mode sets `currentIdx` to that id's position in `order` (no-op/dimmed if the id isn't in the current filtered `order`); mastery mode moves the id to the front of `queue`, inserting it if it had already exited via Know It
- [ ] Verify: open the overview mid-session, confirm cell colors match `eng.known`/`eng.learning` exactly, click a still-learning cell and confirm the session jumps straight to it in both linear and mastery mode

---

## Phase 5 — Home Screen Mastery Badge

**Goal:** A student can see roughly how much of a deck they know before opening it.

- [x] `HomeScreen.tsx`: for `file.data.type === 'flashcard'` deck cards, add a `.meta-flash` line reading `{known.length} / {count} known`, sourced live from `Storage.getFlashState(file.title)` on each render — no new persisted value
- [x] Verify: a never-opened flashcard deck shows `0 / N known`; a deck studied to completion shows `N / N known`; a quiz deck's card is unaffected (no third line)

> Shipped 2026-08-15. Deviation: the count filters the pile against `file.data.questions` instead of using `state.known.length` directly — a re-imported/edited deck can leave known ids for questions it no longer contains, which would have rendered e.g. "12 / 8 known". Recorded as `Home.spec.md` R1a (not `Flashcard.spec.md`, since the badge is Home's surface).

---

## Phase 6 — Shuffle Fix

**Goal:** Replace the biased shuffle with a correct one, wherever flashcard order is randomized.

- [x] Replace `ids.sort(() => Math.random() - 0.5)` in `flashEngine.ts` with a Fisher-Yates shuffle, reusing the existing `src/lib/shuffle.ts` helper rather than writing a second implementation
- [x] Use the same helper for mastery mode's initial queue order (Phase 3's `shuffleIfRandom`)
- [x] Verify: no behavior regression when Random is off; visually confirm shuffled order varies across session starts when on

> Shipped 2026-08-15. Phase 3 had already routed both modes through the one `shuffleIfRandom` call (mastery's `queue` is `ids.slice()` of the same shuffled array), so this was a one-line swap inside that helper and no second call site needed changing. Random-off path is untouched — `shuffleIfRandom` still returns `ids` by identity.

---

## Phase 7 — Spec & Design-Doc Sync

**Goal:** Documentation matches shipped behavior, per CLAUDE.md's "keep design-doc.md in sync" instruction.

- [ ] Finalize `src/features/flashcard/Flashcard.spec.md` — confirm all new requirements (session resume, Back, mastery mode, overview grid) are present with `[verify: ui|unit]` tags and cautions matching the existing document's style, and the change log records this whole batch
- [ ] Update `docs/core/design-doc.md`: the "Flashcard screen" description, the `FlashState` localStorage shape, and the `FlashEngine` architecture reference to reflect the new session/queue/undo fields
- [ ] Verify: a fresh read of `docs/core/design-doc.md` alone (without this folder) accurately describes the shipped flashcard behavior
