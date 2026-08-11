---
type: format-spec-addendum
project: StudyDeck
tags: [studydeck, format-spec, quiz, formats, numeric]
---

# StudyDeck Format Addendum — Numeric / Slider Answer (`numeric`)

Fetched on demand from `studydeck-quiz-spec.md`'s answer-format catalog — use this exact schema for a typed or slider-dragged numeric answer instead of multiple choice. Everything else in the core quiz spec (LaTeX, backslash-escaping, stable IDs, question quality, validation) still applies.

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

Don't include `answers` or `correct` — they're ignored.

**Checklist additions:** `correctValue` and `tolerance` are both numbers; if `inputWidget` is `"slider"`, `sliderMin`/`sliderMax`/`sliderStep` are all present and `sliderMin < sliderMax`.
