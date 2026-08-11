---
type: format-spec-addendum
project: StudyDeck
tags: [studydeck, format-spec, quiz, formats, order]
---

# StudyDeck Format Addendum — Drag-to-Order (`order`)

Fetched on demand from `studydeck-quiz-spec.md`'s answer-format catalog — use this exact schema to have the student arrange a shuffled list into the correct sequence. Everything else in the core quiz spec (LaTeX, backslash-escaping, stable IDs, question quality, validation) still applies.

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

**Checklist additions:** `items` has at least 2 entries; `correctOrder` contains exactly the same ids as `items`, each once.
