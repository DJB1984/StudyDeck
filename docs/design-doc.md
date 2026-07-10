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

### Flashcard deck (`"type": "flashcard"`)

Flashcards don't need multiple-choice distractors, so they use a different, simpler question shape — `front` / `back` instead of `question` / `answers` / `correct`. Graphs are not supported on flashcards.

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
├── lib/                Storage, DeckValidation, clipboard, formatSpec, shuffle, toast
├── components/         Math/Katex.tsx, Graph/Graph.tsx, Toast.tsx
└── features/           home, modeSelect, quiz, stats, review, flashcard
                        (each with its co-located {Feature}.spec.md)
```

Behavioral contracts per module (co-located `*.spec.md` files are the authoritative, verifiable version of these):

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

    const FlashEngine — startFlash(questions, options), flip(), sortCard(pile), drillPile(pile).
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

**Mode select screen:** Three buttons — Practice, Test, Flashcard. Toggle for random order (quiz modes only). Start button.

**Quiz screen:** Progress indicator (Q 3 of 20). Question text (KaTeX rendered). Graph if present (Chart.js). Four answer buttons (A/B/C/D). Practice mode: buttons go green/red on select, retry button appears on wrong. Test mode: no color feedback, just advances.

**Stats screen:** Pie chart (correct/incorrect, purple/dark). Score text. Session duration displayed. Scrollable question list — correct ones collapsed to a single line, wrong ones expanded showing chosen answer vs correct answer + copy-to-AI button. Two buttons: Retake / Review. Retake prompts: "Same Order" or "New Random Order" (if random was enabled). Same Order reuses the exact previous sequence; New Random Order reshuffles.

**Flashcard screen:** Single large card with flip animation (CSS 3D transform). Question on front, correct answer on back. Bottom controls: Know It / Still Learning buttons. Progress counter. Toggle: drill Still Learning only or all cards. Random toggle.

## Visual Design

**Design language:** Dark liquid glass. Apple-clean. Purple accent. Distinct — not a Quizlet clone.

**Color tokens:**
```css
--bg: #0a0a0f;                        /* near-black base */
--surface: rgba(255,255,255,0.06);    /* glass card background */
--surface-hover: rgba(255,255,255,0.10);
--border: rgba(255,255,255,0.12);     /* subtle glass edge */
--blur: blur(20px);                   /* backdrop-filter */
--accent: #7c3aed;                    /* purple-600 */
--accent-light: #a78bfa;              /* purple-400 — text on dark */
--text-primary: #f1f0ff;
--text-secondary: rgba(241,240,255,0.6);
--correct: #22c55e;
--incorrect: #ef4444;
--radius: 16px;
```

**Glass card pattern:**
```css
background: var(--surface);
backdrop-filter: var(--blur);
-webkit-backdrop-filter: var(--blur);
border: 1px solid var(--border);
border-radius: var(--radius);
```

**Typography:** System font stack (`-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`). Question text 1.2rem, answer buttons 1rem. KaTeX inherits size.

**Animations:**
- Screen transitions: fade + 4px vertical slide (150ms ease-out)
- Answer button select: scale(0.97) on press, color fill on result
- Flashcard flip: CSS 3D rotateY 180deg (400ms ease, preserve-3d)
- Card sort (Know It): slide right + fade; Still Learning: brief shake + return
- Stats pie chart: Chart.js animates on mount

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
// File history
"studydeck_history": [
  { "name": "Physics Ch3.json", "title": "Physics Chapter 3", "count": 20, "lastOpened": "2026-06-29", "data": { ...full parsed JSON... } }
]

// Flashcard piles — keyed by file title, indexed by question id (not position)
"studydeck_flash_Physics Chapter 3": {
  "known": ["q1", "q3", "q7"],       // question ids in Know It pile
  "learning": ["q2", "q4", "q5"]    // question ids in Still Learning pile
}
```

Piles use question `id` fields (not array indices) so state survives question reordering.

**Deletion lifecycle:** `Storage.deleteFile(title)` removes the entry from `studydeck_history` AND deletes the corresponding `studydeck_flash_{title}` key in one atomic operation. This keeps localStorage clean and prevents orphaned pile data accumulating over time.

**Quota safety:** All `localStorage.setItem()` calls are wrapped in try/catch. On `QuotaExceededError`, surface a user-facing warning ("Storage full — oldest file removed") and remove the oldest history entry before retrying.

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

- `firstAttemptCorrect` is set on the first submission. Retries do not update it.
- `timeSpent` is tracked per-question in test mode (timer starts when question renders, stops on submission). Null in practice mode.
- `totalDuration` tracks wall time from quiz start to stats screen.

## KaTeX Rendering Notes

- Run `renderMathInElement(el, { delimiters: [{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false}] })` after injecting any question/answer HTML.
- Apply to question container and all four answer buttons after each question render.
- KaTeX errors (malformed LaTeX) should fall back to raw string display, not crash.
