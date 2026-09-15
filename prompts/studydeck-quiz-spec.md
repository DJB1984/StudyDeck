---
type: format-spec
project: StudyDeck
tags: [studydeck, format-spec, quiz, ai-generation]
---

# StudyDeck Quiz Format Spec

Technical contract for a **quiz**-type `.json` file for StudyDeck, a free study app. Follow it exactly, double-check **backslash-escaping** in any LaTeX, and run the **validation checklist** before output.

## 1. Schema

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
      "correct": 1
    }
  ]
}
```

| Field | Required | Notes |
|---|---|---|
| `version` | **Yes** | Must be `1`. |
| `type` | No | `"quiz"` (the default). |
| `title` | **Yes** | Shown on the home screen. |
| `questions` | **Yes** | Non-empty array. |
| `.id` | **Yes** | Short, unique, **stable** — `"q1"`, `"q2"`… Used for progress tracking, so never renumber existing questions when editing a deck; give new ones fresh ids. |
| `.question` | **Yes** | LaTeX via `$...$` / `$$...$$`. |
| `.answers` | **Yes** | **2 or more** strings — 4 is the usual choice, but use however many the question actually needs (mcq only — see §2). |
| `.correct` | **Yes** | Index into `answers` — `0` is the first choice, and the largest valid value is one less than the number of answers. |

## 2. Answer formats

The schema above is `"mcq"` — the default, and the right choice for most questions. To use another format, set `"answerFormat"` and swap in its fields; everything else (LaTeX, ids, quality, validation) is unchanged. Use one only where the material genuinely calls for that interaction, not for variety's sake.

| `answerFormat` | Use for | Replaces `answers`/`correct` with |
|---|---|---|
| `"multiSelect"` | Any number of correct options | `answers` (5–8 strings is typical for select-all) + `correctIndices` — in-range, non-duplicate. Graded all-or-nothing. |
| `"numeric"` | A typed or slider-dragged number | `correctValue` + `tolerance` (`0` = exact). Optional `inputWidget: "slider"`, which then **requires** `sliderMin` < `sliderMax` plus `sliderStep`. |
| `"order"` | Arranging steps into a sequence | `items` (≥2 `{id, text}`; StudyDeck shuffles them, so listing order isn't a spoiler) + `correctOrder` — the same ids, each exactly once. Graded exact-match. |
| `"code"` | Writing real code | `language` (`"javascript"` or `"python"` **only** — never `"java"`) + `checks`, needing at least one of `syntax` / `structure` / `tests`. Optional `starterCode`. |

For `multiSelect`, vary the number of correct options — usually two or more, sometimes a majority, occasionally just one. Never settle into one ratio like 3-of-5.

One example of each, as they'd appear inside `questions`:

```json
{ "id": "q2", "answerFormat": "multiSelect",
  "question": "Which of the following are signs of hypoglycemia? Select all that apply.",
  "answers": ["Sweating", "Confusion", "Fever", "Shakiness", "Bradycardia"],
  "correctIndices": [0, 1, 3] },
{ "id": "q3", "answerFormat": "numeric",
  "question": "An object accelerates from rest at $a = 9.8\\text{ m/s}^2$. Its velocity after $t=3$ s?",
  "correctValue": 29.4, "tolerance": 0.1 },
{ "id": "q4", "answerFormat": "order",
  "question": "Order these steps of the nursing process.",
  "items": [{ "id": "a", "text": "Assessment" }, { "id": "b", "text": "Diagnosis" },
            { "id": "c", "text": "Planning" }, { "id": "d", "text": "Evaluation" }],
  "correctOrder": ["a", "b", "c", "d"] },
{ "id": "q5", "answerFormat": "code",
  "question": "Write a function `reverse_string(s)` that returns the input string reversed.",
  "language": "python",
  "starterCode": "def reverse_string(s):\n    pass\n",
  "checks": {
    "syntax": true,
    "structure": { "requiredNames": ["reverse_string"] },
    "tests": [{ "call": "reverse_string('abc')", "expect": "'cba'" }] } }
```

For `code`, every `call`/`expect` must be a valid expression **in that question's own language** — not JSON, not pseudocode (`"True"` in Python, `"true"` in JavaScript). `structure` alone is fine when the point is shape, not behavior.

## 3. Context add-ons

A `"table"` or `"graph"` renders above the question as context, alongside any `answerFormat` including `mcq`. Prefer them as context ("the graph below shows…") over hiding a graph-dependent claim in the answer choices — and verify your own arithmetic, since answers that don't match the plotted values are the most common error here.

```json
"table": {
  "title": "Company X — Income Summary",
  "headers": ["Year", "Revenue", "Expenses"],
  "rows": [["2023", "$120,000", "$95,000"], ["2024", "$150,000", "$110,000"]] }

"graph": {
  "type": "points",
  "data": [[0, 0], [1, 9.8], [2, 19.6], [3, 29.4]],
  "x_label": "Time (s)", "y_label": "Velocity (m/s)", "title": "Velocity vs Time" }
```

- **`table`** — `title`, `headers`, `rows` all required; every row must be exactly as long as `headers`. LaTeX works in any cell.
- **`graph`** — `type` (`"points"` or `"equation"`), `data`, `x_label`, `y_label`, `title` all required; labels support LaTeX. `x_range` is required for `equation`, optional for `points`; optional `y_range` pins the y-axis. Either range may be given in any order — StudyDeck sorts them.

### Equation graphs are JavaScript — not LaTeX, not Python

For `"type": "equation"`, `data` is a **JavaScript expression string**, evaluated via `new Function('x', ...)` at 100 sample points across `x_range`.

| Math | ✅ Correct JS | ❌ Wrong |
|---|---|---|
| $x^2$ | `x * x` or `Math.pow(x, 2)` | `x^2` (JS `^` is XOR) |
| $\sin(x)$ | `Math.sin(x)` | `sin(x)` |
| $e^x$ | `Math.exp(x)` | `e^x` |
| $\sqrt{x}$ | `Math.sqrt(x)` | `sqrt(x)` |
| $\ln(x)$ | `Math.log(x)` | `ln(x)` |

`x_range` must not produce `NaN`/`Infinity` anywhere sampled (no negatives into `Math.sqrt`, no `0` into `1/x`) — one non-finite value replaces the whole chart with "Graph unavailable". For `"points"`, `data` is just `[x, y]` pairs, with no code evaluation involved.

## 4. LaTeX

Inline `$...$`, display `$$...$$`, rendered with KaTeX — standard math commands work (`\frac{}{}`, `\sqrt{}`, `^`, `_`, `\sin`, `\sum`, `\int`, `\pi`…), in questions, answers, and any graph/table label.

### ⚠️ Backslash-escaping (the #1 mistake)

JSON uses `\` as an escape character, so **every** literal backslash must be doubled. A single one corrupts the LaTeX or invalidates the JSON outright.

```json
"question": "Simplify $\frac{1}{2}$"    ← WRONG (invalid JSON)
"question": "Simplify $\\frac{1}{2}$"   ← RIGHT
```

Before finalizing, scan every string for a single backslash followed by a letter and double it.

## 5. Question quality

Hold question *content* to a strict academic examiner's standard (a content standard only — your conversational tone stays friendly).

- **Material boundary:** test only what the student's materials explicitly state — no outside knowledge. The one freedom is that *scenarios* may be invented, as long as everything needed to answer comes from the materials.
- **Difficulty:** calibrate to the rigor the materials themselves demonstrate — the material is the difficulty signal. Don't ask what difficulty they want; adjust only if they raise it unprompted.
- **Depth:** default to conceptual understanding, application, and analysis — what-ifs, relationships, compare/contrast. Rephrase rather than quote, so questions test understanding over recognition. Avoid definition-retrieval and trivia unless the material is itself definitional (glossaries, term lists).
- **Student preferences outrank all of the above.** Aim for mostly deep questions with a few warm-ups, and shift that mix freely with whatever they've told you.
- **How many options:** 4 by default. Drop to 2–3 where the question genuinely has only that many defensible choices (true/false, a binary increase/decrease, a three-way classification) rather than padding it with filler; go to 5–6 where the material really does offer that many plausible confusions. Vary it question to question as the content warrants — don't force every question to 4, and don't drift to short lists just to save effort.
- **Distractors:** every distractor highly plausible and closely related to the material, each requiring thought to rule out. Exactly one clearly correct answer. No filler, no "All/None of the above."
- **Self-contained:** no question should depend on another. Match the source material's exact notation and terminology.

## 6. Validation checklist

StudyDeck rejects the **entire file** if any of these fail — it will not silently skip bad questions.

- [ ] `version` is `1`; `title` is a non-empty string; `type`, if present, is `"quiz"`
- [ ] `questions` is non-empty; every question has a non-empty `id` and `question`
- [ ] mcq questions have **at least 2** `answers`, and an integer `correct` that indexes one of them
- [ ] Any other `answerFormat` has all of its own required fields from §2
- [ ] Any `table`/`graph` has its required fields, and your answers match its actual values
- [ ] Every LaTeX backslash is doubled (`\\`)
- [ ] The whole file is valid JSON — no trailing commas, no unescaped quotes

<--- End of StudyDeck instructions --->
