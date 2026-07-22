---
type: task-list
project: StudyDeck
date: 2026-07-21
status: draft
tags: [studydeck, claude-code, implementation, question-types]
---

Hand this file to [[Claude Code]] along with `PRD.md` and `design-doc.md` (this folder). Work phase by phase — each phase should leave the app in a working, typecheck-clean state before moving to the next. Run `npm run typecheck` and exercise the feature in the dev server after each phase before moving on. Update `studydeck-format-spec.md` at the end of each phase so it never drifts from what's actually shipped (it's imported verbatim into the app via `?raw`).

---

## Phase 1 — Shared Infrastructure & Schema Groundwork

**Goal:** The plumbing every later phase depends on exists and is tested in isolation, before any UI is built on top of it.

- [ ] Create `src/lib/answerMatching.ts` with `matchNumeric(input, correctValue, tolerance)` and `matchNormalizedString(input, accepted)` per the design doc's spec (short-flag decomposition, whitespace collapse)
- [ ] Add `answerFormat` discriminator to the `Question` type in `src/types.ts` (`'mcq' | 'numeric' | 'multiSelect' | 'order' | 'graphClick' | 'code' | 'command'`, default `'mcq'`), plus the per-format fields needed by later phases
- [ ] Add optional `table?: TableSpec` field to `types.ts`, sibling to the existing `graph?: GraphSpec`
- [ ] Add optional `inputMode?: 'flip' | 'type'` to the flashcard deck type in `types.ts`
- [ ] Extend `src/lib/DeckValidation.ts` with a validation branch per new `answerFormat`, following the existing specific-actionable-error-string convention — every branch should have a matching unit case even without full UI yet
- [ ] Verify: existing decks in `test-decks/` still validate and load with zero behavior change (default `answerFormat`/`inputMode` preserves current app exactly)

---

## Phase 2 — Structured Selection (Select-All-That-Apply, Drag-to-Order)

**Goal:** The two NCLEX-format question types work end-to-end in Practice, Test, and Stats.

- [ ] `QuizScreen.tsx`: render checkboxes instead of single-select buttons when `answerFormat: 'multiSelect'`; grade as all-or-nothing against the `correct` array
- [ ] Relax the "exactly 4 answers" validation rule in `DeckValidation.ts` specifically for `multiSelect` questions (other formats keep existing rules)
- [ ] Build a small drag-and-drop reorderable list component for `answerFormat: 'order'` questions, using native HTML5 drag events — shuffle `items` on every render, grade exact-sequence match against `correctOrder`
- [ ] Wire both formats into the existing first-attempt-correct stats tracking (`firstAttemptCorrect`, retries in Practice mode) without touching `QuizEngine`'s existing MCQ path
- [ ] Verify: hand-author a small test deck with both formats, complete Practice and Test mode, confirm Stats screen shows correct/incorrect accurately for both

---

## Phase 3 — Numeric Free-Response & Slider

**Goal:** A student can type or drag to a numeric answer and get graded correctly.

- [ ] `QuizScreen.tsx`: render a text `<input>` (or `<input type="range">` for `inputWidget: 'slider'`) in place of answer buttons when `answerFormat: 'numeric'`
- [ ] Wire grading through `answerMatching.matchNumeric`
- [ ] Validate `correctValue`/`tolerance` (and `sliderMin`/`sliderMax`/`sliderStep` when applicable) in `DeckValidation.ts`
- [ ] Verify: a test deck with both text and slider variants grades correctly at, just inside, and just outside the tolerance boundary

---

## Phase 4 — Data Tables

**Goal:** A question can show a real, themed data table as context.

- [ ] Build a `Table` component (new, under `src/components/`) rendering the `TableSpec` — headers/rows, `$...$` KaTeX support per cell, styled to match `src/theme/` tokens, `overflow-x: auto` so wide tables don't break mobile layout
- [ ] Wire it into `QuizScreen.tsx` alongside the existing `Graph` rendering slot — a question may have `table`, `graph`, both, or neither
- [ ] Validate `table` fields in `DeckValidation.ts` (non-empty `headers`, all `rows` matching header length)
- [ ] Verify: a business-style test deck (e.g. a small income statement) renders legibly on both desktop and a narrow mobile viewport

---

## Phase 5 — Graph Click-to-Answer

**Goal:** A student can click directly on a rendered graph to answer, extending the existing `Graph` component.

- [ ] Extend `Graph.tsx`'s `buildChart` to accept `answerMode: 'click'`, `target`, and `tolerance`, without changing existing context-only graph behavior when `answerMode` is omitted
- [ ] Add a canvas click handler converting the click to data-space via Chart.js's `getValueForPixel()`, comparing distance to `target` against `tolerance`
- [ ] `QuizScreen.tsx`: when `answerFormat: 'graphClick'`, suppress the normal four answer buttons entirely
- [ ] Confirm the never-throw contract holds: malformed `target`/`tolerance` degrades to "Graph unavailable," same as any other bad graph input
- [ ] Verify: click accuracy on both mouse and touch input, and after a window resize (tolerance must stay correct in data-space, not drift with pixel scaling)

---

## Phase 6 — Type-the-Answer Flashcards (optional skip to end)

**Goal:** A flashcard deck can require typed input before flip.

- [ ] Extend the flashcard rendering path to show a text input before the flip when the deck's `inputMode: 'type'`
- [ ] Grade via `answerMatching` — numeric mode if `back` parses as a number, else normalized-string mode against `[back]`
- [ ] After submission, flip to show the real `back` alongside what the student typed
- [ ] Confirm `flashEngine.ts`'s `sortCard()` remains the only method deciding pile membership — the typed check happens before it's called, doesn't change its logic
- [ ] Verify: a command-memorization test deck with `inputMode: 'type'` grades correctly and pile state (Know It / Still Learning) still persists across sessions exactly as it does today

---

## Phase 7 — Code-Execution Questions (JavaScript → Python → Java)

**Goal:** A student can write code in a real editor and get it graded on syntax, structure, and/or behavior — client-side, no backend.

- [ ] Integrate a code editor component (Monaco or CodeMirror — pick one, document the choice) into `QuizScreen.tsx` for `answerFormat: 'code'`
- [ ] **JavaScript first:** implement syntax gating and `checks.tests` execution via `new Function(...)`, matching the existing pattern in `Graph.tsx`; implement `checks.structure` via AST inspection (Acorn or Babel parser) for `requiredNames`
- [ ] Verify JavaScript end-to-end (editor → syntax check → structure check → test cases → pass/fail UI) before starting Python
- [ ] **Python:** add a lazy-loaded Pyodide runner (dynamic `import()`, visible loading state, never blocking the main bundle); implement the same three check layers, using Python's own `ast`/`inspect` for structural checks
- [ ] **Java — spike first:** before building the full path, confirm CheerpJ can compile and run *raw student-typed source* (not just pre-built bytecode) end-to-end; if this doesn't work cleanly, stop and reassess before investing further in Java support
- [ ] **Java (if spike succeeds):** add a lazy-loaded CheerpJ runner mirroring the JS/Python pattern
- [ ] Every language runner must degrade gracefully on malformed/crashing student code — no test-case timeout or runtime exception should ever crash the app (same never-throw posture as `Graph.tsx`)
- [ ] Verify: for each language, a test deck question with all three check layers reports accurate, readable pass/fail per test case, and a genuinely broken submission (infinite loop, syntax error, wrong output) never hangs or crashes the quiz screen

---

## Phase 8 — Command-Line Syntax Matching (Optional, Lowest Priority)

**Goal:** Only build this if the earlier phases are complete and there's still appetite for it — explicitly the least-validated idea in this batch.

- [ ] Add `answerFormat: 'command'` quiz questions, graded via `answerMatching.matchNormalizedString` against `acceptedAnswers`
- [ ] Confirm the same matcher also grades command-style type-the-answer flashcards (Phase 6) — no separate implementation needed, just reuse
- [ ] Validate `acceptedAnswers` is a non-empty array of strings in `DeckValidation.ts`
- [ ] Verify: a small cybersecurity-flavored test deck (a handful of common commands) correctly accepts flag-order/whitespace variants and correctly rejects genuinely wrong commands
