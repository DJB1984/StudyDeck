---
type: format-spec-addendum
project: StudyDeck
tags: [studydeck, format-spec, quiz, formats, multiselect]
---

# StudyDeck Format Addendum — Select All That Apply (`multiSelect`)

Fetched on demand from `studydeck-quiz-spec.md`'s answer-format catalog — use this exact schema whenever a question genuinely has more than one correct option. Everything else in the core quiz spec (LaTeX, backslash-escaping, stable IDs, question quality, validation) still applies.

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

**Checklist additions:** `answers` is non-empty; `correctIndices` is a non-empty array of in-range, non-duplicate indices.
