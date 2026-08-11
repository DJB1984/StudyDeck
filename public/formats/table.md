---
type: format-spec-addendum
project: StudyDeck
tags: [studydeck, format-spec, quiz, formats, table]
---

# StudyDeck Format Addendum — Data Table Context (`table`)

Fetched on demand from `studydeck-quiz-spec.md`'s catalog — a `"table"` renders a small data table above the question, the same context role `"graph"` plays. Works alongside any `answerFormat`, including plain `"mcq"`.

```json
"table": {
  "title": "Company X — Income Summary",
  "headers": ["Year", "Revenue", "Expenses"],
  "rows": [
    ["2023", "$120,000", "$95,000"],
    ["2024", "$150,000", "$110,000"]
  ]
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | string | **Yes** | Supports `$...$` LaTeX. |
| `headers` | array of strings | **Yes** | Non-empty. Supports `$...$` LaTeX per cell. |
| `rows` | array of arrays of strings | **Yes** | Non-empty. Every row must have exactly as many entries as `headers`. Supports `$...$` LaTeX per cell. |

**Checklist additions:** `title` is present, `headers` is non-empty, and every `rows` entry has the same length as `headers`.
