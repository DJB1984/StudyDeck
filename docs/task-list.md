---
type: task-list
project: StudyDeck
date: 2026-06-29
status: active
tags: [studydeck, claude-code, implementation]
---

Hand this file to [[Claude Code]] along with `PRD.md` and `design-doc.md`. Work phase by phase. Run the file in a browser after each phase to verify before moving on.

---

## Phase 1 — Shell and Design System

**Goal:** A single `studydeck.html` that opens in a browser, shows the home screen with correct visual styling, and loads KaTeX + Chart.js from CDN.

- [ ] Create `studydeck.html` with HTML boilerplate
- [ ] Add CDN imports with locked versions: KaTeX v0.16.x (CSS + JS) and Chart.js v4.x — use exact CDN URLs pinned to these major versions. All Chart.js config must use v4 syntax (no v2/v3 patterns).
- [ ] Implement CSS design system: all color tokens (`--bg`, `--surface`, `--border`, `--blur`, `--accent`, `--accent-light`, `--text-primary`, `--text-secondary`, `--correct`, `--incorrect`, `--radius`)
- [ ] Implement glass card CSS pattern (background, backdrop-filter, border, border-radius)
- [ ] Scaffold all JS module objects: `Storage`, `Router`, `FileLoader`, `QuizEngine`, `FlashEngine`, `Renderer`, `Stats`, `Clipboard` — stubbed with empty methods, no global functions
- [ ] Implement `Router.showScreen(id)` — all screen navigation goes through this
- [ ] Implement `Storage` module — all localStorage reads/writes isolated here: `get`, `set`, `getHistory`, `saveFile`, `getFlashState`, `setFlashState`. No other module touches localStorage.
- [ ] Build home screen skeleton: drag-drop zone, "Load file" button, empty file history grid
- [ ] Add screen transition animation: fade + 4px slide (150ms ease-out)
- [ ] Verify: open in browser, home screen renders with correct dark glass aesthetic and purple accent

---

## Phase 2 — File Loading and History

**Goal:** Drag or pick a `.json` file, see it appear on the home screen, persist across browser close/reopen.

- [ ] Implement drag-and-drop onto the home screen drop zone (dragover, drop events)
- [ ] Implement file picker button (`<input type="file" accept=".json">`)
- [ ] Implement `parseJSON(file)`: validate schema with specific, actionable field-level errors (e.g. "Question 7: Missing 'answers' array.", "Question 12: 'correct' index 4 is out of range (0–3).", "Question 4: Graph object is missing 'x_label'.", "Question 15: Expected exactly 4 answer choices, found 3.", "Missing top-level 'version' field.")
- [ ] Validate `version` field is present and equals `1`; warn on unknown versions rather than hard-failing
- [ ] Implement `Storage.saveFile(parsed)`: write to `studydeck_history` via `Storage` module (store full data + title + count + lastOpened date)
- [ ] Render file history grid on home screen: card per file showing title, question count, last opened date, glass card style
- [ ] Add trash/delete button to each file card — on click, call `Storage.deleteFile(title)` which removes the history entry AND the corresponding `studydeck_flash_{title}` key in one call
- [ ] Wrap all `Storage` `setItem` calls in try/catch — on `QuotaExceededError`, show user warning and remove oldest history entry before retrying
- [ ] Clicking a file card loads it into app state and navigates to Mode Select screen
- [ ] Verify: load a test `.json`, close browser, reopen — file appears on home screen and loads correctly. Delete a file — entry and flash state both gone from localStorage.

---

## Phase 3 — Mode Select Screen

**Goal:** After loading a file, user picks Practice, Test, or Flashcard and sets options before starting.

- [ ] Build mode select screen: three mode buttons (Practice, Test, Flashcard) with descriptions
- [ ] Add random order toggle (applies to quiz modes only, hidden for flashcard)
- [ ] Store selected mode and random preference in app state
- [ ] "Start" button navigates to correct screen (quiz or flashcard)
- [ ] Back button returns to home screen
- [ ] Verify: all three modes selectable, random toggle works, navigation correct

---

## Phase 4 — Quiz Engine (Core Flow)

**Goal:** A working quiz in Practice mode — one question per page, answer selection, navigation.

- [ ] Build quiz screen layout: progress indicator, question area, graph area (hidden by default), four answer buttons (A/B/C/D labels)
- [ ] Implement `renderQuestion(index)`: inject question text, render KaTeX, show/hide graph area, render four answer buttons
- [ ] Implement KaTeX rendering: `renderMathInElement()` on question container and all answer buttons after each render; fall back to raw string on KaTeX error
- [ ] Implement answer button selection: highlight selected, disable others after pick
- [ ] Practice mode feedback: correct button goes green, incorrect goes red, correct answer highlighted if wrong selected
- [ ] Implement retry in practice mode: retry button appears on wrong answer, re-enables buttons (retry does NOT reset answer record for stats)
- [ ] Implement Next button: advance to next question, or go to stats screen on last question
- [ ] Track answer record via `QuizEngine`: for each question, store `id`, `firstAttemptCorrect`, `chosenIndex`. First submission sets `firstAttemptCorrect` — retries never overwrite it.
- [ ] Start session timer on quiz start (`QuizEngine`); stop on stats screen. Pass duration to `Stats.buildRecord()`.
- [ ] Verify: complete a 5-question quiz in practice mode, get some wrong, retry — progress and feedback correct

---

## Phase 5 — Graph Rendering

**Goal:** Questions with graph objects display a correctly labeled Chart.js graph above the question.

- [ ] Implement `Renderer.renderGraph(graphObj, canvasEl)` — all graph logic isolated here:
  - If `type === "points"`: render Chart.js scatter with `showLine: true`, auto-fit axes if no `x_range`
  - If `type === "equation"`: evaluate equation string at 100 points via `new Function('x', 'return ' + equationStr)` wrapped in try/catch; render as line chart
  - On any error (bad equation, missing fields, Chart.js failure): display "Graph unavailable" message, return false. Never crash the app.
- [ ] Apply axis labels (`x_label`, `y_label`) and chart title from graph object
- [ ] Destroy and recreate chart instance on each question navigation (prevent canvas reuse errors)
- [ ] Graph container fixed height 240px, full question width
- [ ] Verify: test a question with points graph, a question with equation graph, and a question with a malformed equation — first two render correctly, third shows "Graph unavailable"

---

## Phase 6 — Test Mode

**Goal:** Test mode runs the same quiz flow with no feedback until the end.

- [ ] In test mode: suppress green/red feedback on answer buttons after selection
- [ ] Suppress retry button in test mode
- [ ] Otherwise identical flow to practice mode (same engine, same answer recording)
- [ ] Verify: complete quiz in test mode — no feedback shown during, navigates to stats at end

---

## Phase 7 — Stats Screen

**Goal:** Full stats screen after quiz completion.

- [ ] Build stats screen layout: pie chart area at top, score text, scrollable question breakdown
- [ ] Implement pie chart via `Stats.buildPieData()` + Chart.js doughnut: correct (purple accent) vs incorrect (red), animates on mount
- [ ] Display score text: "X / Y correct (Z%)" and total session duration
- [ ] Render question breakdown list:
  - Correct answers: collapsed to one line (question text truncated, green checkmark)
  - Wrong answers: expanded — show question, which answer was chosen, correct answer, copy-to-AI button
- [ ] Implement copy-to-AI button via `Clipboard.buildPrompt()`: write pre-formatted prompt to clipboard via `navigator.clipboard.writeText()`
- [ ] Retake button: if random was enabled, prompt user — "Same Order" or "New Random Order". Same Order reuses previous sequence; New Random Order reshuffles.
- [ ] Review button: navigates to review screen (read-only question browser)
- [ ] Verify: complete quiz with mix of correct/wrong — stats screen shows correct counts + duration, pie chart renders, copy-to-AI copies correct prompt, retake prompt appears correctly

---

## Phase 8 — Review Screen

**Goal:** Browse all questions read-only after completing a quiz.

- [ ] Build review screen: same question layout as quiz screen but no answer interaction
- [ ] Show correct answer highlighted on each question
- [ ] Navigation: prev/next buttons, question counter
- [ ] Back button returns to stats screen
- [ ] Verify: navigate through all questions in review mode — correct answers shown, no interaction

---

## Phase 9 — Flashcard Mode

**Goal:** Full flashcard flow with flip animation, pile sorting, persistence.

- [ ] Build flashcard screen: large centered card, flip on click, Know It / Still Learning buttons below
- [ ] Implement CSS 3D flip animation (preserve-3d, rotateY 180deg, 400ms ease)
- [ ] Card front: question text (KaTeX rendered). Card back: correct answer text (KaTeX rendered). No multiple choice options shown.
- [ ] Implement pile sorting via `FlashEngine.sortCard(pile)`: Know It slides card right + fades; Still Learning brief shake + returns to deck. Organized so a future spaced-repetition scheduler can replace this method without touching the rest of the module.
- [ ] Implement drill modes: "Drill Still Learning" (only unmastered cards) vs "All Cards" toggle
- [ ] Implement random order toggle for flashcards
- [ ] Progress counter: "Card 4 of 12 (Still Learning: 7)"
- [ ] Persist pile state via `Storage.setFlashState()` on every sort action — keyed by question `id`, not array index, so state survives question reordering
- [ ] Load pile state from `Storage.getFlashState()` on flashcard session start
- [ ] Session complete screen when all cards sorted: show counts, options to drill Still Learning or restart all
- [ ] Verify: sort several cards, close browser, reopen same file — pile state preserved. Random mode works.

---

## Phase 10 — Polish and Edge Cases

**Goal:** Production-ready feel. Handles bad inputs gracefully. Animations smooth.

- [ ] Keyboard support: Space/Enter to flip flashcard, arrow keys to navigate quiz questions
- [ ] Map number keys `1`, `2`, `3`, `4` to answer choices A, B, C, D in both Practice and Test quiz modes — triggers the same selection logic as clicking the button
- [ ] Smooth answer button animation: scale(0.97) on press
- [ ] Empty state on home screen if no history: friendly message + large drop zone
- [ ] Handle malformed graph equation string: isolated in `Renderer.renderGraph()` — catch all errors, show "Graph unavailable", never crash
- [ ] Handle missing/extra fields in JSON gracefully: warn in console, skip bad questions
- [ ] Ensure KaTeX errors fall back to raw string (try/catch around `renderMathInElement`)
- [ ] Test on Windows (Chrome, Edge) and Mac (Safari, Chrome) — verify backdrop-filter renders, layout holds
- [ ] Verify: drag in a malformed JSON — clear error shown. Malformed LaTeX — raw string shown. Malformed graph equation — "Graph unavailable" shown. No crashes.

---

## Phase 11 — Format Spec File

**Goal:** A shareable instructions file any AI can follow to generate a valid StudyDeck `.json`.

- [ ] Write `studydeck-format-spec.md` and save to `Resources/` in the vault
- [ ] Contents: full JSON schema with annotated example (including `version: 1` and `id` fields), LaTeX conventions (`$...$` inline, `$$...$$` display), graph object spec (points and equation with labeled axes), best practices for generating high-quality questions (4 plausible distractors, one clearly correct answer), note on answer correctness verification, note on stable `id` naming convention
- [ ] Include a ready-to-use prompt template: "Generate a StudyDeck `.json` for [topic] with [N] questions based on the following materials: [paste notes]"
- [ ] Verify: use the spec with Claude to generate a 5-question physics set — output is valid, all fields present, loads cleanly in StudyDeck
