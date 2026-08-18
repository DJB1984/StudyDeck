---
type: format-spec
project: StudyDeck
tags: [studydeck, format-spec, flashcard, ai-generation]
---

# StudyDeck Flashcard Format Spec

Technical contract for a **flashcard**-type `.json` file for StudyDeck, a free study app. Follow it exactly, double-check **backslash-escaping** in any LaTeX, and run the **validation checklist** before output.

## 1. Schema

Cards use `front` / `back` — no distractors, no answer formats. A card may carry one optional graph (§2).

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
| `.graph` | No | One optional graph on the card — see §2. |
| `.graphSide` | No | `"front"` (default) or `"back"` — which face the graph appears on. |

## 2. Graphs (optional)

A card may carry **one** graph, drawn above that face's text. `graphSide` picks the face: `"front"` makes the plot the prompt, `"back"` makes it the reveal. Use one when the **shape is what's being learned** — never as decoration.

```json
{ "id": "q3", "front": "What kind of function is this?",
  "back": "A quadratic — $y = x^2$, a parabola",
  "graph": { "type": "equation", "data": "x * x", "x_range": [-4, 4],
             "x_label": "$x$", "y_label": "$y$", "title": "Mystery function" },
  "graphSide": "front" }
```

`type` (`"points"` or `"equation"`), `data`, `x_label`, `y_label`, `title` are all required; labels take LaTeX. `x_range` is required for `equation`, optional for `points`; optional `y_range` pins the y-axis.

**For `"equation"`, `data` is a JavaScript expression string** — not LaTeX, not Python — sampled 100 times across `x_range`:

| ✅ Correct JS | ❌ Wrong |
|---|---|
| `x * x`, `Math.pow(x, 2)` | `x^2` (JS `^` is XOR) |
| `Math.sin(x)`, `Math.exp(x)` | `sin(x)`, `e^x` |
| `Math.sqrt(x)`, `Math.log(x)` | `sqrt(x)`, `ln(x)` |

`x_range` must never sample a `NaN`/`Infinity` (no negatives into `Math.sqrt`, no `0` into `1/x`) — one bad value replaces the whole chart with "Graph unavailable". For `"points"`, `data` is just `[x, y]` pairs, with no code evaluated.

## 3. LaTeX

Inline `$...$`, rendered with KaTeX — standard math commands work (`\frac{}{}`, `\sqrt{}`, `^`, `_`, `\sin`, `\sum`, `\int`, `\pi`…), in `front`, `back`, and any graph label.

### ⚠️ Backslash-escaping (the #1 mistake)

JSON uses `\` as an escape character, so **every** literal backslash must be doubled. A single one corrupts the LaTeX or invalidates the JSON outright.

```json
"back": "$\frac{1}{2}$"    ← WRONG (invalid JSON)
"back": "$\\frac{1}{2}$"   ← RIGHT
```

Before finalizing, scan every string for a single backslash followed by a letter and double it.

## 4. Card quality

Hold card *content* to a strict academic examiner's standard (a content standard only — your conversational tone stays friendly).

- **Material boundary:** cover only what the student's materials explicitly state — no outside knowledge. Invented *scenarios* are the one freedom, as long as everything needed to answer comes from the materials.
- **Difficulty:** calibrate to the rigor the materials themselves demonstrate. Don't ask what difficulty they want; adjust only if they raise it unprompted.
- **Source of terms:** if they gave an explicit glossary or bolded term list, use it directly — term on the `front`, definition on the `back`. From general notes or slides, pick out the key terms yourself.
- **One concept per card.** Keep `front` focused (a term, a formula, one concept) and `back` complete but uncluttered. Never cram multiple facts onto a card. A graph and the text that reads it are still one concept — but keep that text short, since it shares the face with the plot.
- **Self-contained:** no card should depend on another. Match the source material's exact notation and terminology.

## 5. Validation checklist

StudyDeck rejects the **entire file** if any of these fail — it will not silently skip bad cards.

- [ ] `version` is `1`; `title` is a non-empty string; `type` is exactly `"flashcard"`
- [ ] `questions` is non-empty; every card has a non-empty `id`, `front`, and `back`
- [ ] Any `graph` has `type`, `data`, `x_label`, `y_label`, `title`; equation graphs use JavaScript syntax and an `x_range` that never goes non-finite
- [ ] Every LaTeX backslash is doubled (`\\`)
- [ ] The whole file is valid JSON — no trailing commas, no unescaped quotes

<--- End of StudyDeck instructions --->
