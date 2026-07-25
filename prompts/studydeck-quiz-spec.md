---
type: format-spec
project: StudyDeck
tags: [studydeck, format-spec, quiz, ai-generation]
---

# StudyDeck Quiz Format Spec

Technical contract for generating a **quiz**-type `.json` file that loads into StudyDeck, a free AI-agnostic study app — schema, LaTeX/graph rules, question-quality bar, and validation checklist. (For flashcards, see the sibling `studydeck-flashcard-spec.md`.) Normally paired with a "how to respond" intro (`studydeck-quick-intro.md` / `studydeck-guided-intro.md`); either way, follow the schema exactly, double-check **JSON backslash-escaping** before writing LaTeX, and run the **validation checklist** before final output.

---

## 1. Quiz Schema

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

| Field | Type | Required | Notes |
|---|---|---|---|
| `version` | integer | **Yes** | Must be `1`. |
| `type` | string | No | `"quiz"`. Default if omitted. |
| `title` | string | **Yes** | Shown on the home screen and at quiz start. |
| `questions` | array | **Yes** | Must contain at least one question. |
| `questions[].id` | string | **Yes** | Unique, stable per question (see §4). |
| `questions[].question` | string | **Yes** | LaTeX via `$...$` / `$$...$$` supported. |
| `questions[].answers` | array of strings | **Yes** | **Exactly 4** entries. |
| `questions[].correct` | integer | **Yes** | Index into `answers`, so `0`–`3`. |
| `questions[].graph` | object | No | Omit the key entirely if there's no graph — don't set it to `null`. |

### Answer formats

Every question supports an optional `"answerFormat"` field. Omit it (or set `"mcq"`) for classic 4-answer multiple choice. StudyDeck also supports the formats below — use whichever genuinely fits the material, don't force everything into mcq:

| `answerFormat` | Best for |
|---|---|
| `"mcq"` (default) | Standard 4-option multiple choice |
| `"multiSelect"` | "Select all that apply" — any number of options, any number correct |
| `"numeric"` | A typed or slider-dragged numeric answer instead of picking from options |
| `"order"` | Drag a shuffled list of steps/items into the correct sequence |
| `"code"` | Write real code (JavaScript or Python) and get it graded on syntax/structure/behavior |

Each is detailed below. A question can also carry a `"table"` object as context alongside any of these formats, the same way `"graph"` already works.

#### `"multiSelect"` — select all that apply

```json
{
  "id": "q3",
  "answerFormat": "multiSelect",
  "question": "Which of the following are signs of hypoglycemia? Select all that apply.",
  "answers": ["Sweating", "Confusion", "Fever", "Shakiness"],
  "correctIndices": [0, 1, 3]
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `answers` | array of strings | **Yes** | **Not** locked to 4 — real "select all" questions commonly have 5-8 options. |
| `correctIndices` | array of integers | **Yes** | Indices into `answers`; must be in-range and non-duplicate. Grading is all-or-nothing (the exact correct set), no partial credit. |

#### `"numeric"` — typed or slider numeric answer

```json
{
  "id": "q4",
  "answerFormat": "numeric",
  "question": "An object accelerates from rest at $a = 9.8\\text{ m/s}^2$. What is its velocity after $t=3$ s?",
  "correctValue": 29.4,
  "tolerance": 0.1
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `correctValue` | number | **Yes** | The correct numeric answer. |
| `tolerance` | number | **Yes** | How far off still counts as correct — `0` for an exact integer, a small decimal for a rounded physical quantity. |
| `inputWidget` | string | No | `"text"` (default) or `"slider"`. |
| `sliderMin` / `sliderMax` / `sliderStep` | number | **Required if `inputWidget` is `"slider"`** | Draggable range and step size; `sliderMin` must be less than `sliderMax`. |

Don't include `answers` or `correct` on a `numeric` question — they're ignored.

#### `"order"` — drag-to-order

```json
{
  "id": "q5",
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

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of `{id, text}` | **Yes** | At least 2 entries; `id`s just need to be unique within the question. StudyDeck shuffles `items` for display, so listing order doesn't matter and isn't a spoiler. |
| `correctOrder` | array of strings | **Yes** | The `id`s from `items` in the correct sequence — same set as `items`, each exactly once. |

Grading is exact-sequence match, all-or-nothing.

#### `"code"` — write real code

```json
{
  "id": "q6",
  "answerFormat": "code",
  "question": "Write a function `reverse_string(s)` that returns the input string reversed.",
  "language": "python",
  "starterCode": "def reverse_string(s):\n    pass\n",
  "checks": {
    "syntax": true,
    "structure": { "requiredNames": ["reverse_string"] },
    "tests": [
      { "call": "reverse_string('abc')", "expect": "'cba'" },
      { "call": "reverse_string('')", "expect": "''" }
    ]
  }
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `language` | string | **Yes** | `"javascript"` or `"python"` **only** — Java isn't supported yet, don't generate `language: "java"`. |
| `starterCode` | string | No | Pre-filled editor content — usually a function/class signature with an empty body for the student to fill in. |
| `checks.syntax` | boolean | No | `true` gates the rest of grading on the code actually parsing. |
| `checks.structure` | object | No | `{ "requiredNames": [...] }` — names (function/class/variable) that must be declared somewhere in the submission. Good for "write a class with this shape" questions that don't need behavioral tests. |
| `checks.tests` | array of `{call, expect}` | No | Each `call`/`expect` must be a valid expression **in the question's own `language`** — not JSON, not pseudocode. `expect` is evaluated like `call`, so it can be any literal: `"5"`, `"'cba'"`, `"[1, 2, 3]"`, `"True"` (Python) / `"true"` (JavaScript). |
| Don't include | — | — | `answers`/`correct` are not used for `code` questions. |

At least one of `checks.syntax` / `checks.structure` / `checks.tests` must be present — a structure-only question (no `tests`) is fine when the point is "did you write a valid shape," not behavior.

### Table object (any question, when present)

A `"table"` renders a small data table above the question — the same context role `"graph"` plays. Works alongside any `answerFormat` above.

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

| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | string | **Yes** | Supports `$...$` LaTeX. |
| `headers` | array of strings | **Yes** | Non-empty. Supports `$...$` LaTeX per cell. |
| `rows` | array of arrays of strings | **Yes** | Non-empty. Every row must have exactly as many entries as `headers`. Supports `$...$` LaTeX per cell. |

### Graph object (when present)

| Field | Type | Required | Notes |
|---|---|---|---|
| `type` | string | **Yes** | `"points"` or `"equation"`. |
| `data` | array or string | **Yes** | Array of `[x, y]` pairs if `points`; a **JavaScript** expression string if `equation` (see §3). |
| `x_range` | `[min, max]` | Required for `equation`, optional for `points` | Order doesn't matter — StudyDeck normalizes min/max automatically. Points auto-fit the axis if omitted. |
| `y_range` | `[min, max]` | No | Pins the y-axis instead of auto-fitting — use if the data range would zoom oddly. |
| `x_label` | string | **Yes** | Supports `$...$` LaTeX. |
| `y_label` | string | **Yes** | Supports `$...$` LaTeX. |
| `title` | string | **Yes** | Supports `$...$` LaTeX. |

---

## 2. LaTeX Conventions

- Inline math: `$...$` — e.g. `$x = 5$`
- Display (block) math: `$$...$$` — e.g. `$$\int_0^1 x^2\,dx$$`
- Rendered with KaTeX. Standard LaTeX math commands work: `\frac{}{}`, `\sqrt{}`, `^`, `_`, `\sin`, `\cos`, `\ln`, `\sum`, `\int`, `\pm`, Greek letters (`\pi`, `\theta`), etc.
- LaTeX is supported in `question`/`answers`, and in a graph's `x_label` / `y_label` / `title`.

### ⚠️ JSON backslash-escaping (the #1 mistake)

JSON strings use `\` as an escape character, so every literal backslash in your LaTeX must be written as `\\`. A single backslash corrupts the LaTeX or produces invalid JSON outright.

**Wrong** (invalid JSON — `\f` is not a legal escape in this position):
```json
"question": "Simplify $\frac{1}{2}$"
```

**Right** (double backslash):
```json
"question": "Simplify $\\frac{1}{2}$"
```

This applies to every LaTeX command: `\\sin`, `\\sqrt`, `\\frac`, `\\theta`, `\\pm`, `\\dfrac`, etc. Before finalizing your output, scan every string for single backslashes followed by a letter and double them.

---

## 3. Graph Equations Are JavaScript, Not LaTeX or Python

For `"type": "equation"`, the `data` string is evaluated in the browser via `new Function('x', 'return (' + data + ')')` — it must be **valid JavaScript**, evaluated once per sample point across `x_range` (100 samples), *not* LaTeX and *not* Python.

| Math notation | ✅ Correct JS for `data` | ❌ Wrong |
|---|---|---|
| $x^2$ | `x * x` or `Math.pow(x, 2)` | `x^2` (JS `^` is XOR, not exponent) |
| $\sin(x)$ | `Math.sin(x)` | `sin(x)` |
| $e^x$ | `Math.exp(x)` | `e^x` |
| $\sqrt{x}$ | `Math.sqrt(x)` | `sqrt(x)` |
| $\ln(x)$ | `Math.log(x)` | `ln(x)` |
| $\frac{1}{x}$ | `1 / x` | `1/x` is actually fine, just don't write a fraction-style string |

Other rules for equation graphs:
- `x_range` must avoid producing `NaN`/`Infinity` anywhere sampled — e.g. no negative numbers into `Math.sqrt`, no `0` into `1/x`. Any non-finite value anywhere shows "Graph unavailable" instead of the chart.
- `x_range` and `y_range` can be given in either order (`[5, -5]` works the same as `[-5, 5]`) — StudyDeck sorts them automatically.

For `"type": "points"`, `data` is a plain array of `[x, y]` number pairs — no code evaluation involved.

---

## 4. Stable Question IDs

- Use short, sequential, unique ids: `"q1"`, `"q2"`, ... `"q24"`.
- IDs are used internally for stats tracking — **they must stay the same** for a given question even if you reorder questions later.
- If you edit an existing deck and add new questions, give the new ones new ids that don't collide with existing ones (don't renumber everything — that silently resets a returning student's progress on unrelated questions).

---

## 5. Question Quality

Hold your question *content* to a strict academic examiner's standard. (This is a content standard only — your conversational tone stays friendly, per §0.)

### Material boundary (everything)

- Test **only** the facts, concepts, and relationships explicitly stated in the student's materials — no outside knowledge, no external course content.
- The one freedom: **scenarios may be invented.** A what-if/application question can wrap the material's concepts in a novel hypothetical (a hockey puck the notes never mentioned, a fictional patient) as long as everything needed to *answer* it comes from the materials.

### Difficulty — set by the material, not by asking

- Calibrate difficulty to the rigor the student's own materials already demonstrate: bare-definition slides stay at that level, multi-step problem sets get matched at that level. The material *is* the difficulty signal.
- Don't ask the student what difficulty they want — only adjust it if they bring it up unprompted (e.g. "make it harder than my notes").

### Cognitive depth

- Default to **conceptual understanding, application, and analysis**: what-if scenarios, relationships between concepts, compare/contrast. Rephrase the material rather than quoting it, so questions test understanding, not recognition.
- Avoid simple definition-retrieval and factual trivia (dates, vocabulary matches) **by default** — with two exceptions:
  - The material itself is inherently definitional (term lists, vocab-heavy notes) — then definition questions are fine, even in a normal quiz.
  - The student's stated preferences call for easier or recall-style questions.
- **Student preferences always outrank these defaults** — this section exists to produce *good* questions for them, not to pelt them with maximally hard ones. Aim for mostly deep questions with a few comprehension warm-ups, and shift that mix freely with whatever they've told you during tailoring.
- Make the **3 distractors highly plausible and deeply related to the material** — each should require careful thought to rule out. No lazy filler, and no "All of the above" / "None of the above" (no room for them in a fixed 4-option format). Exactly **one** clearly correct answer.
- Double-check your own arithmetic — if a question references a graph, verify the equation or data points actually produce the numbers your answer choices claim. A wrong `correct` index or an answer that doesn't match the graph's actual values is the most common AI-generated error.
- Prefer graphs as question *context* (e.g. "the graph below shows...") rather than putting a graph-dependent claim in the answer choices themselves.
- Keep each question self-contained — a student shouldn't need information from a different one to answer it.
- Match the exact notation and terminology used in the source material, so the deck feels consistent with their class.

---

## 6. Validation Checklist

StudyDeck rejects the entire file if any of these fail — it will *not* silently skip bad questions, so get this right before outputting:

- [ ] Top-level `version` is present and equals `1`
- [ ] Top-level `title` is a non-empty string
- [ ] If present, top-level `type` is exactly `"quiz"`
- [ ] Top-level `questions` is a non-empty array
- [ ] Every question has a non-empty `id`
- [ ] Every question has a non-empty `question` string
- [ ] If `answerFormat` is omitted or `"mcq"`: `answers` has **exactly 4** entries, and `correct` is an integer `0`–`3`
- [ ] If `answerFormat` is `"multiSelect"`: `answers` is non-empty, `correctIndices` is a non-empty array of in-range, non-duplicate indices
- [ ] If `answerFormat` is `"numeric"`: `correctValue` and `tolerance` are both numbers; if `inputWidget` is `"slider"`, `sliderMin`/`sliderMax`/`sliderStep` are all present and `sliderMin < sliderMax`
- [ ] If `answerFormat` is `"order"`: `items` has at least 2 entries, and `correctOrder` contains exactly the same ids as `items`, each once
- [ ] If `answerFormat` is `"code"`: `language` is `"javascript"` or `"python"` (never `"java"`), and `checks` has at least one of `syntax`/`structure`/`tests`
- [ ] If a question has a `graph` object: `type`, `x_label`, `y_label`, and `title` are all present
- [ ] If `graph.type` is `"equation"`: `x_range` is present
- [ ] If `graph.x_range` is present: it's an array of exactly 2 numbers
- [ ] If `graph.y_range` is present: it's an array of exactly 2 numbers
- [ ] If a question has a `table` object: `title` is present, `headers` is non-empty, and every `rows` entry has the same length as `headers`
- [ ] Every backslash inside a LaTeX string is doubled (`\\`) for valid JSON
- [ ] The whole file is valid JSON (no trailing commas, no unescaped quotes)

---

## 7. Ready-to-Use Prompt Template

For sending this file on its own, without one of the paired intros (which already include a delivery-format instruction) — attach this as your message:

```
Generate a StudyDeck .json quiz for [topic] with [N] questions, based on
the following materials: [paste your notes / textbook excerpt / slides here]

Follow the format spec above exactly. Escape every backslash as \\ in LaTeX
(e.g. \\frac, \\sqrt), only add a "graph" if the question genuinely needs
one, and double-check that "correct" and any graph values are accurate.

Reply with one short line telling me to paste the result into StudyDeck,
then the JSON in a single code block — nothing else.
```

<--- End of StudyDeck instructions --->
