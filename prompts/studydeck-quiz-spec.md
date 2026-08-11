---
type: format-spec
project: StudyDeck
tags: [studydeck, format-spec, quiz, ai-generation]
---

# StudyDeck Quiz Format Spec

Technical contract for generating a **quiz**-type `.json` file that loads into StudyDeck, a free AI-agnostic study app — schema, LaTeX rules, question-quality bar, and validation checklist. (For flashcards, see the sibling `studydeck-flashcard-spec.md`.) Normally paired with a "how to respond" intro (`studydeck-quick-quiz-intro.md` / `studydeck-guided-quiz-intro.md`); either way, follow the schema exactly, double-check **JSON backslash-escaping** before writing LaTeX, and run the **validation checklist** before final output.

This covers `"mcq"`, the default answer format, which needs nothing beyond this file. Other formats (select-all-that-apply, numeric, drag-to-order, code, plus graph/table context) are documented in separate addenda you fetch on demand — see "Other answer formats" below.

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
      "correct": 1
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
| `questions[].id` | string | **Yes** | Unique, stable per question (see §3). |
| `questions[].question` | string | **Yes** | LaTeX via `$...$` / `$$...$$` supported. |
| `questions[].answers` | array of strings | **Yes** | **Exactly 4** entries. |
| `questions[].correct` | integer | **Yes** | Index into `answers`, so `0`–`3`. |

### Other answer formats

The schema above is `"mcq"` (the default) — set an explicit `"answerFormat"` field only to opt into something else. `"mcq"` is the only format that needs nothing beyond this file, so it's always the safe fallback.

If the material genuinely calls for a different interaction style, **fetch the matching spec below and follow it exactly** before writing that question — don't guess at its fields from the name alone. If you can't fetch a URL (no browsing available), just stick to `"mcq"`.

| `answerFormat` | Best for | Spec |
|---|---|---|
| `"multiSelect"` | "Select all that apply" — any number of options, any number correct | `studydeck.brookslanding.com/formats/multiselect.md` |
| `"numeric"` | A typed or slider-dragged numeric answer instead of picking from options | `studydeck.brookslanding.com/formats/numeric.md` |
| `"order"` | Drag a shuffled list of steps/items into the correct sequence | `studydeck.brookslanding.com/formats/order.md` |
| `"code"` | Write real code (JavaScript or Python) graded on syntax/structure/behavior | `studydeck.brookslanding.com/formats/code.md` |

A question can also carry context alongside any format above (including `"mcq"`):

| Add-on | Adds | Spec |
|---|---|---|
| `"table"` object | A small data table shown above the question | `studydeck.brookslanding.com/formats/table.md` |
| `"graph"` object | A Chart.js plot (points or equation) shown above the question | `studydeck.brookslanding.com/formats/graph.md` |

---

## 2. LaTeX Conventions

- Inline math: `$...$` — e.g. `$x = 5$`
- Display (block) math: `$$...$$` — e.g. `$$\int_0^1 x^2\,dx$$`
- Rendered with KaTeX. Standard LaTeX math commands work: `\frac{}{}`, `\sqrt{}`, `^`, `_`, `\sin`, `\cos`, `\ln`, `\sum`, `\int`, `\pm`, Greek letters (`\pi`, `\theta`), etc.
- LaTeX is supported in `question`/`answers`; also in a graph's labels/title or a table's cells if you use those add-ons (see their own specs).

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

## 3. Stable Question IDs

- Use short, sequential, unique ids: `"q1"`, `"q2"`, ... `"q24"`.
- IDs are used internally for stats tracking — **they must stay the same** for a given question even if you reorder questions later.
- If you edit an existing deck and add new questions, give the new ones new ids that don't collide with existing ones (don't renumber everything — that silently resets a returning student's progress on unrelated questions).

---

## 4. Question Quality

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
- If you used a graph or table add-on, double-check your own arithmetic — verify the values actually produce the numbers your answer choices claim, and prefer them as question *context* rather than putting a graph/table-dependent claim only in the answer choices.
- Keep each question self-contained — a student shouldn't need information from a different one to answer it.
- Match the exact notation and terminology used in the source material, so the deck feels consistent with their class.

---

## 5. Validation Checklist

StudyDeck rejects the entire file if any of these fail — it will *not* silently skip bad questions, so get this right before outputting:

- [ ] Top-level `version` is present and equals `1`
- [ ] Top-level `title` is a non-empty string
- [ ] If present, top-level `type` is exactly `"quiz"`
- [ ] Top-level `questions` is a non-empty array
- [ ] Every question has a non-empty `id`
- [ ] Every question has a non-empty `question` string
- [ ] If `answerFormat` is omitted or `"mcq"`: `answers` has **exactly 4** entries, and `correct` is an integer `0`–`3`
- [ ] If you used any other `answerFormat`, or a `table`/`graph` add-on: you fetched its spec and also satisfy *its* checklist additions
- [ ] Every backslash inside a LaTeX string is doubled (`\\`) for valid JSON
- [ ] The whole file is valid JSON (no trailing commas, no unescaped quotes)

---

## 6. Ready-to-Use Prompt Template

For sending this file on its own, without one of the paired intros (which already include a delivery-format instruction) — attach this as your message:

```
Generate a StudyDeck .json quiz for [topic] with [N] questions, based on
the following materials: [paste your notes / textbook excerpt / slides here]

Follow the format spec above exactly. Escape every backslash as \\ in LaTeX
(e.g. \\frac, \\sqrt), only fetch and use a non-mcq answer format or a
graph/table if the material genuinely calls for it, and double-check that
"correct" and any graph/table values are accurate.

Reply with one short line telling me to paste the result into StudyDeck,
then the JSON in a single code block — nothing else.
```

<--- End of StudyDeck instructions --->
