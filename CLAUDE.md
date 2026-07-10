# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Status

StudyDeck is a **React + TypeScript (Vite)** single-page app. It was migrated from an original single-file vanilla-JS HTML implementation, which is preserved unchanged at `legacy/studydeck.html` as a reference. Planning docs live in `docs/`:

- `docs/PRD.md` — product requirements (problem, users, modes, features, non-goals). Still current.
- `docs/design-doc.md` — technical design (schema, screens, visual design, storage, rendering). **Source of truth for behavior**; its "Tech Stack" and "App Architecture" sections describe the React app, and the JSON schema / localStorage / screens / graph / KaTeX sections are unchanged and still authoritative. Keep it in sync with any schema/architecture change.
- `docs/task-list.md` — the original phased plan for the single-file app (historical reference only).

`test-decks/` has working example decks (quiz and flashcard) to test against. `studydeck-format-spec.md` is the AI-facing doc for generating new decks — it is imported verbatim into the app (`src/lib/formatSpec.ts` via `?raw`) so the "Copy Format Spec" button never drifts. Update it alongside `design-doc.md` whenever the schema changes.

**Read `docs/design-doc.md` before changing the JSON schema, module boundaries, localStorage shape, or CSS tokens.**

## What StudyDeck Is

A dependency-light web app for studying from AI-generated `.json` question decks (quiz, test, review, flashcard modes). It deliberately contains no built-in AI — any model can generate a compatible `.json` file using the format spec.

## Commands

Node + npm required (dev only; the built app is static).

- **Install:** `npm install`
- **Dev server:** `npm run dev` (Vite, hot reload)
- **Typecheck:** `npm run typecheck` (`tsc -b`)
- **Build:** `npm run build` (`tsc -b && vite build` → static `dist/`)
- **Preview build:** `npm run preview`
- **Dependencies:** KaTeX and Chart.js v4 are npm packages, bundled locally (no CDN). React 18.

The output is fully static — `dist/` can be hosted anywhere or opened via `npm run preview`. There is no backend.

## Architecture

Single-page React app. Everything is client-side; there is no backend and no router library — navigation is a screen state machine in `src/App.tsx` (a discriminated-union `Route` with per-screen payloads: current deck, quiz session, stats record, remembered Review origin).

The original vanilla-JS module objects map onto React modules. **Each module still owns its domain exclusively — no module reaches past another to touch its data.** Preserve this separation (it's what keeps a future IndexedDB migration or spaced-repetition swap local):

- **`src/lib/Storage.ts`** — the ONLY module that touches `localStorage`. All persistence goes through it. `deleteFile()` removes the history entry AND the matching flashcard pile state atomically. All writes are wrapped for `QuotaExceededError` (evict the oldest — i.e. last — history entry, retry once, surface a toast).
- **`src/lib/DeckValidation.ts`** — `validateDeck()` returns field-level, actionable error strings; the deck is rejected as a whole on any error.
- **`src/lib/clipboard.ts`** — builds the copy-to-AI explanation prompt (and shared "Copied!" feedback helper).
- **`src/lib/toast.ts`** — tiny bus so non-React modules (Storage) can surface errors through `<Toast>`.
- **`src/lib/formatSpec.ts` / `shuffle.ts`** — format-spec text (`?raw` import) and order helpers.
- **`src/components/Math/Katex.tsx`** — renders `$...$`/`$$...$$` via KaTeX auto-render; `throwOnError:false` so bad LaTeX falls back to raw text, never crashes.
- **`src/components/Graph/Graph.tsx`** — Chart.js v4 rendering. `renderGraph` logic MUST never throw out to the app — every failure catches and shows "Graph unavailable". LaTeX axis labels are KaTeX HTML overlays (Chart.js can't render LaTeX on canvas). Chart destroyed/recreated per question.
- **`src/features/quiz/`** — `QuizScreen.tsx` runs practice + test. Tracks `firstAttemptCorrect` per question; retries never overwrite the first-attempt record. Owns the session timer.
- **`src/features/flashcard/`** — `flashEngine.ts` holds pile state (`known`/`learning`) keyed by question `id` (never index), persisted via Storage. `sortCard()` is the isolated seam for a future spaced-repetition scheduler.
- **`src/features/stats/`** — `stats.ts` builds the session record + score/pie data, kept separate from Quiz so scoring can evolve. `StatsScreen.tsx` renders the doughnut + breakdown.
- **`src/features/home/`, `modeSelect/`, `review/`** — the remaining screens.

## Requirements specs (requirements-writer agent)

This project uses the `requirements-writer` subagent (`.claude/agents/requirements-writer.md`) to keep per-feature behavior specs current. Now that the app has real feature folders, specs are **co-located next to each feature's code** as `{Feature}.spec.md` (e.g. `src/features/quiz/Quiz.spec.md`, `src/lib/Storage.spec.md`) — NOT centralized in `docs/specs/`. Each spec has an Intent, an R-ID'd Requirements checklist with `[verify:]` tags and `[caution:]` notes, and a Change log.

Before writing or modifying code in a feature, invoke `requirements-writer` (before-pass) scoped to that feature, passing the invocation contract: pass, feature, intent, planned files. **Never run the after-pass unless Davis explicitly asks for it** — no exceptions, not even for `[caution:]`-tagged invariants (his call, 2026-07-10: it eats too many credits). The implementing thread self-verifies against the updated spec's R-IDs before committing. If Davis does request an after-pass and it reports gaps: fix, re-invoke, max 3 rounds, then surface to him.

The agent is auto-discovered from `.claude/agents/requirements-writer.md` (project) and `~/.claude/agents/requirements-writer.md` (user-level, the authoritative copy) at session start, so it's spawnable as `subagent_type: "requirements-writer"`. If it doesn't appear in the available-agents list (e.g. it was added mid-session), fall back to a `general-purpose` agent told to adopt the agent file as its operating instructions.

### Data model

- Deck JSON: `version`, optional `type` (`"quiz"` default, or `"flashcard"`), `title`, `questions[]`. Types live in `src/types.ts`.
- Quiz questions: stable string `id`, `question` (LaTeX via `$...$`/`$$...$$`), exactly 4 `answers`, integer `correct` (0–3), optional `graph` (`points` or `equation`).
- Flashcards: stable string `id`, `front`, `back` (no `answers`/`correct`/`graph`). Mode Select reads `type` to show only matching mode(s).
- `version` must currently equal `1`; unknown versions warn, not hard-fail.
- localStorage keys: `studydeck_history` and `studydeck_flash_{title}` (keyed by question `id`). Full shapes in `docs/design-doc.md` under "localStorage Schema".

### Screens

`Home → Mode Select → Quiz/Flashcard → Stats → Home`, with a `Review` branch off both Mode Select and Stats. The live app has **four** modes: Practice, Test, Review, Flashcard. Practice shows live feedback with retries (retries don't affect stats); Test shows no feedback until Stats and disallows retries; Review is a read-only browser with the correct answer shown.

### Visual design

Dark liquid-glass aesthetic. Color tokens live in `src/theme/tokens.css` (isolated so a shared cross-project theme can swap in later); component styles in `src/theme/styles.css`. Use the existing `--bg`/`--surface`/`--accent`/etc. tokens rather than introducing new colors.

## Key constraints to preserve

- No backend — the app stays a static client-side bundle.
- Graph and KaTeX rendering failures must degrade gracefully (fallback text), never crash the app.
- Flashcard and quiz stats key off question `id`, never array index.
- Chart.js usage must be v4 syntax throughout (no v2/v3 config patterns).
- Only `src/lib/Storage.ts` may touch `localStorage`.
