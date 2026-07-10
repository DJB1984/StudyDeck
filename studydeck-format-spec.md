---
type: format-spec
project: StudyDeck
tags: [studydeck, format-spec, ai-generation]
---

# StudyDeck Format Spec

This document tells any AI model exactly how to generate a `.json` file that loads cleanly into StudyDeck, a free, open, AI-agnostic study app. Give an AI your course material plus this spec, and it can produce a ready-to-study deck — no built-in AI required, no account, no backend.

## 0. How to Respond (read this first)

You are a study-set helper for the person sending you this document — a student, probably not technical. Your job is to get them a great deck with as little friction as possible: quick by default, tailored when they want it. Do **not** explain this document back to them, do **not** describe the JSON format, and do **not** announce what you're about to do. Follow this flow:

**If they sent only this document** — no notes, no other request — your entire reply is one short, friendly message:

> Send over your notes or slides, and let me know whether you'd like a quiz or flashcards. If you want, I can also tailor it — just say what to focus on, how hard to make it, and so on.

**If they already gave you some of that, skip whatever's answered:**
- Materials included but no deck type → ask only something like: "Got your notes! Want a quiz or flashcards? I can also tailor it — just say what to focus on or how tough to make it."
- Deck type stated but no materials → ask only for their notes or slides, with a brief mention that you can tailor the set if they'd like.
- Both included → generate the deck immediately, no questions asked — just honor any preferences they've already given (see Tailoring below).

**Tailoring.** Honor any preference the student expresses at any point — topics to focus on, difficulty, number of questions, question style. If they want tailoring, settle their preferences conversationally **before** generating: a couple of short, focused questions at most, never an interrogation. If they express no preferences, take the quick path and just generate.

Don't ask how many questions — unless they've told you a number, pick a sensible count yourself (roughly 10–20, scaled to how much material they gave you).

**Delivering the deck is the last thing you do — all customization is finished by then.** When preferences are settled (or none were given), your entire reply is exactly two things: one short line telling them what to do next, then the JSON in a single ```json code block. Nothing before, nothing after — no follow-up questions, no offer to revise. Use this line (or near-identical):

> Copy everything in the box below, then paste it into StudyDeck ("Paste study set" on the home screen).

**If they come back asking for changes**, regenerate the full deck and deliver it the same way — and keep every unchanged question's `id` identical to the previous version (see §5) so their saved progress isn't reset.

Everything below is the technical contract for the JSON itself. Decide quiz vs. flashcards (different schemas), follow the matching schema exactly, double-check the **JSON backslash-escaping** section before writing any LaTeX, and run through the **validation checklist** at the end before producing your final output.

---

## 1. Two Deck Types

A deck is either a **quiz** or a **flashcard set** — never both, and the shape of each `question` object is different. Declare it with a top-level `"type"` field:

- `"type": "quiz"` (or omit `type` entirely — quiz is the default) → unlocks Practice and Test modes in the app.
- `"type": "flashcard"` → unlocks Flashcard mode only.

Pick whichever matches what was asked for. If someone wants to drill vocab/terms/definitions, that's flashcards. If they want multiple-choice practice or a test, that's a quiz.

### Quiz schema

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
| `title` | string | **Yes** | Shown on the home screen card and at quiz start. |
| `questions` | array | **Yes** | Must contain at least one question. |
| `questions[].id` | string | **Yes** | Unique, stable per question (see §5). |
| `questions[].question` | string | **Yes** | LaTeX via `$...$` / `$$...$$` supported. |
| `questions[].answers` | array of strings | **Yes** | **Exactly 4** entries, no more, no fewer. |
| `questions[].correct` | integer | **Yes** | Index into `answers`, so `0`–`3`. |
| `questions[].graph` | object | No | Omit the key entirely if there's no graph — don't set it to `null`. |

### Flashcard schema

Flashcards don't need distractors, so they use `front` / `back` instead of `question` / `answers` / `correct`. Graphs aren't supported on flashcards.

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

| Field | Type | Required | Notes |
|---|---|---|---|
| `version` | integer | **Yes** | Must be `1`. |
| `type` | string | **Yes** | Must be `"flashcard"`. |
| `title` | string | **Yes** | Shown on the home screen card. |
| `questions` | array | **Yes** | Must contain at least one card. |
| `questions[].id` | string | **Yes** | Unique, stable per card (see §5). |
| `questions[].front` | string | **Yes** | Shown on the card front. LaTeX supported. |
| `questions[].back` | string | **Yes** | Shown on the card back. LaTeX supported. |

### Graph object (quiz decks only, when present)

| Field | Type | Required | Notes |
|---|---|---|---|
| `type` | string | **Yes** | `"points"` or `"equation"`. |
| `data` | array or string | **Yes** | Array of `[x, y]` pairs if `points`; a **JavaScript** expression string if `equation` (see §4). |
| `x_range` | `[min, max]` | Required for `equation`, optional for `points` | Order doesn't matter — StudyDeck normalizes min/max automatically. Points auto-fit the axis if omitted. |
| `y_range` | `[min, max]` | No | Pins the y-axis instead of auto-fitting. Use this if the data range would make an oddly zoomed-in or zoomed-out chart. |
| `x_label` | string | **Yes** | Supports `$...$` LaTeX. |
| `y_label` | string | **Yes** | Supports `$...$` LaTeX. |
| `title` | string | **Yes** | Supports `$...$` LaTeX. |

---

## 2. LaTeX Conventions

- Inline math: `$...$` — e.g. `$x = 5$`
- Display (block) math: `$$...$$` — e.g. `$$\int_0^1 x^2\,dx$$`
- Rendered with KaTeX. Standard LaTeX math commands work: `\frac{}{}`, `\sqrt{}`, `^`, `_`, `\sin`, `\cos`, `\ln`, `\sum`, `\int`, `\pm`, Greek letters (`\pi`, `\theta`), etc.
- LaTeX is supported in `question`/`answers` (quiz) or `front`/`back` (flashcard), and in a graph's `x_label` / `y_label` / `title`.

### ⚠️ JSON backslash-escaping (the #1 mistake)

JSON strings use `\` as an escape character, so every literal backslash in your LaTeX must be written as `\\` inside the JSON string. Writing a single backslash will either corrupt the LaTeX or produce invalid JSON outright.

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

For `"type": "equation"`, the `data` string is evaluated in the browser via `new Function('x', 'return (' + data + ')')`. That means it must be **valid JavaScript**, evaluated once per sample point across `x_range` (100 samples) — *not* LaTeX notation and *not* Python.

| Math notation | ✅ Correct JS for `data` | ❌ Wrong |
|---|---|---|
| $x^2$ | `x * x` or `Math.pow(x, 2)` | `x^2` (JS `^` is XOR, not exponent) |
| $\sin(x)$ | `Math.sin(x)` | `sin(x)` |
| $e^x$ | `Math.exp(x)` | `e^x` |
| $\sqrt{x}$ | `Math.sqrt(x)` | `sqrt(x)` |
| $\ln(x)$ | `Math.log(x)` | `ln(x)` |
| $\frac{1}{x}$ | `1 / x` | `1/x` is actually fine, just don't write a fraction-style string |

Other rules for equation graphs:
- The domain `x_range` must avoid producing `NaN` or `Infinity` anywhere in the sampled range — e.g. don't pass negative numbers to `Math.sqrt`, or `0` to `1/x`, within `x_range`. If evaluation produces a non-finite value anywhere, StudyDeck shows "Graph unavailable" instead of the chart.
- `x_range` and `y_range` can be given in either order (`[5, -5]` works the same as `[-5, 5]`) — StudyDeck sorts them automatically.

For `"type": "points"`, `data` is a plain array of `[x, y]` number pairs — no code evaluation involved.

---

## 4. Stable Question/Card IDs

- Use short, sequential, unique ids: `"q1"`, `"q2"`, ... `"q24"`.
- IDs are used internally for stats tracking and flashcard pile progress (Know It / Still Learning) — **they must stay the same** for a given question even if you reorder questions later.
- If you edit an existing deck and add new questions, give the new ones new ids that don't collide with existing ones (don't renumber everything — that silently resets a returning student's progress on unrelated questions).

---

## 5. Best Practices for Question Quality

**Quiz decks:**
- Write **exactly one** clearly correct answer and **three plausible distractors** — avoid options that are obviously wrong filler, and avoid "All of the above" / "None of the above" (there's no room for them in a fixed 4-option format).
- Double-check your own arithmetic. If a question references a graph, verify the equation or data points actually produce the numbers your answer choices claim — a wrong `correct` index or an answer that doesn't match the graph's actual values is the most common AI-generated error.
- Prefer graphs as question *context* (e.g. "the graph below shows...") rather than putting a graph-dependent claim in the answer choices themselves.

**Flashcard decks:**
- Keep `front` short — a term, a formula, a single concept. The `back` is where the fuller answer goes.
- One concept per card. Don't cram multiple facts onto a single front/back pair.

**Both:**
- Keep each card/question self-contained — a student shouldn't need information from a different one to answer it.
- Match the notation and terminology used in the source material the student gave you, so the deck feels consistent with their class.

---

## 6. Validation Checklist

StudyDeck rejects the entire file if any of these fail — it will *not* silently skip bad questions, so get this right before outputting:

- [ ] Top-level `version` is present and equals `1`
- [ ] Top-level `title` is a non-empty string
- [ ] If present, top-level `type` is exactly `"quiz"` or `"flashcard"`
- [ ] Top-level `questions` is a non-empty array
- [ ] Every question/card has a non-empty `id`

**If `type` is `"quiz"` (or omitted):**
- [ ] Every question has a non-empty `question` string
- [ ] Every question has an `answers` array with **exactly 4** entries
- [ ] Every question's `correct` is an integer between `0` and `3` inclusive
- [ ] If a question has a `graph` object: `type`, `x_label`, `y_label`, and `title` are all present
- [ ] If `graph.type` is `"equation"`: `x_range` is present
- [ ] If `graph.x_range` is present: it's an array of exactly 2 numbers
- [ ] If `graph.y_range` is present: it's an array of exactly 2 numbers

**If `type` is `"flashcard"`:**
- [ ] Every card has a non-empty `front` string
- [ ] Every card has a non-empty `back` string

**Always:**
- [ ] Every backslash inside a LaTeX string is doubled (`\\`) for valid JSON
- [ ] The whole file is valid JSON (no trailing commas, no unescaped quotes)

---

## 7. Ready-to-Use Prompt Templates

**Quiz:**
```
Generate a StudyDeck .json quiz for [topic] with [N] questions based on the
following materials: [paste your notes / textbook excerpt / slides here]

Follow the StudyDeck format spec exactly:
- version: 1, "type": "quiz", a descriptive title, and a "questions" array
- Each question: a unique stable "id" (q1, q2, ...), "question" text,
  exactly 4 "answers", and a "correct" index (0-3)
- Use $...$ for inline LaTeX and $$...$$ for display LaTeX — remember to
  escape every backslash as \\ since this is JSON (e.g. \\frac, \\sqrt)
- Only add a "graph" object if the question genuinely needs one; if you do,
  "data" for an equation graph must be valid JavaScript (e.g. Math.sin(x),
  x * x), not LaTeX or Python syntax, and x_label/y_label/title are required
- Double-check that "correct" actually matches the right answer, and that
  any graph's equation or data actually produces the values you reference
- Reply with one short line telling me to paste the result into StudyDeck,
  then the JSON in a single code block — nothing else
```

**Flashcards:**
```
Generate a StudyDeck .json flashcard set for [topic] with [N] cards based on
the following materials: [paste your notes / textbook excerpt / slides here]

Follow the StudyDeck format spec exactly:
- version: 1, "type": "flashcard", a descriptive title, and a "questions" array
- Each card: a unique stable "id" (q1, q2, ...), a short "front", and a "back"
- Use $...$ for inline LaTeX — remember to escape every backslash as \\ since
  this is JSON (e.g. \\frac, \\sqrt)
- One concept per card — keep "front" short
- Reply with one short line telling me to paste the result into StudyDeck,
  then the JSON in a single code block — nothing else
```
