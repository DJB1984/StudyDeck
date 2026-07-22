---
type: design-doc
project: StudyDeck
date: 2026-07-21
status: draft
tags: [studydeck, design, architecture, question-types]
---

## Relationship to the core design doc

This extends `docs/core/design-doc.md`'s "JSON Schema" and "App Architecture" sections. Once a feature here is actually implemented, its schema addition should be folded into the main `docs/core/design-doc.md` and `studydeck-format-spec.md` (per CLAUDE.md: `design-doc.md` is the source of truth for behavior, and the format spec must never drift from what's actually shipped). This document is the working design for the batch; it is not itself the long-term source of truth.

All new question sub-types are introduced via an optional `answerFormat` discriminator on quiz questions, defaulting to `"mcq"` (today's exact-4-answers, single `correct` index behavior) when omitted — so every existing deck in the wild continues to validate and render exactly as before. This mirrors the existing top-level `type` field pattern (`"quiz"` default, `"flashcard"` opt-in).

## Shared Infrastructure

### `src/lib/answerMatching.ts` (new)

One module, two grading modes, used by every free-response-shaped feature instead of each reimplementing comparison logic:

```ts
matchNumeric(input: string, correctValue: number, tolerance: number): boolean
matchNormalizedString(input: string, accepted: string[]): boolean
```

- `matchNumeric` — parses `input` as a float, returns `Math.abs(parsed - correctValue) <= tolerance`. Non-numeric input is always a non-match (not a thrown error — same never-crash posture as the rest of the app).
- `matchNormalizedString` — collapses whitespace, then for tokens matching a combined-short-flag shape (`/^-[a-zA-Z]{2,}$/`) decomposes them into a set of single-character flags so `-la` and `-al` compare equal; other tokens compare literally. Returns true if the normalized input matches the normalized form of any string in `accepted`. Used by both command-line questions and type-the-answer flashcards.

Used by: numeric free-response, slider, type-the-answer flashcards, command-line matching.

### `src/types.ts` additions

- `answerFormat?: 'mcq' | 'numeric' | 'multiSelect' | 'order' | 'graphClick' | 'code' | 'command'` on the quiz `Question` type (omitted = `'mcq'`, today's behavior).
- Per-format fields, detailed under each feature below.
- New optional `table?: TableSpec` field on quiz questions, sibling to the existing `graph?: GraphSpec` — a question can carry a table, a graph, both, or neither.
- New optional `inputMode?: 'flip' | 'type'` on the flashcard deck (default `'flip'`, today's behavior).

### `src/lib/DeckValidation.ts` additions

One new validation branch per `answerFormat`, following the module's existing convention of specific, actionable error strings (e.g. `"Question 7: 'multiSelect' questions require a non-empty 'correct' array."`). The whole deck is still rejected on any single error, per existing behavior — no partial/silent skipping.

### Lazy-loaded code runtimes

Pyodide and CheerpJ are both tens-of-MB WASM runtimes. Neither may be part of the main app bundle. Both are loaded via dynamic `import()` triggered only when `QuizScreen` renders a question with `answerFormat: 'code'` and the matching `language`, with a visible loading state while the runtime downloads (never a silent hang — see Success Criteria in the PRD).

## Feature: Numeric free-response & slider

```json
{
  "id": "q1",
  "answerFormat": "numeric",
  "question": "An object accelerates from rest at $a = 9.8\\text{ m/s}^2$. What is its velocity after $t=3$ s?",
  "correctValue": 29.4,
  "tolerance": 0.1,
  "inputWidget": "text"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `correctValue` | number | Yes | The correct numeric answer. |
| `tolerance` | number | Yes | Deck-author-supplied; "close enough" varies per problem, so there's no sane default. |
| `inputWidget` | string | No | `"text"` (default) or `"slider"`. |
| `sliderMin`/`sliderMax`/`sliderStep` | number | Required if `inputWidget: "slider"` | Slider range and granularity. |

Grading: `answerMatching.matchNumeric`. Rendering: a plain numeric `<input>` (text mode) or `<input type="range">` (slider mode) replaces the four MCQ answer buttons in `QuizScreen.tsx`.

## Feature: Select-all-that-apply

```json
{
  "id": "q2",
  "answerFormat": "multiSelect",
  "question": "Which of the following are signs of hypoglycemia? Select all that apply.",
  "answers": ["Sweating", "Confusion", "Fever", "Shakiness"],
  "correct": [0, 1, 3]
}
```

`answers` is no longer locked to exactly 4 entries for this sub-type (real SATA questions commonly have 5-8 options) — `DeckValidation.ts` only enforces the fixed-4 rule when `answerFormat` is `'mcq'` or omitted. `correct` becomes an array of indices instead of a single int. Grading is all-or-nothing (the full correct set, no partial credit), matching real SATA convention. Rendering: checkboxes instead of single-select buttons.

## Feature: Drag-to-order

```json
{
  "id": "q3",
  "answerFormat": "order",
  "question": "Order these steps of the nursing process.",
  "items": [
    { "id": "a", "text": "Assessment" },
    { "id": "b", "text": "Diagnosis" },
    { "id": "c", "text": "Planning" },
    { "id": "d", "text": "Implementation" },
    { "id": "e", "text": "Evaluation" }
  ],
  "correctOrder": ["a", "b", "c", "d", "e"]
}
```

`items` are shuffled on render (never shown pre-solved — see PRD success criteria); `correctOrder` lists item `id`s in the correct sequence. Grading is exact-sequence match, all-or-nothing. New UI: a small drag-and-drop reorderable list, built on native HTML5 drag events — no new dependency, kept in the spirit of the project's dependency-light styling approach.

## Feature: Data tables

```json
"table": {
  "title": "Company X — Income Summary",
  "headers": ["Year", "Revenue", "Expenses"],
  "rows": [
    ["2023", "$120,000", "$95,000"],
    ["2024", "$150,000", "$110,000"]
  ]
}
```

v1 scope: rendered as context only, the same role `graph` already plays — usable alongside `answerFormat: 'mcq'` or `'numeric'` questions. No new dependency: a themed HTML `<table>`, not canvas or an image, styled to match the existing dark-glass tokens in `src/theme/`. Cell text supports the same `$...$` KaTeX rendering as everywhere else in the app.

Click-a-cell as its own answer mode (`answerFormat: "tableClick"`, with a `correctCell: [row, col]` field) is a stretch addition within this feature's phase, not required for v1 — table cells are already discrete DOM elements, so this needs no coordinate math at all (simpler than graph click-to-answer).

## Feature: Graph click-to-answer

Extends the existing `GraphSpec` (`src/types.ts`, rendered by `src/components/Graph/Graph.tsx`) with an optional answer mode:

```json
"graph": {
  "type": "equation",
  "data": "-(x-2)*(x-2)+4",
  "x_range": [-2, 6],
  "x_label": "$x$",
  "y_label": "$y$",
  "title": "Click the vertex",
  "answerMode": "click",
  "target": { "x": 2, "y": 4 },
  "tolerance": 0.3
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `answerMode` | string | No | Omitted = today's context-only behavior. `"click"` opts in. |
| `target` | `{x, y}` | Required if `answerMode: "click"` | Correct point, in data-space, not pixels. |
| `tolerance` | number | Required if `answerMode: "click"` | Radius in data units — deliberately data-space rather than pixel-space so it stays correct across window resizes and zoom. |

The question itself needs `answerFormat: "graphClick"` so `QuizScreen` knows not to render the normal four answer buttons at all.

Implementation: Chart.js v4 exposes `chart.scales.x.getValueForPixel(px)` / the y-scale equivalent, so converting a raw canvas click into a data-space `(x, y)` is built into the library already in use — no new coordinate-transform code needed. A click handler on the canvas converts the click, compares distance to `target` against `tolerance`. Same never-throw contract as the rest of `Graph.tsx` — a malformed `target`/`tolerance` degrades to "Graph unavailable," it never crashes the question.

## Feature: Code-execution questions (JavaScript, Python, Java)

```json
{
  "id": "q4",
  "answerFormat": "code",
  "question": "Write a function `reverseString(s)` that returns the input string reversed.",
  "language": "javascript",
  "starterCode": "function reverseString(s) {\n  \n}",
  "checks": {
    "syntax": true,
    "structure": { "requiredNames": ["reverseString"] },
    "tests": [
      { "call": "reverseString(\"abc\")", "expect": "\"cba\"" },
      { "call": "reverseString(\"\")", "expect": "\"\"" }
    ]
  }
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `language` | string | Yes | `"javascript"` \| `"python"` \| `"java"`. |
| `starterCode` | string | No | Pre-filled editor content. |
| `checks.syntax` | boolean | No | Hard gate — code must parse/compile before other checks run. |
| `checks.structure` | object | No | Static checks independent of execution — e.g. required class/method names present. Deliberately scoped narrow (`requiredNames` only) for v1; deeper structural rules (required method signatures, visibility/encapsulation) are a v1.1 refinement once the pattern is proven, not fully speced yet. |
| `checks.tests` | array | No | Input/output pairs. Not every question needs these — a pure syntax/structure question (e.g. grading "did you write a valid class shape") can omit `tests` entirely, per explicit product decision that syntax/structure matter independently of behavior. |

**Editor**: Monaco Editor or CodeMirror, embedded in the question in place of answer buttons. Choice between the two is an implementation-time call, not fixed here.

**Execution per language:**
- **JavaScript** — native, via `new Function(...)`, the same pattern already established in `Graph.tsx` for equation graphs. Zero new dependency. Structural checks via AST inspection (e.g. Acorn or Babel's parser) walking the parsed tree for required declarations.
- **Python** — [Pyodide](https://pyodide.org/), a real Python distribution compiled to WebAssembly, runs fully client-side (confirmed actively developed and production-viable as of 2026). Structural checks are actually easier here than JS: Pyodide provides a real Python runtime, so the submitted class/function can be introspected with Python's own `ast`/`inspect` modules after execution, rather than needing a separate JS-side parser.
- **Java** — [CheerpJ](https://cheerpj.com/), a full JVM compiled to WebAssembly, confirmed to run entirely client-side with no server component (version 4.3 as of early 2026, active roadmap). **Open risk, flagged explicitly:** CheerpJ is proven for running Java applications/bytecode in-browser; compiling *raw source text a student just typed* end-to-end (rather than a pre-built app) should be validated with a small technical spike early in this phase, before the rest of the Java path is built out on top of it.

Every language's runtime is lazy-loaded (see Shared Infrastructure above) — a student who never opens a code question never downloads Pyodide or CheerpJ.

## Feature: Type-the-answer flashcards

```json
{
  "version": 1,
  "type": "flashcard",
  "title": "Linux Commands",
  "inputMode": "type",
  "questions": [
    { "id": "q1", "front": "List all files, including hidden ones", "back": "ls -a" }
  ]
}
```

`inputMode` is deck-level (not per-card) — a whole command-memorization deck consistently wants typed input, so mixing modes card-by-card wasn't worth the schema complexity. Default `"flip"` preserves every existing flashcard deck's current behavior unchanged.

When `inputMode: "type"`: the card shows an input box before the flip is available. Grading picks `answerMatching.matchNumeric` if `back` parses cleanly as a number, otherwise `matchNormalizedString` against `[back]` (a single accepted answer, unless a future revision adds a `backAlternates` array). After submission, the card flips to show the real `back` value alongside what the student typed, same spirit as Anki's "Type in the Answer" card type.

`src/features/flashcard/flashEngine.ts`'s `sortCard()` stays the single seam that decides pile membership — the typed-answer check happens before `sortCard()` is called, it doesn't change pile logic itself.

## Feature: Command-line syntax matching (lowest priority)

```json
{
  "id": "q5",
  "answerFormat": "command",
  "question": "Which command lists all files, including hidden ones, in long format?",
  "acceptedAnswers": ["ls -la", "ls -al"]
}
```

Not a real shell or filesystem simulation. Grading is `answerMatching.matchNormalizedString(input, acceptedAnswers)` — whitespace collapsed, short-flag clusters decomposed into an order-independent set. Anything genuinely different in syntax (e.g. `grep -r` vs `grep --recursive`) isn't unified automatically; the deck author (the generating AI, which already knows CLI equivalences) is expected to list every accepted form explicitly in `acceptedAnswers`. This pushes "what counts as equivalent" onto AI-generation time rather than requiring StudyDeck to encode per-tool argument grammar at runtime.

Usable as a standalone quiz question (`answerFormat: "command"`) or via a type-the-answer flashcard deck (`inputMode: "type"`) — both routes share the same `matchNormalizedString` call.
