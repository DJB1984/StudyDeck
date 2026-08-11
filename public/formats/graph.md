---
type: format-spec-addendum
project: StudyDeck
tags: [studydeck, format-spec, quiz, formats, graph]
---

# StudyDeck Format Addendum — Graph Context (`graph`)

Fetched on demand from `studydeck-quiz-spec.md`'s catalog — a `"graph"` renders a Chart.js plot above the question, as context. Quiz decks only; works alongside any `answerFormat`, including plain `"mcq"`. Prefer it as context (e.g. "the graph below shows...") rather than putting a graph-dependent claim only in the answer choices.

| Field | Type | Required | Notes |
|---|---|---|---|
| `type` | string | **Yes** | `"points"` or `"equation"`. |
| `data` | array or string | **Yes** | Array of `[x, y]` pairs if `points`; a **JavaScript** expression string if `equation` (see below). |
| `x_range` | `[min, max]` | Required for `equation`, optional for `points` | Order doesn't matter — StudyDeck normalizes min/max automatically. Points auto-fit the axis if omitted. |
| `y_range` | `[min, max]` | No | Pins the y-axis instead of auto-fitting — use if the data range would zoom oddly. |
| `x_label` | string | **Yes** | Supports `$...$` LaTeX. |
| `y_label` | string | **Yes** | Supports `$...$` LaTeX. |
| `title` | string | **Yes** | Supports `$...$` LaTeX. |

Example (`points`):
```json
"graph": {
  "type": "points",
  "data": [[0, 0], [1, 9.8], [2, 19.6], [3, 29.4]],
  "x_label": "Time (s)",
  "y_label": "Velocity (m/s)",
  "title": "Velocity vs Time"
}
```

## Equations are JavaScript, not LaTeX or Python

For `"type": "equation"`, the `data` string is evaluated in the browser via `new Function('x', 'return (' + data + ')')` — it must be **valid JavaScript**, evaluated once per sample point across `x_range` (100 samples), *not* LaTeX and *not* Python.

| Math notation | ✅ Correct JS for `data` | ❌ Wrong |
|---|---|---|
| $x^2$ | `x * x` or `Math.pow(x, 2)` | `x^2` (JS `^` is XOR, not exponent) |
| $\sin(x)$ | `Math.sin(x)` | `sin(x)` |
| $e^x$ | `Math.exp(x)` | `e^x` |
| $\sqrt{x}$ | `Math.sqrt(x)` | `sqrt(x)` |
| $\ln(x)$ | `Math.log(x)` | `ln(x)` |
| $\frac{1}{x}$ | `1 / x` | `1/x` is actually fine, just don't write a fraction-style string |

- `x_range` must avoid producing `NaN`/`Infinity` anywhere sampled — e.g. no negative numbers into `Math.sqrt`, no `0` into `1/x`. Any non-finite value anywhere shows "Graph unavailable" instead of the chart.
- `x_range` and `y_range` can be given in either order (`[5, -5]` works the same as `[-5, 5]`) — StudyDeck sorts them automatically.

For `"type": "points"`, `data` is a plain array of `[x, y]` number pairs — no code evaluation involved.

**Checklist additions:** `type`, `x_label`, `y_label`, and `title` are all present; if `type` is `"equation"`, `x_range` is present; `x_range`/`y_range`, if present, are arrays of exactly 2 numbers. Double-check your own arithmetic — verify the equation or data points actually produce the numbers your answer choices claim; a wrong `correct` index or an answer that doesn't match the graph's actual values is the most common AI-generated error here.
