---
type: task-list
project: StudyDeck
date: 2026-07-21
status: draft
tags: [studydeck, claude-code, implementation, question-types]
---

Hand this file to [[Claude Code]] along with `PRD.md` and `design-doc.md` (this folder). Work phase by phase — each phase should leave the app in a working, typecheck-clean state before moving to the next. Run `npm run typecheck` and exercise the feature in the dev server after each phase before moving on. Update `prompts/studydeck-quiz-spec.md` at the end of each phase so it never drifts from what's actually shipped (it's imported verbatim into the app via `?raw`).

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

- [x] Integrate a code editor component (Monaco or CodeMirror — pick one, document the choice) into `QuizScreen.tsx` for `answerFormat: 'code'` — chose CodeMirror 6 (modular, official lang packages for all three target languages, no worker-bundling headaches in Vite unlike Monaco); see `src/components/Code/CodeEditor.tsx`
- [x] **JavaScript first:** implement syntax gating and `checks.tests` execution via `new Function(...)`, matching the existing pattern in `Graph.tsx`; implement `checks.structure` via AST inspection (Acorn or Babel parser) for `requiredNames` — see `src/lib/codeRunners/javascript.ts`. Test execution runs in a dedicated Worker (`jsWorker.ts`) with a timeout, not on the main thread — a genuine infinite loop only hangs the worker, which gets `terminate()`d, so the quiz screen itself never freezes
- [x] Verify JavaScript end-to-end (editor → syntax check → structure check → test cases → pass/fail UI) before starting Python — verified live in a headless browser: stub failing, corrected implementation passing, syntax error message, missing-structure-name message, infinite loop timing out after ~3s with the UI staying responsive throughout, zero console errors; Review's read-only view and Stats' breakdown for a wrong code answer also confirmed
- [x] **Python:** add a lazy-loaded Pyodide runner (dynamic `import()`, visible loading state, never blocking the main bundle); implement the same three check layers, using Python's own `ast`/`inspect` for structural checks — see `src/lib/codeRunners/python.ts` + `pyWorker.ts`. Runtime assets (`pyodide.asm.wasm`, `python_stdlib.zip`, `pyodide-lock.json`, ~13MB) are bundled locally under `public/pyodide/` per Davis's call to keep the no-CDN posture, not loaded from a CDN. The worker persists across retries (loads Pyodide once, ~9s first run, ~150ms after) but gets destroyed and recreated on a timeout so a hang can't poison later runs. Verified live: stub failing, corrected implementation passing (fast retry), syntax error showing a clean one-line message (not Pyodide's full internal traceback — cleaned via `cleanPyError`), infinite loop timing out at ~20s with the UI responsive throughout and a clean recovery afterward, Review's read-only view, zero console errors
- [x] **Java — spike first:** before building the full path, confirm CheerpJ can compile and run *raw student-typed source* (not just pre-built bytecode) end-to-end; if this doesn't work cleanly, stop and reassess before investing further in Java support — **spike result: stopped per this instruction, did not build the Java path.** Technically CheerpJ *can* do it (`javac` is itself a Java program, so CheerpJ's JVM-in-WASM can run it against student-typed source — this is exactly what Leaning Technologies' own "JavaFiddle" demo does). The blocker is licensing, not technical feasibility: CheerpJ's free Community License explicitly requires loading its runtime from Leaning Technologies' own CDN (`cjrtnc.leaningtech.com`) — self-hosting (matching this app's no-CDN convention, and Davis's just-made call to bundle Pyodide locally rather than use a CDN) requires a paid, contact-sales-priced Commercial License. Needs a Davis decision before any code gets written: accept a CDN dependency for Java only, pay for a commercial license to self-host, or drop Java support
- [ ] **Java (if spike succeeds):** add a lazy-loaded CheerpJ runner mirroring the JS/Python pattern — on hold pending the licensing decision above (Davis chose "drop Java for now" on 2026-07-23; `language: "java"` is still a valid schema value and falls through to a graceful "isn't available in this build yet" message, not an error)
- [x] Every language runner must degrade gracefully on malformed/crashing student code — no test-case timeout or runtime exception should ever crash the app (same never-throw posture as `Graph.tsx`) — true for both shipped runners (JS and Python); N/A for Java (not built)
- [x] Verify: for each language, a test deck question with all three check layers reports accurate, readable pass/fail per test case, and a genuinely broken submission (infinite loop, syntax error, wrong output) never hangs or crashes the quiz screen — confirmed for JS and Python (see verification notes above); N/A for Java. Also confirmed `npm run build` (production, not just dev server) succeeds — required adding `worker: { format: 'es' }` to `vite.config.ts` since the default IIFE worker format doesn't support the code-splitting that `pyWorker.ts`'s dynamic `import('pyodide')` needs

---

## Phase 8 — Command-Line Syntax Matching (Optional, Lowest Priority)

**Goal:** Only build this if the earlier phases are complete and there's still appetite for it — explicitly the least-validated idea in this batch.

- [ ] Add `answerFormat: 'command'` quiz questions, graded via `answerMatching.matchNormalizedString` against `acceptedAnswers`
- [ ] Confirm the same matcher also grades command-style type-the-answer flashcards (Phase 6) — no separate implementation needed, just reuse
- [ ] Validate `acceptedAnswers` is a non-empty array of strings in `DeckValidation.ts`
- [ ] Verify: a small cybersecurity-flavored test deck (a handful of common commands) correctly accepts flag-order/whitespace variants and correctly rejects genuinely wrong commands

---

## Phase 9 — Fill-in-the-Blank Sentences (added 2026-09-14)

**Goal:** A sentence with one or more missing terms, typed into blanks that sit in the line of type.

- [x] Add `answerFormat: 'fillBlank'` to `types.ts` with `blanks: BlankSpec[]` (one `{ accept: string[] }` per blank) and optional `caseSensitive`
- [x] `src/lib/fillBlank.ts` — the marker syntax (three or more underscores), defined once: `parseBlanks` splits a sentence into text runs and blank slots, `countBlanks` feeds validation. Markers inside `$...$`/`$$...$$` and runs of one or two underscores are left as text
- [x] `answerMatching.matchBlankText(input, accepted, caseSensitive)` — case/whitespace/curly-apostrophe/trailing-punctuation normalization, no edit-distance tolerance (Davis's call 2026-09-14: a typo is a miss, since one character is often the whole distinction)
- [x] Validate `blanks` and, critically, that the marker count matches its length — a mismatch silently grades every later blank against the wrong key
- [x] `FillBlankText` in `QuizUI.tsx`, reached via `QuestionBody`'s optional `blankSlots` prop — inline inputs, sized from the canonical answer (clamped so a long answer isn't a spelling hint) and growing to fit what's typed
- [x] Wire Practice (per-blank highlight + "N of M blanks right"), Test (no feedback), Review (canonical answers read-only in place), and Stats (numbered your-answer/correct-answer rows)
- [x] Verified live in a headless browser against `test-decks/phase9-fill-blank.json`: two-blank partial feedback, retry to correct then lock, `caseSensitive` rejecting `aa` for `Aa`, KaTeX `\\times` rendering either side of a blank in the same sentence, Enter submitting without advancing the question, `snake_case` passing through untouched, Stats breakdown, Review, Test mode showing no check button or highlight, and 390px-wide layout with no horizontal overflow — zero console errors
- [ ] Not built: a word bank variant (tap a chip into a slot). Deliberately deferred — recall and recognition are different questions, and it can arrive as its own opt-in flag without reworking this
