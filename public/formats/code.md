---
type: format-spec-addendum
project: StudyDeck
tags: [studydeck, format-spec, quiz, formats, code]
---

# StudyDeck Format Addendum — Write Real Code (`code`)

Fetched on demand from `studydeck-quiz-spec.md`'s answer-format catalog — use this exact schema for a question where the student writes and runs real code. Everything else in the core quiz spec (LaTeX, backslash-escaping, stable IDs, question quality, validation) still applies.

```json
{
  "id": "q6",
  "answerFormat": "code",
  "question": "Write a function `reverse_string(s)` that returns the input string reversed.",
  "language": "python",
  "starterCode": "def reverse_string(s):\n    pass\n",
  "checks": {
    "syntax": true,
    "structure": { "requiredNames": ["reverse_string"] },
    "tests": [
      { "call": "reverse_string('abc')", "expect": "'cba'" },
      { "call": "reverse_string('')", "expect": "''" }
    ]
  }
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `language` | string | **Yes** | `"javascript"` or `"python"` **only** — Java isn't supported yet, don't generate `language: "java"`. |
| `starterCode` | string | No | Pre-filled editor content — usually a function/class signature with an empty body for the student to fill in. |
| `checks.syntax` | boolean | No | `true` gates the rest of grading on the code actually parsing. |
| `checks.structure` | object | No | `{ "requiredNames": [...] }` — names (function/class/variable) that must be declared somewhere in the submission. Good for "write a class with this shape" questions that don't need behavioral tests. |
| `checks.tests` | array of `{call, expect}` | No | Each `call`/`expect` must be a valid expression **in the question's own `language`** — not JSON, not pseudocode. `expect` is evaluated like `call`, so it can be any literal: `"5"`, `"'cba'"`, `"[1, 2, 3]"`, `"True"` (Python) / `"true"` (JavaScript). |
| Don't include | — | — | `answers`/`correct` are not used for `code` questions. |

At least one of `checks.syntax` / `checks.structure` / `checks.tests` must be present — a structure-only question (no `tests`) is fine when the point is "did you write a valid shape," not behavior.

**Checklist additions:** `language` is `"javascript"` or `"python"` (never `"java"`); `checks` has at least one of `syntax`/`structure`/`tests`.
