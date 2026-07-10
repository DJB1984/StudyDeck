# Intent

DeckValidation checks an already-JSON-parsed deck object against the StudyDeck schema and returns a list of specific, actionable, field-level error messages. It exists so that a malformed AI-generated deck is rejected wholesale with an explanation the student (or the AI that produced it) can act on, rather than loading a broken deck that crashes mid-session.

# Requirements

- R1 [verify: unit] Validation returns an array of human-readable error strings. An empty array means the deck is valid. [caution: the deck is rejected as a WHOLE if the array is non-empty — validation must NOT silently skip or drop individual bad questions and load the rest.]
- R2 [verify: unit] Missing top-level `version` (undefined or null) produces the error `Missing top-level 'version' field.`
- R3 [verify: unit] [caution: unknown versions WARN, they do not fail — this is deliberate forward-compat. A `version` present but not equal to `1` must NOT add an error; it logs a console warning and validation continues.] Only an absent `version` errors; a present non-`1` version is allowed through.
- R4 [verify: unit] Missing or non-string `title` produces `Missing or invalid top-level 'title' field.`
- R5 [verify: unit] `type` is optional and defaults to `"quiz"` when omitted. A present `type` that is neither `"quiz"` nor `"flashcard"` produces `Top-level 'type' must be "quiz" or "flashcard", found "{value}".` [caution: an unrecognized type is treated as a typo and errors — it is NOT silently coerced to quiz, because the type decides how every question below is validated.]
- R6 [verify: unit] A `questions` value that is not an array produces `Missing top-level 'questions' array.` and validation returns immediately (no per-question checks run).
- R7 [verify: unit] An empty `questions` array produces `'questions' array is empty.` and validation returns immediately.
- R8 [verify: unit] Every question/card missing a truthy `id` produces `Question {n}: Missing 'id' field.` where `{n}` is the 1-based index. [caution: error numbering is 1-based (index + 1) to match what a human counting questions expects — do not switch to 0-based.]
- R9 [verify: unit] For flashcard decks, each card missing a truthy `front` produces `Question {n}: Missing 'front' field.` and missing a truthy `back` produces `Question {n}: Missing 'back' field.` No quiz-shape checks (answers/correct/graph) run for flashcard cards.
- R10 [verify: unit] For quiz decks, each question missing a truthy `question` produces `Question {n}: Missing 'question' field.`
- R11 [verify: unit] For quiz decks, a missing/non-array `answers` produces `Question {n}: Missing 'answers' array.`; an `answers` array whose length is not exactly 4 produces `Question {n}: Expected exactly 4 answer choices, found {len}.`
- R12 [verify: unit] For quiz decks, a missing `correct` (undefined/null) produces `Question {n}: Missing 'correct' field.`; a `correct` that is not an integer in 0–3 inclusive produces `Question {n}: 'correct' index {value} is out of range (0–3).`
- R13 [verify: unit] For quiz decks, when a `graph` object is present (not undefined/null), missing `type`, `x_label`, `y_label`, or `title` each produce `Question {n}: Graph object is missing '{field}'.` A graph with `type === "equation"` and no `x_range` produces `Question {n}: Equation graph requires 'x_range'.`
- R14 [verify: unit] For quiz decks, a present `x_range` or `y_range` that is not an array of exactly length 2 produces `Question {n}: Graph 'x_range' must be a [min, max] array.` / `...'y_range'...` respectively. [caution: element numericness/order is NOT validated here — Graph rendering normalizes min/max and handles bad values by falling back. Do not tighten this into a numeric or ordering check; that duplicates and conflicts with Graph's own tolerance.]
- R15 [verify: unit] Graph validation only runs for quiz decks and only when `graph` is present; a quiz question with no `graph` key is valid without any graph checks (graph is optional).

# Change log

- 2026-07-09: Spec authored for the React + TypeScript migration, backfilled from `FileLoader.validateJSON` in `legacy/studydeck.html`. Captures whole-file rejection, version-warns-not-fails, type defaulting and typo-rejection, and the full per-question quiz/flashcard/graph field checks with their exact 1-based actionable messages. Authored as the target for the React `DeckValidation` lib. Note: raw `JSON.parse` failure (syntactically invalid JSON) is handled upstream in the file-loading flow, not here — this module assumes an already-parsed object.
