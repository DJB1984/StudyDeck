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

## Requirements specs — requirements-writer agent is RETIRED

**Do not invoke the `requirements-writer` subagent for this project, for any pass, before or after.** Davis's explicit call (2026-07-20) — stop using it entirely. This overrides any older instinct to spawn it before touching a feature folder.

Existing `{Feature}.spec.md` files (e.g. `src/features/quiz/Quiz.spec.md`, `src/lib/Storage.spec.md`, `src/features/auth/Auth.spec.md`) remain in the repo as historical reference/documentation, but are no longer actively maintained via that agent. If a change makes one materially wrong, either fix the specific stale line by hand or just leave it — don't spawn the agent to reconcile it.

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

## Deployment (live site)

The app is LIVE at **https://studydeck.brookslanding.com** (HostGator shared hosting; the subdomain's document root on the server is `~/studydeck`, a sibling of `public_html` — not inside it).

- **Redeploy:** `bash ~/.claude/skills/deploy-hostgator/scripts/deploy.sh` from the repo root (Davis's root-level `deploy-hostgator` skill: builds, uploads over SSH with a tar fallback, then attempts a cache purge).
- **Config:** project-specific fields live in `deploy.config.json` at the repo root (gitignored — never commit it). Account details (host/port/username/keyPath) come from `~/.claude/deploy-hostgator.defaults.json`; the skill's SKILL.md documents how to update either.
- **Deploys are manual.** Pushing to GitHub does NOT update the live site — run the deploy script when a change should go live.
- **Caching:** HostGator's server-side cache can serve the previous deploy for up to ~2h. The script auto-sends an HTTP `PURGE` when `siteUrl` is set (a 501 response means that endpoint doesn't support purging — the cache just expires on its own). Browsers cache favicons extra-aggressively.

## Key constraints to preserve

- No backend — the app stays a static client-side bundle.
- Graph and KaTeX rendering failures must degrade gracefully (fallback text), never crash the app.
- Flashcard and quiz stats key off question `id`, never array index.
- Chart.js usage must be v4 syntax throughout (no v2/v3 config patterns).
- Only `src/lib/Storage.ts` may touch `localStorage`.
