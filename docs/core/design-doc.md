---
type: design-doc
project: StudyDeck
date: 2026-06-29
status: active
tags: [studydeck, design, architecture]
---

## Tech Stack

> **Migration note:** StudyDeck began as a single `.html` file (preserved at `legacy/studydeck.html`). It is now a React + TypeScript app built with Vite. The JSON schema, screens, localStorage shape, visual design tokens, and graph/KaTeX behavior below are unchanged and remain authoritative; only the delivery/architecture moved.

| Concern | Choice | Reason |
|---|---|---|
| Framework | React 18 + TypeScript | Component model + type safety for an app that's growing beyond a single file |
| Build/dev | Vite | Fast dev server + static `dist/` build; no backend |
| Math rendering | KaTeX v0.16.x (npm, bundled) | Fast, lightweight, renders LaTeX inline |
| Graphs | Chart.js v4.x (npm, bundled) | Handles both scatter/line (data points) and function plots — all config must use Chart.js v4 syntax |
| Persistence | localStorage | Flashcard state + file history, no backend needed |
| Styling | Vanilla CSS (`src/theme/`) | Full control over glass/blur effects; tokens isolated for a future shared theme |

The build output is fully static (`dist/`) — host anywhere, no server. Dependencies are bundled locally (no CDN).

## JSON Schema

Quiz decks and flashcard decks are structurally different — a top-level `type` field tells StudyDeck (and the generating AI) which shape to expect. `type` is optional and defaults to `"quiz"` for backwards compatibility with decks written before this field existed.

### Quiz deck (`"type": "quiz"`, or `type` omitted)

```json
{
  "version": 1,
  "type": "quiz",
  "title": "Physics Chapter 3 — Kinematics",
  "questions": [
    {
      "id": "q1",
      "question": "An object accelerates from rest at $a = 9.8 \\text{ m/s}^2$. What is its velocity after $t = 3$ s?",
      "answers": [
        "$v = 19.6 \\text{ m/s}$",
        "$v = 29.4 \\text{ m/s}$",
        "$v = 9.8 \\text{ m/s}$",
        "$v = 39.2 \\text{ m/s}$"
      ],
      "correct": 1,
      "graph": {
        "type": "points",
        "data": [[0, 0], [1, 9.8], [2, 19.6], [3, 29.4]],
        "x_label": "Time (s)",
        "y_label": "Velocity (m/s)",
        "title": "Velocity vs Time"
      }
    },
    {
      "id": "q2",
      "question": "Which equation describes the position of an object under constant acceleration?",
      "answers": [
        "$x = x_0 + v_0 t + \\frac{1}{2}at^2$",
        "$x = v_0 t$",
        "$x = \\frac{1}{2}at^2$",
        "$x = x_0 + at$"
      ],
      "correct": 0
    }
  ]
}
```

**Field rules:**
- `version` — integer, must be `1` for this format. Required. Used for future backwards-compatible upgrades.
- `type` — `"quiz"` or `"flashcard"`. Optional, defaults to `"quiz"`. Determines which mode(s) Mode Select offers and which question shape is required below.
- `title` — string, displayed on home screen card and at quiz start
- `questions[].id` — string, unique stable identifier (e.g. `"q1"`, `"q12"`). Required. Must remain stable if question order changes. Used internally for stats, flashcard progress, and future compatibility.
- `question` — string, LaTeX via `$...$` (inline) or `$$...$$` (display block)
- `answers` — array of exactly 4 strings, LaTeX supported
- `correct` — integer 0–3, index into answers array
- `graph` — optional object (omit entirely if no graph)
  - `type`: `"points"` or `"equation"`
  - `data`: array of `[x, y]` pairs if points; equation string (e.g. `"9.8 * x"`) if equation
  - `x_range`: `[min, max]` — required for equations, optional for points (auto-fit if omitted). Order doesn't matter; min/max are normalized regardless of which value comes first.
  - `y_range`: `[min, max]` — optional for both types (auto-fit if omitted). Lets the generating AI pin the y-axis bounds, e.g. to avoid a misleadingly zoomed-in or zoomed-out plot. Same min/max normalization as `x_range`.
  - `x_label`: string, required. Supports LaTeX via `$...$` (e.g. `"$e^x$"`) — rendered with KaTeX as an HTML overlay on top of the chart, since Chart.js itself can only draw plain canvas text.
  - `y_label`: string, required. Same LaTeX support as `x_label`.
  - `title`: string, required. Same LaTeX support as `x_label`.
- `table` — optional object (omit entirely if no table), sibling to `graph` (a question may have either, both, or neither). Rendered by `src/components/Table/Table.tsx`, context-only (never itself an answer surface).
  - `title`, `headers` (non-empty string array), `rows` (array of string arrays, each matching `headers`' length) all required. `$...$` KaTeX supported per cell.
- `answerFormat` — optional string discriminator, defaults to `"mcq"` (the shape above). One new field group per non-default value, all additive/optional so existing decks are unaffected:
  - `"multiSelect"` — `answers` is no longer locked to 4 entries; `correctIndices: number[]` (indices into `answers`, all in range, no duplicates) replaces `correct`. Graded all-or-nothing. Rendered as checkboxes (`MultiSelectAnswerList` in `src/components/QuizUI.tsx`).
  - `"numeric"` — `correctValue: number` and `tolerance: number` required; optional `inputWidget: "text" | "slider"` (default `"text"`), with `sliderMin`/`sliderMax`/`sliderStep` required together when `inputWidget` is `"slider"`. Graded via `src/lib/answerMatching.ts`'s `matchNumeric`. Rendered by `NumericInput` in `QuizUI.tsx`.
  - `"order"` — `items: {id, text}[]` (≥2 entries, shuffled for display) and `correctOrder: string[]` (the `items` ids in correct sequence — must be exactly the same set as `items`, each once). Graded as an exact-sequence match. Rendered by a custom pointer-based drag list (`OrderList` in `QuizUI.tsx`).
  - `"code"` — `language: "javascript" | "python" | "java"` (schema allows all three; **only `"javascript"` and `"python"` are actually runnable** — see below), optional `starterCode: string`, and `checks: { syntax?: boolean, structure?: { requiredNames?: string[] }, tests?: { call: string, expect: string }[] }` (at least one of the three required). Rendered via a CodeMirror 6 editor (`src/components/Code/CodeEditor.tsx`) in place of the answer buttons.
    - Grading dispatches by `language` through `src/lib/codeRunners/index.ts`'s `runCodeChecks`. JavaScript executes via `new Function(...)` (same pattern as `Graph.tsx`'s equation evaluation) with structure checks via an Acorn parse (`javascript.ts`); test-case execution runs in a dedicated Worker (`jsWorker.ts`) with a timeout so a student's infinite loop can only hang that worker, never the quiz screen. Python runs on a real CPython-via-WebAssembly build (Pyodide), loaded lazily (dynamic `import()`, never part of the main bundle) inside its own Worker (`pyWorker.ts`) with the same timeout/never-hang contract; structure checks use Python's own `ast` module. Pyodide's runtime assets (`pyodide.asm.wasm`, `python_stdlib.zip`, `pyodide-lock.json`, ~13MB) are bundled locally under `public/pyodide/`, not loaded from a CDN, matching this app's no-CDN posture.
    - **Java is not implemented.** CheerpJ (a WASM JVM) can technically compile and run raw student-typed source — `javac` is itself a Java program, so CheerpJ's JVM-in-WASM can run it — but its free Community License requires loading the runtime from Leaning Technologies' own CDN; self-hosting requires a paid Commercial License. That conflicts with this app's bundle-everything-locally convention, so Java support is on hold pending a licensing decision. A `language: "java"` question currently renders a graceful "isn't available in this build yet" message rather than crashing (see `src/lib/codeRunners/index.ts`'s default case).
  - `"graphClick"` and `"command"` are reserved in the type system (`src/types.ts`) and validated by `DeckValidation.ts`, but have **no UI implementation yet** — a question using either renders a "not supported yet" placeholder in `QuizScreen`/`ReviewScreen`. Don't generate decks using them.

### Flashcard deck (`"type": "flashcard"`)

Flashcards don't need multiple-choice distractors, so they use a different, simpler question shape — `front` / `back` instead of `question` / `answers` / `correct`. A card may carry one optional `graph`, on either face.

```json
{
  "version": 1,
  "type": "flashcard",
  "title": "Physics Vocab",
  "questions": [
    { "id": "q1", "front": "Velocity", "back": "Speed in a given direction (a vector)" },
    { "id": "q2", "front": "Kinetic Energy", "back": "$KE = \\frac{1}{2}mv^2$" }
  ]
}
```

- `questions[].front` — string, shown on the card front. LaTeX supported.
- `questions[].back` — string, shown on the card back. LaTeX supported.
- `questions[].graph` — optional, same `GraphSpec` shape quiz questions use (`points` or `equation`), validated by the same shared `graphErrors()` helper in `DeckValidation.ts`. Context-only: `answerMode`/`target`/`tolerance` remain quiz-side.
- `questions[].graphSide` — optional, `"front"` (default) or `"back"`. Which face the graph is drawn on. Setting it without a `graph` is a validation error.

A face carrying a graph switches from centered text to a column (`.has-graph` in `styles.css`): the plot takes the leftover flex track above, the card's text sits under it at a reduced size. `.graph-area`'s global fixed 240px height is overridden inside a card, since the card's own height floor is 280px. Text-only faces are unaffected.

Mode Select reads `type` to decide what to show: a quiz deck only offers Practice/Test; a flashcard deck only offers Flashcard mode.

**Validation errors** must be specific and actionable. Examples:
- `Question 7: Missing 'answers' array.`
- `Question 12: 'correct' index 4 is out of range (0–3).`
- `Question 4: Graph object is missing 'x_label'.`
- `Question 15: Expected exactly 4 answer choices, found 3.`
- `Missing top-level 'version' field.`

## App Architecture

React single-page app. Navigation is a screen state machine in `src/App.tsx` (a discriminated-union `Route` with per-screen payloads) — no router library. The original vanilla-JS module objects map onto React modules; each still owns its domain exclusively and no module bypasses another to touch its data.

```
src/
├── main.tsx            Entry; imports KaTeX CSS + theme, mounts <App>
├── App.tsx             Route state machine (Home→Mode→Quiz/Flashcard→Stats, Review branch)
├── types.ts            Deck/Question/Session/FlashState types
├── theme/              tokens.css (palette) + styles.css (ported component CSS)
├── lib/                Storage, SupabaseClient, DeckValidation, clipboard, formatSpec, shuffle, toast
├── components/         Math/Katex.tsx, Graph/Graph.tsx, Toast.tsx
└── features/           home, modeSelect, quiz, stats, review, flashcard, auth
```

`src/lib/SupabaseClient.ts` (see `docs/auth/design-doc.md`) is the only module that imports `@supabase/supabase-js`, mirroring how `Storage.ts` is the only module that touches `localStorage`. `src/features/auth/` (`AuthButton.tsx`, `LoginModal.tsx`, `migration.ts`) is the optional email-magic-link login UI, wired into the Home screen header only.

Behavioral contracts per module:

<details>
<summary>Legacy single-file layout (preserved at legacy/studydeck.html)</summary>

```
studydeck.html
├── <head>  CDN imports (KaTeX, Chart.js)
├── <style>  All CSS — dark glass variables, layout, animations
└── <body>
    ├── #home-screen       File list + drag-drop zone
    ├── #mode-screen       Pick mode + random toggle (after file loaded)
    ├── #quiz-screen       Question display, answer buttons
    ├── #stats-screen      Pie chart + per-question breakdown
    ├── #flashcard-screen  Card flip, pile controls
    └── #review-screen     Read-only question browser

    <script>
    const Storage    — ALL localStorage reads/writes. No other module touches localStorage directly.
                       Interface: get(key), set(key, val), getHistory(), saveFile(), deleteFile(title),
                       getFlashState(title), setFlashState(title, state).
                       deleteFile() removes history entry AND corresponding flash state in one call.
                       All setItem calls wrapped in try/catch — QuotaExceededError surfaces a warning and
                       drops the oldest history entry before retrying.
                       Abstracted so a future IndexedDB migration only touches this module.

    const Router     — showScreen(id). Manages transitions. No business logic.

    const FileLoader — handleDrop(), handlePicker() → validateJSON() → Storage.saveFile() → Router.
                       validateJSON() returns specific field-level errors (see Validation section).

    const QuizEngine — startQuiz(questions, mode, order), nextQuestion(), submitAnswer(index),
                       getAnswerRecord(). Tracks first-attempt correctness only — retries invisible to stats.
                       Owns session timer (start/stop). Test mode tracks per-question time.

    const FlashEngine — start(options), flip(), sortCard(pile), stepBack()/stepForward(), goBack().
                        Pile state (known/learning by question id) read/written via Storage.
                        Organized so a future spaced-repetition scheduler can replace sortCard()
                        without touching the rest of the module.

    const Renderer   — renderQuestion(q), renderKaTeX(el), renderGraph(graphObj, canvas), renderStats(record).
                       Graph rendering isolated in renderGraph() — all equation evaluation and Chart.js
                       logic lives here. Catches all errors; returns false and shows "Graph unavailable" on failure.

    const Stats      — buildRecord(answers, timing), calcScore(record), buildPieData(record).
                       Separate from QuizEngine so stats logic can evolve independently.

    const Clipboard  — buildPrompt(question, chosenIndex) → navigator.clipboard.writeText().
    </script>
```

</details>

The React modules keep these same responsibilities: `Storage` → `src/lib/Storage.ts`, `Router` → the `App.tsx` route machine, `FileLoader`/validation → `HomeScreen` + `src/lib/DeckValidation.ts`, `QuizEngine` → `src/features/quiz/QuizScreen.tsx`, `FlashEngine` → `src/features/flashcard/flashEngine.ts`, `Renderer` → `components/Math/Katex.tsx` + `components/Graph/Graph.tsx` + `StatsScreen`, `Stats` → `src/features/stats/stats.ts`, `Clipboard` → `src/lib/clipboard.ts`.

## Screens and Navigation

```
Home → Mode Select → Quiz/Flashcard → Stats → Home
                                    ↘ Review (browse read-only) → Home
```

**Home screen:** Grid of file cards (title, question count, last opened date). Drag-drop zone at top. "Load file" button. Clicking a card goes to Mode Select.

**Mode select screen:** Mode cards — Practice, Test, Review, Flashcard decks skip straight to Flashcard. Start button. (No random-order toggle — it existed early on and was removed as unhelpful; question order is always the deck's natural `0..n-1`.)

**Quiz screen:** Progress indicator (Q 3 of 20). Question text (KaTeX rendered). Graph if present (Chart.js). Four answer buttons (A/B/C/D). Practice mode: buttons go green/red on select, retry allowed on wrong (locks once correct); a "Copy explanation prompt" button is always visible, not gated on answering. Test mode: no color feedback, answers are freely changeable, no copy button — instead a live session clock ticks in the middle of the Back/Next row. Both modes: Back/Next are always visible and enabled (Back disabled only on Q1) — neither requires answering the current question, so the student can skip through freely or use ←/→. A question still unanswered when the session ends is scored wrong, not omitted. The ✕ abandon control returns to Mode Select, not Home (Quiz is only ever entered from there).

**Stats screen:** Pie chart (correct/incorrect, purple/dark). Score text. Session duration displayed. Scrollable question list — correct ones collapsed to a single line, wrong ones expanded showing chosen answer (or "You didn't answer this one") vs correct answer + copy-to-AI button. Two buttons: Retake / Review. Retake restarts immediately in the same question order.

**Flashcard screen:** Single large card with flip animation (CSS 3D transform). Question on front, correct answer on back. Progress counter. Options row: a Standard | Mastery segmented pill (sliding thumb; Standard default) on the left, and a single Settings button in the far corner opening a popover. Standard = a browse over the whole deck, marking nothing; Mastery = the deck's unmastered cards, each drilled to four Know Its in a row, with a four-segment streak bar above the card. That popover holds the two settings that aren't the mode: Random order (**Standard only** — Mastery always runs the deck's own order, since the mode's whole method is where a card sits in the rotation) and Background motion. It has no confirm button — every control applies as it's touched, and the panel dismisses on Escape or a click outside it. (A third mode, Piles — one sorting pass over the Still Learning subset — was removed 2026-08-16; sessions saved by it are rejected on restore rather than resumed.)

The card is sized off the viewport, not off a fixed box. `#flashcard-screen` is a full-height flex column (`min-height: calc(100dvh - 168px)` — `#app`'s 32px/64px vertical padding plus the 72px the ambience canvas hangs below the active area, which is absolutely positioned and so still counts toward document height). `#flash-active-area` and `#flash-card-wrap` both `flex: 1`, so the card absorbs whatever height the header, options row and mode hint leave: `280px` floor, `500px` ceiling, `760px` max width. `#flash-card` uses `align-self: stretch` rather than `height: 100%` — the wrap's height comes from flex-grow, which a percentage can't resolve against, and the faces are `position: absolute`, so a failed percentage collapses the card to zero. Because the floor is fixed, max width steps down with viewport height (`640px` under 820px tall, `560px` under 680px, where the screen also stops claiming a full viewport) so short windows get a smaller card rather than a letterboxed one; face padding and font-size are `clamp()`ed to the same curve. Round-complete centers its card in the same stage.

Bottom controls follow the mode. Standard shows only two icon-only arrow buttons (previous / next card) — it has no verdict to record, so the pile buttons would have nothing to write. Mastery shows an icon-only Undo disc plus Still Learning / Know It — Undo is a correction, not a choice, so it carries no word beside the two that are. Keyboard splits by axis in both modes: ↑/↓ flip the card (as do Space and Enter), while ←/→ move the round on — stepping between cards in Standard, and giving the verdict in Mastery (← Still Learning, → Know It, matching the button order). Undo has no key: binding a correction to the same axis as the verdicts is how one slip becomes two. The window handler ignores keys typed into an input, **except** the mode pill's radios — they keep focus after a click, so without that exception an arrow pressed after switching mode moved the pill's own selection instead of the card; `preventDefault` suppresses the radiogroup's built-in arrow navigation. Standard is `!masteryMode` (`FlashEngine.isBrowseMode()`) — no separate stored flag, so a resumed session and the mode pill can't disagree. Its cursor moves via `stepBack()` / `stepForward()`, which touch neither pile nor the undo stack; stepping off the last card ends the round.

## Visual Design

**Design language:** "Starfield" — a deep-space navy system. Solid, tonal-layered panels (no `backdrop-filter`/glass). One restrained accent (Starlight Blue) for everyday interactive/selected state; the multi-hue "Nebula" palette held back to two places — Home's hero gradient, and the deeply muted cast of Flashcards' Mastery atmosphere, where the hue describes the round but never a control. Distinct — not a Quizlet clone. Full rationale and Named Rules live in `DESIGN.md` (source of truth for the visual system); this section stays a technical summary in sync with it.

**Color tokens:**
```css
--bg: #080d16;                        /* void navy base */
--surface: #11161f;                   /* solid panel fill */
--surface-hover: #1a2029;             /* panel raised/hover */
--border: rgba(255, 255, 255, 0.08);  /* hairline edge */
--accent: #3093ec;                    /* starlight blue */
--accent-light: #63b3ff;              /* hover/focus/text-on-dark */
--accent-deep: #0267c7;               /* button gradient base */
--nebula-gradient: conic-gradient(from 200deg, #ef852e, #c841a5, #3093ec, #ef852e); /* mark + Home hero only */
/* Flashcard mode atmospheres — Nebula's one other sanctioned home. Each mode
   owns tint / light / fill / veil; #flashcard-screen[data-mode] projects the
   chosen family onto --mode-tint/-light/-fill/-veil. Inside that screen the
   mode hue REPLACES the accent on filled buttons, switches and focus rings
   (DESIGN.md, The Mode-Owns-Its-Screen Rule); .btn-danger is exempt. */
--mode-mastery-tint: #a2519a; --mode-mastery-light: #d68cc9; --mode-mastery-fill: #8f4489;
--text-primary: #e1e5eb;
--text-secondary: #79818d;
--correct: #5dc879;
--incorrect: #f75d59;
--radius: 16px;
--font-body: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
--font-heading: 'Space Grotesk', var(--font-body);
--font-mono: 'JetBrains Mono', ui-monospace, Consolas, monospace;
```

**Panel pattern (replaces the old glass-card recipe — no blur):**
```css
background: var(--surface);
border: 1px solid var(--border);
border-radius: var(--radius);
```

**Typography:** Three self-hosted webfonts (`@fontsource/*`, no CDN): Inter for body/UI text, Space Grotesk for headings and the Home hero wordmark, JetBrains Mono for code/metadata (deck-JSON textarea, quiz timer). Question text 1.2rem/Inter, answer buttons 1rem/Inter. KaTeX inherits size.

**Animations:**
- Screen transitions: fade + 4px vertical slide (150ms ease-out)
- Answer button select: scale(0.97) on press, color fill on result
- Flashcard flip: CSS 3D rotateY 180deg (400ms ease, preserve-3d)
- Card sort (Know It): slide right and down + fade; Still Learning: brief shake + return
- Stats pie chart: Chart.js animates on mount
- Flashcard mode atmosphere (`FlashAmbience.tsx`): a Canvas 2D field behind the card with per-mode physics — Standard breathes in place, Mastery orbits a core that brightens with progress. Both sample one fixed particle pool, so a mode switch lerps each particle between its two mode positions (700ms, matched to the `@property` hue transition). **Frozen by default** — a Background motion toggle in the Settings popover starts it, and the choice persists per device via `Storage.getAmbientMotion()`. Paused is treated identically to `prefers-reduced-motion`: same frozen clock, same snap instead of a crossfade, one still-frame code path. Also pauses when the tab is hidden or the canvas scrolls out of view.

**Flashcard flip implementation:**
```css
.card-inner { transform-style: preserve-3d; transition: transform 400ms ease; }
.card-inner.flipped { transform: rotateY(180deg); }
.card-front, .card-back { backface-visibility: hidden; }
.card-back { transform: rotateY(180deg); }
```

## Clipboard Prompt Format

When copy-to-AI is clicked on a wrong answer:

```
Explain why "[correct answer]" is the correct answer for this question:

[question text, LaTeX preserved]

The options were:
A) [answer 0]
B) [answer 1]
C) [answer 2]
D) [answer 3]

I chose: [chosen answer]
```

## localStorage Schema

All reads/writes go through the `Storage` module. No other module accesses `localStorage` directly. This abstraction allows a future migration to IndexedDB without touching any other module.

```js
// File history. `id` is generated on first save and never changes; it is what
// flashcard state is filed under, so a deck's title can change without
// orphaning weeks of mastery scheduling.
"studydeck_history": [
  { "id": "3f2b...", "name": "Physics Ch3.json", "title": "Physics Chapter 3", "count": 20, "lastOpened": "2026-06-29", "data": { ...full parsed JSON... } }
]

// Flashcard state — keyed by DECK ID, indexed by question id (not position)
"studydeck_flash_3f2b...": {
  // The real state: each card's streak toward mastery. 4 = mastered.
  // `lastSeen: null` means never seen in any session, which is what earns a
  // first-attempt Know It the jump straight to 3.
  "cards": {
    "q1": { "streak": 4, "lastSeen": "..." },
    "q2": { "streak": 1, "lastSeen": "..." },
    "q3": { "streak": 0, "lastSeen": null }
  },
  // Derived mirrors, rewritten from `cards` on every save. They exist only
  // because the cloud `flash_state` table has just these two columns. Never
  // write them directly — schedule.ts `derivePiles()` owns their contents.
  "known": ["q1"],
  "learning": ["q2"],
  // The in-progress round, so a reload resumes where the student left off.
  // In Mastery, `queue` holds the same ids as `order` for the round's whole
  // life — it's a rotation, not a to-do list that drains.
  "session": { "order": [...], "queue": [...], "currentIdx": 0, "randomOrder": false, "masteryMode": true }
}

// Whether Flashcards' decorative ambient motion may animate. Absent = off:
// decoration is opt-in. A device preference, not deck data — never mirrored to
// Supabase, and not cleared on logout (clearLocal scrubs content, not comfort
// settings).
"studydeck_ambient_motion": true
```

Card records use question `id` fields (not array indices) so state survives question reordering.

**Mastery drill (see `src/features/flashcard/schedule.ts`, which owns every rule below).** A single-session drill: a card is mastered by four Know Its **in a row**, each one burying it further down the rotation so the next retrieval is real recall rather than recognition. Mastery is the only thing that persists between sessions; the streak toward it is earned inside one round. (This replaced a two-stage cross-day ladder — next-day cold checks plus 3/7/16/35-day refreshers — on 2026-08-18 at Davis's call. Don't reintroduce day-based scheduling without asking: the mode is now deliberately something a student can finish in one sitting.)

1. **The streak.** A Know It advances the card one rung and drops it `rungs[streak]` cards down the rotation — **5, then 10, then 15**. The **fourth** hit sets `streak: 4`, which *is* mastery, and sends the card to the very back rather than a fourth measured gap; nothing before it counts as mastered. So a four-hit ladder has only three measured rungs: the last one is a position, not a distance.
2. **The first look is worth three.** A card with `lastSeen: null` — never given a verdict in any session — jumps straight to **3/4** on a Know It, so a deck full of already-known material clears in two passes instead of four. One short of mastered rather than all the way there: a first look proves recall, and the mastering hit is the spaced retrieval that proves it stuck. A card that has been missed is no longer fresh and climbs one rung at a time.
3. **A miss resets the streak to 0** and brings the card back **3 cards** later. Not one rung — "four in a row" only means something if a miss breaks the run. This is also the only way a mastered card loses mastery.
4. **The round ends when every card in the working set is mastered.** A round's working set is the deck's *unmastered* cards; cards mastered in an earlier session are left out entirely, so a later round only offers what's left. A fully mastered deck opens on the Deck Mastered screen, whose only substantive action is **Reset Progress** (`resetProgress()`, the one thing that wipes streaks).

Supporting rules, each fixing a specific failure mode:

- **The header counter is deck-wide, not round-wide** (`progressMastery()`). It counts mastered cards over the deck's *whole* card list, so it matches the `X / N mastered` badge Home shows for the same deck. Counting the round's working set instead is a desync waiting to happen: that set excludes cards mastered in an earlier session, so a 12-card deck with 4 already earned would open on "0 / 8 mastered" — dropping the earned cards from both halves of a line that says "mastered". The ambient core's brightness reads off the same fraction. The Round Complete copy is the one place that legitimately counts the working set, because it's describing what *this round* did.
- **The rotation never shrinks.** Every verdict takes a card off the front and puts it back further down, mastered or not — so `queue` holds the same ids as `order` all round, and completion is "every card mastered", never "queue empty". Mastered cards circulating is what keeps the gaps honest at the end of a round, when there'd otherwise be two cards left to space a repeat against.
- **The mastering hit sends the card to the very back**, rather than a rung's distance. It has nothing left to prove, so the useful thing is for it to get out of the way — and this is also what guarantees every unmastered card keeps advancing toward the front. A hit on an already-mastered card that comes back around takes the same trip (`hit()` holds it at the top of the ladder), which is a free victory lap rather than a fifth rung.
- **Gaps crop to fit a small deck, keeping their 1:2:3 shape** (`cropScale`), rather than each clamping to the back of the queue. Clamping would collapse all three rungs onto the same real gap on a 6-card deck — exactly where the widening has to survive. A 12-card rotation studies at 4 / 8 / 11; 20 cards and up runs uncropped.
  - **The longest gap crops to exactly the rotation's length**, which is load-bearing rather than cosmetic: a card only moves toward the front when another is put back *behind* it, so if every gap cropped shorter than the rotation, the tail would never be reached and the round could not end. (It did exactly that during development, on every deck of 3 or more.)
- **The gaps are fixed** (`GAPS` in `schedule.ts`), not a setting. They were briefly editable from the options-row gear, with the four numbers stored per device under `studydeck_mastery_gaps`; that came out on 2026-08-18 at Davis's call. The spacing *is* the mode — a number the student can turn down is a number they turn down on the first deck that feels slow, and the drill stops being a drill. Small decks still get the cropping above, which is the only case where the shape gives. **Don't reintroduce a spacing setting without asking.**
- **Older state is back-filled on read** (`schedule.ts` `normalize`), per record rather than per deck, since a cloud merge can leave a deck holding a mix of shapes. Old two-array `known` ids and ladder-era `step` values both land on the streak they actually demonstrated: a single old Know It becomes 3/4 (what a first-attempt hit is worth now), ladder rungs map across one for one, and ladder `mastered` stays mastered. Records from the **three-hit** model (2026-08-18, the same day it was replaced) need one more distinction: `streak: 3` meant *mastered* there, so it is promoted to 4 when — and only when — the same id also appears in the state's derived `known`, which under the current model never holds a 3/4 card. Without that, every already-finished deck would reopen as a full round.

**Deletion lifecycle:** `Storage.deleteFile(title)` removes the entry from `studydeck_history` AND deletes the corresponding `studydeck_flash_{id}` key (plus any pre-migration `studydeck_flash_{title}` key) in one atomic operation. This keeps localStorage clean and prevents orphaned card data accumulating over time.

**Key migration:** state written before decks had ids lives under the title. The first `getFlashState(deckId)` for a deck *moves* it to the id key and removes the old one — a move, not a copy, since two live copies of one deck's progress would diverge silently.

**Quota safety:** All `localStorage.setItem()` calls are wrapped in try/catch. On `QuotaExceededError`, surface a user-facing warning ("Storage full — oldest file removed") and remove the oldest history entry before retrying.

**Supabase mirror (optional, see `docs/auth/PRD.md`/`docs/auth/design-doc.md`):** `localStorage` remains the source of truth for every synchronous read in the app, logged in or not — `Storage`'s public surface never becomes `Promise`-based. When a session is active, `Storage.saveFile`/`deleteFile`/`setFlashState` additionally fire a best-effort, non-blocking async mirror of the same write to two Supabase tables (`decks`, `flash_state`, both RLS-scoped to `auth.uid()`) via `src/lib/SupabaseClient.ts`, the only module that imports `@supabase/supabase-js`. On login, `src/features/auth/migration.ts` uploads any existing local decks to a brand-new (empty) account, or downloads an existing account's cloud data back into the local cache — never both directions for the same login, to avoid an incomplete upload clobbering local-only data on retry. A `Storage.subscribe()` listener bus (modeled on `toast.ts`) notifies mounted screens after such a bulk local-cache overwrite.

**Mastery records are device-local.** The `flash_state` table still has only `deck_title`, `known` and `learning` columns, so `setFlashState`'s mirror resolves the deck's title and sends the derived piles — the `cards` records don't leave the device. Studying the same deck on a second device therefore restarts its streaks there. Deliberate (Davis, 2026-08-17: get the mode's shape right in real use before freezing it into a schema). Closing this means adding `cards jsonb` + `schema_version` to `flash_state` and keeping the two pile columns written in parallel for a release.

## Graph Rendering Notes

All graph logic is isolated inside `Renderer.renderGraph()`. It returns `false` and displays a friendly "Graph unavailable" message on any failure — malformed equations, missing fields, Chart.js errors. The rest of the app never crashes due to a bad graph.

- **Points:** `type: 'scatter'` with `showLine: true` in Chart.js. Auto-fit axes if no `x_range`.
- **Equation:** Evaluate the equation string at N=100 evenly spaced points across `x_range`. Use `Function()` constructor with `x` as the variable (e.g. `new Function('x', 'return ' + equationStr)`). Wrap in try/catch — malformed strings show "Graph unavailable" instead of throwing. Plot as line chart.
- Graph container is fixed height (240px), full question width, rendered before question text.
- Chart is destroyed and recreated on each question navigation to avoid canvas reuse issues.

## Statistics Tracking

`Stats.buildRecord()` assembles the session record from QuizEngine state after the quiz ends.

```js
// Session record (passed to Stats, displayed on stats screen)
{
  mode: "practice" | "test",
  totalDuration: 142,          // seconds, all modes
  questions: [
    {
      id: "q1",
      firstAttemptCorrect: true,
      chosenIndex: 1,
      timeSpent: 18            // seconds — test mode only, null in practice
    },
    ...
  ]
}
```

- `firstAttemptCorrect` means different things per mode: in Practice it's set on the first submission and retries never update it; in Test there's no "first attempt" concept (no feedback shown, so Back-and-change isn't a retry) — it reflects whichever answer was chosen when the session ended.
- `chosenIndex` is `-1` for a question left unanswered when the session ends (skipped via Back/Next navigation) — it's scored wrong (`firstAttemptCorrect: false`), not omitted from the record.
- `timeSpent` is tracked per-question in test mode, accumulated across every visit to that question (revisiting via Back doesn't reset the clock). Null in practice mode.
- `totalDuration` tracks wall time from quiz start to stats screen.

## KaTeX Rendering Notes

- Run `renderMathInElement(el, { delimiters: [{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false}] })` after injecting any question/answer HTML.
- Apply to question container and all four answer buttons after each question render.
- KaTeX errors (malformed LaTeX) should fall back to raw string display, not crash.
