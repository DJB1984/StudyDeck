---
type: format-spec
project: StudyDeck
tags: [studydeck, format-spec, flashcard, ai-generation]
---

# StudyDeck Flashcard Format Spec

Technical contract for a **flashcard**-type `.json` file for StudyDeck, a free study app. Follow it exactly, double-check **backslash-escaping** in any LaTeX, and run the **validation checklist** before output.

## 1. Schema

Cards use `front` / `back` — no distractors, no answer formats, no graphs or tables.

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

| Field | Required | Notes |
|---|---|---|
| `version` | **Yes** | Must be `1`. |
| `type` | **Yes** | Must be `"flashcard"`. |
| `title` | **Yes** | Shown on the home screen. |
| `questions` | **Yes** | Non-empty array. |
| `.id` | **Yes** | Short, unique, **stable** — `"q1"`, `"q2"`… Used for Know It / Still Learning pile progress, so never renumber existing cards when editing a deck; give new ones fresh ids. |
| `.front` | **Yes** | Card front. LaTeX supported. |
| `.back` | **Yes** | Card back. LaTeX supported. |

## 2. LaTeX

Inline `$...$`, rendered with KaTeX — standard math commands work (`\frac{}{}`, `\sqrt{}`, `^`, `_`, `\sin`, `\sum`, `\int`, `\pi`…), in both `front` and `back`.

### ⚠️ Backslash-escaping (the #1 mistake)

JSON uses `\` as an escape character, so **every** literal backslash must be doubled. A single one corrupts the LaTeX or invalidates the JSON outright.

```json
"back": "$\frac{1}{2}$"    ← WRONG (invalid JSON)
"back": "$\\frac{1}{2}$"   ← RIGHT
```

Before finalizing, scan every string for a single backslash followed by a letter and double it.

## 3. Card quality

Hold card *content* to a strict academic examiner's standard (a content standard only — your conversational tone stays friendly).

- **Material boundary:** cover only what the student's materials explicitly state — no outside knowledge. Invented *scenarios* are the one freedom, as long as everything needed to answer comes from the materials.
- **Difficulty:** calibrate to the rigor the materials themselves demonstrate. Don't ask what difficulty they want; adjust only if they raise it unprompted.
- **Source of terms:** if they gave an explicit glossary or bolded term list, use it directly — term on the `front`, definition on the `back`. From general notes or slides, pick out the key terms yourself.
- **One concept per card.** Keep `front` focused (a term, a formula, one concept) and `back` complete but uncluttered. Never cram multiple facts onto a card.
- **Self-contained:** no card should depend on another. Match the source material's exact notation and terminology.

## 4. Validation checklist

StudyDeck rejects the **entire file** if any of these fail — it will not silently skip bad cards.

- [ ] `version` is `1`; `title` is a non-empty string; `type` is exactly `"flashcard"`
- [ ] `questions` is non-empty; every card has a non-empty `id`, `front`, and `back`
- [ ] Every LaTeX backslash is doubled (`\\`)
- [ ] The whole file is valid JSON — no trailing commas, no unescaped quotes

<--- End of StudyDeck instructions --->
