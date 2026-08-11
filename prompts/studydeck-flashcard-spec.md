---
type: format-spec
project: StudyDeck
tags: [studydeck, format-spec, flashcard, ai-generation]
---

# StudyDeck Flashcard Format Spec

Technical contract for generating a **flashcard**-type `.json` file that loads into StudyDeck, a free AI-agnostic study app — schema, LaTeX rules, question-quality bar, and validation checklist. (For quizzes, see the sibling `studydeck-quiz-spec.md`.) Normally paired with a "how to respond" intro (`studydeck-quick-flashcard-intro.md` / `studydeck-guided-flashcard-intro.md`); either way, follow the schema exactly, double-check **JSON backslash-escaping** before writing LaTeX, and run the **validation checklist** before final output.

---

## 1. Flashcard Schema

Flashcards don't need distractors, so cards use `front` / `back` rather than `question` / `answers` / `correct`. Graphs aren't supported on flashcards.

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
| `questions[].id` | string | **Yes** | Unique, stable per card (see §3). |
| `questions[].front` | string | **Yes** | Shown on the card front. LaTeX supported. |
| `questions[].back` | string | **Yes** | Shown on the card back. LaTeX supported. |

---

## 2. LaTeX Conventions

- Inline math: `$...$` — e.g. `$x = 5$`
- Rendered with KaTeX. Standard LaTeX math commands work: `\frac{}{}`, `\sqrt{}`, `^`, `_`, `\sin`, `\cos`, `\ln`, `\sum`, `\int`, `\pm`, Greek letters (`\pi`, `\theta`), etc.
- LaTeX is supported in both `front` and `back`.

### ⚠️ JSON backslash-escaping (the #1 mistake)

JSON strings use `\` as an escape character, so every literal backslash in your LaTeX must be written as `\\`. A single backslash corrupts the LaTeX or produces invalid JSON outright.

**Wrong** (invalid JSON — `\f` is not a legal escape in this position):
```json
"back": "$\frac{1}{2}$"
```

**Right** (double backslash):
```json
"back": "$\\frac{1}{2}$"
```

This applies to every LaTeX command: `\\sin`, `\\sqrt`, `\\frac`, `\\theta`, `\\pm`, `\\dfrac`, etc. Before finalizing your output, scan every string for single backslashes followed by a letter and double them.

---

## 3. Stable Card IDs

- Use short, sequential, unique ids: `"q1"`, `"q2"`, ... `"q24"`.
- IDs are used internally for flashcard pile progress (Know It / Still Learning) — **they must stay the same** for a given card even if you reorder cards later.
- If you edit an existing deck and add new cards, give the new ones new ids that don't collide with existing ones (don't renumber everything — that silently resets a returning student's progress on unrelated cards).

---

## 4. Question Quality

Hold your card *content* to a strict academic examiner's standard. (This is a content standard only — your conversational tone stays friendly, per §0.)

### Material boundary (everything)

- Test **only** the facts, concepts, and relationships explicitly stated in the student's materials — no outside knowledge, no external course content.
- The one freedom: **scenarios may be invented.** A what-if/application card can wrap the material's concepts in a novel hypothetical as long as everything needed to *answer* it comes from the materials.

### Difficulty — set by the material, not by asking

- Calibrate difficulty to the rigor the student's own materials already demonstrate. The material *is* the difficulty signal.
- Don't ask the student what difficulty they want — only adjust it if they bring it up unprompted (e.g. "make it harder than my notes").

### Active recall

- **If the student provided explicit terms/definitions** (e.g. a bolded list or glossary): use them directly — the term becomes the `front`, its definition the `back`.
- **If they provided slides or general notes**: identify the most important core terms and concepts yourself.
- One concept per card — keep `front` focused (a term, a formula, a single concept) and `back` clear but complete. Don't cram multiple facts onto one card.
- Keep each card self-contained — a student shouldn't need information from a different one to answer it.
- Match the exact notation and terminology used in the source material, so the deck feels consistent with their class.

---

## 5. Validation Checklist

StudyDeck rejects the entire file if any of these fail — it will *not* silently skip bad cards, so get this right before outputting:

- [ ] Top-level `version` is present and equals `1`
- [ ] Top-level `title` is a non-empty string
- [ ] Top-level `type` is exactly `"flashcard"`
- [ ] Top-level `questions` is a non-empty array
- [ ] Every card has a non-empty `id`
- [ ] Every card has a non-empty `front` string
- [ ] Every card has a non-empty `back` string
- [ ] Every backslash inside a LaTeX string is doubled (`\\`) for valid JSON
- [ ] The whole file is valid JSON (no trailing commas, no unescaped quotes)

---

## 6. Ready-to-Use Prompt Template

For sending this file on its own, without one of the paired intros (which already include a delivery-format instruction) — attach this as your message:

```
Generate a StudyDeck .json flashcard set for [topic] with [N] cards, based
on the following materials: [paste your notes / textbook excerpt / slides here]

Follow the format spec above exactly. Escape every backslash as \\ in LaTeX
(e.g. \\frac, \\sqrt), and keep one concept per card.

Reply with one short line telling me to paste the result into StudyDeck,
then the JSON in a single code block — nothing else.
```

<--- End of StudyDeck instructions --->
