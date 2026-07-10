# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Status

All 11 phases of `docs/task-list.md` are implemented in `studydeck.html`. Planning docs live in `docs/`:

- `docs/PRD.md` — product requirements (problem, users, modes, features, non-goals)
- `docs/design-doc.md` — full technical design (schema, architecture, visual design, storage, rendering) — **source of truth**, keep it in sync with any schema/architecture change
- `docs/task-list.md` — the original phased implementation plan (historical reference)

**Read `docs/design-doc.md` in full before changing the JSON schema, module boundaries, localStorage shape, or CSS tokens.** `test-decks/` has working example decks (quiz and flashcard) to test against, and `studydeck-format-spec.md` is the AI-facing doc for generating new decks — update it alongside `design-doc.md` whenever the schema changes.

## What StudyDeck Is

A single-file, dependency-light HTML app for studying from AI-generated `.json` question decks (quiz, test, flashcard modes). It deliberately contains no built-in AI — any model can generate a compatible `.json` file using the format spec (Phase 11 deliverable, `studydeck-format-spec.md`).

## Commands

There is no build step, no Node.js, no npm, and no test runner. The entire app is one file: `studydeck.html`.

- **Run/verify:** open `studydeck.html` directly in a browser (double-click or drag into a browser window).
- **Dependencies:** KaTeX v0.16.x and Chart.js v4.x loaded via CDN `<script>`/`<link>` tags in `<head>` — no local install.

## Architecture

Everything lives in one file: `studydeck.html`, containing `<style>` (all CSS) and `<script>` (all JS) inline.

JavaScript is organized as module objects (`const ModuleName = {...}`), not flat global functions. Each module owns its domain exclusively — no module bypasses another to touch its data directly. The module list and exact responsibilities are specified in `docs/design-doc.md` under "App Architecture":

- `Storage` — the only module that touches `localStorage`. All other modules go through it. `deleteFile()` must remove both the history entry and the matching flashcard pile state atomically. All `setItem` calls are wrapped in try/catch for `QuotaExceededError` (drop oldest history entry, retry, surface a warning).
- `Router` — `showScreen(id)` only; no business logic.
- `FileLoader` — drag/drop + file picker → `validateJSON()` (field-level, actionable error messages) → `Storage.saveFile()` → `Router`.
- `QuizEngine` — quiz session state for both practice and test modes. Tracks `firstAttemptCorrect` per question; retries never overwrite the first-attempt record. Owns the session timer.
- `FlashEngine` — flashcard session state, pile sorting (`known`/`learning`), keyed by question `id` (not array index) so pile state survives question reordering.
- `Renderer` — all question/graph/stats rendering, including KaTeX invocation and Chart.js setup/teardown. `renderGraph()` must never throw out to the rest of the app — catch everything, fall back to a "Graph unavailable" message.
- `Stats` — builds the session record and derived score/pie data, kept separate from `QuizEngine` so scoring logic can evolve independently.
- `Clipboard` — builds the copy-to-AI prompt text for wrong answers.

This module separation is intentional (see design-doc rationale for future IndexedDB migration and spaced-repetition swaps) — preserve it rather than collapsing logic into `Router` or inline event handlers.

### Data model

- Deck JSON: `version`, optional `type` (`"quiz"` default, or `"flashcard"`), `title`, `questions[]`.
- Quiz decks: each question has a stable string `id`, `question` (LaTeX via `$...$`/`$$...$$`), exactly 4 `answers`, integer `correct` (0–3), and an optional `graph` object (`points` or `equation` type).
- Flashcard decks: each question has a stable string `id`, `front`, `back` (no `answers`/`correct`/`graph` — flashcards don't support multiple choice or graphs). `Mode Select` reads `type` to show only the matching mode(s).
- `version` must currently equal `1`; unknown versions warn, not hard-fail.
- localStorage keys: `studydeck_history` (array of loaded files with full parsed data) and `studydeck_flash_{title}` (per-file flashcard pile state, keyed by question `id`). Full schema and exact shapes are in `docs/design-doc.md` under "localStorage Schema".

### Screens

`Home → Mode Select → Quiz/Flashcard → Stats → Home`, with a `Review` branch off Stats. Screen IDs and per-screen behavior are detailed in `docs/design-doc.md` under "Screens and Navigation" — Practice mode shows live right/wrong feedback with retries (retries don't affect stats); Test mode shows no feedback until Stats and disallows retries.

### Visual design

Dark liquid-glass aesthetic with a fixed set of CSS custom properties (`--bg`, `--surface`, `--accent`, etc.) defined in `docs/design-doc.md` under "Visual Design" — use those exact tokens rather than introducing new colors.

## Key constraints to preserve

- No build step, no framework, no backend — stays a single portable `.html` file.
- Graph and KaTeX rendering failures must degrade gracefully (fallback text), never crash the app.
- Flashcard and quiz stats key off question `id`, never array index.
- Chart.js usage must be v4 syntax throughout (no v2/v3 config patterns).
