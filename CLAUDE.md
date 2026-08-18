# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Status

StudyDeck is a **React + TypeScript (Vite)** single-page app. It was migrated from an original single-file vanilla-JS HTML implementation, which is preserved unchanged at `legacy/studydeck.html` as a reference. Planning docs live in `docs/`:

- `docs/core/PRD.md` — product requirements (problem, users, modes, features, non-goals). Still current.
- `docs/core/design-doc.md` — technical design (schema, screens, visual design, storage, rendering). **Source of truth for behavior**; its "Tech Stack" and "App Architecture" sections describe the React app, and the JSON schema / localStorage / screens / graph / KaTeX sections are unchanged and still authoritative. Keep it in sync with any schema/architecture change.
- `docs/core/task-list.md` — the original phased plan for the single-file app (historical reference only).
- `docs/question-types/` — PRD, design doc, and task list for a batch of new interactive question/answer formats. **Shipped:** select-all-that-apply (`multiSelect`), drag-to-order (`order`), numeric free-response/slider (`numeric`), data tables (`table`, context-only), code-execution questions (`code`) for JavaScript and Python. **Not built:** graph click-to-answer (`graphClick`), type-the-answer flashcards (`inputMode: "type"`), command-line matching (`command`), and Java code questions — Java is specifically blocked on CheerpJ's licensing (its free tier requires loading from Leaning Technologies' CDN; self-hosting needs a paid Commercial License), not a technical limitation. See `docs/question-types/task-list.md` for phase-by-phase status.
- `docs/auth/` — PRD, design doc, and task list for the optional Supabase auth/cloud-sync feature (already shipped).

`test-decks/` has working example decks (quiz and flashcard) to test against. `prompts/` holds the AI-facing prompt/spec markdown, `?raw`-imported at build time by `src/lib/formatSpec.ts` so nothing drifts: `studydeck-quiz-spec.md` and `studydeck-flashcard-spec.md` are the per-deck-type schema contracts (LaTeX rules, question-quality bar, validation checklist) — they hold no conversational behavior. The Home screen's "Copy Prompt" button opens a modal with **two** options, Quiz and Flashcards, since deck type is chosen by which card the student clicks rather than inferred mid-conversation. Each composes one deck-type intro with its matching contract: `QUIZ_PROMPT_MD` = `studydeck-quiz-intro.md` + `studydeck-quiz-spec.md`, `FLASHCARD_PROMPT_MD` = `studydeck-flashcard-intro.md` + `studydeck-flashcard-spec.md`. Both intros always confirm purpose/scope before generating (capped at one follow-up round) so the resulting questions are better-targeted. Update the contracts alongside `design-doc.md` whenever the schema changes; update the two intro files when conversational behavior changes — the quiz and flashcard intros should stay in sync in tone/structure even though their content differs.

There used to be a second **Quick/Guided** axis, making four options; the Quick (no-questions-asked) variants were archived to `prompts/archive/` on 2026-08-15 at Davis's call and are no longer imported by `formatSpec.ts`. The surviving intros were renamed off their `guided-` prefix and their opening framing rewritten, since "you chose the hands-on path" no longer describes a choice the student made. Don't reintroduce a Quick variant without asking.

**Every pasted prompt is fully self-contained — there is no runtime fetch.** `studydeck-quiz-spec.md` inlines all four answer formats (`multiSelect`, `numeric`, `order`, `code`) and both context add-ons (`graph`, `table`) as compact deltas off `mcq` in its §2/§3, with one worked JSON example per format. An earlier design kept these as fetchable addenda under `public/formats/`, served at `studydeck.brookslanding.com/formats/<name>.md`; that was removed (2026-08-15) because it silently degraded to `mcq` on any AI without browsing — which was most of them — so students never got the non-mcq formats at all. The old all-in-one `prompts/studydeck-format-spec.md` was deleted in the same pass, since the quiz + flashcard specs now cover everything with no fetch dependency. **Don't reintroduce URL-fetched spec fragments:** the whole four-prompt set costs ~6k tokens fully inlined, so the context savings were never worth the failure mode. If prompt size ever does become a real constraint, the move is composing material-shaped prompt variants in the Copy Prompt modal (inline only the formats a given subject needs), not fetching.

**Read `docs/core/design-doc.md` before changing the JSON schema, module boundaries, localStorage shape, or CSS tokens.**

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
- **`src/lib/formatSpec.ts` / `shuffle.ts`** — composes the `QUICK_PROMPT_MD` / `GUIDED_PROMPT_MD` prompt text (`?raw` imports, see "Project Status" above) and order helpers.
- **`src/components/Math/Katex.tsx`** — renders `$...$`/`$$...$$` via KaTeX auto-render; `throwOnError:false` so bad LaTeX falls back to raw text, never crashes.
- **`src/components/Graph/Graph.tsx`** — Chart.js v4 rendering. `renderGraph` logic MUST never throw out to the app — every failure catches and shows "Graph unavailable". LaTeX axis labels are KaTeX HTML overlays (Chart.js can't render LaTeX on canvas). Chart destroyed/recreated per question.
- **`src/components/QuizUI.tsx`** — the presentational shell shared by Quiz and Review (`ProgressHeader`, `QuestionBody`, `AnswerList`, plus the `LETTERS` constant). Deliberately shell-only: Quiz's scoring/retry-locking state and Review's static correct-highlight stay in their own screens, passed in as per-button className/disabled/onSelect callbacks. Don't grow this into a merged Quiz+Review component — the two modes' logic is genuinely different, only the markup isn't.
- **`src/features/quiz/`** — `QuizScreen.tsx` runs practice + test. Tracks `firstAttemptCorrect` per question; retries never overwrite the first-attempt record. Owns the session timer.
- **`src/features/flashcard/`** — `schedule.ts` owns the mastery POLICY (streak arithmetic, gap sizes, small-deck cropping, settings sanitizing, legacy back-fill) with no engine state and no I/O; `flashEngine.ts` owns the rotation and persistence and calls into it. `sortCard()` remains the single seam that changes a card's standing — every rule it applies comes from `schedule.ts`, so a different scheduler is a one-module swap. Records are keyed by question `id` (never index). The `MasteryGaps` shape lives in `src/types.ts` rather than `schedule.ts` so `Storage` can persist it without a lib→feature import; `Storage` returns it raw and callers run it through `sanitizeGaps()`.
- **`src/features/stats/`** — `stats.ts` builds the session record + score/pie data, kept separate from Quiz so scoring can evolve. `StatsScreen.tsx` renders the doughnut + breakdown.
- **`src/features/home/`, `modeSelect/`, `review/`** — the remaining screens.

## Requirements specs — retired

**Do not invoke the `requirements-writer` subagent for this project, for any pass, before or after.** Davis's explicit call (2026-07-20) — stop using it entirely. This overrides any older instinct to spawn it before touching a feature folder. The co-located `{Feature}.spec.md` files it used to maintain (e.g. `Quiz.spec.md`, `Storage.spec.md`, `Auth.spec.md`) have been removed (2026-08-16, no longer helpful) — don't reintroduce them.

### Data model

- Deck JSON: `version`, optional `type` (`"quiz"` default, or `"flashcard"`), `title`, `questions[]`. Types live in `src/types.ts`.
- Quiz questions: stable string `id`, `question` (LaTeX via `$...$`/`$$...$$`), exactly 4 `answers`, integer `correct` (0–3), optional `graph` (`points` or `equation`).
- Flashcards: stable string `id`, `front`, `back` (no `answers`/`correct`), plus an optional `graph` (same `GraphSpec` as quiz questions) and `graphSide` (`"front"` default, or `"back"`) placing it on one face. Mode Select reads `type` to show only matching mode(s).
- `version` must currently equal `1`; unknown versions warn, not hard-fail.
- History entries carry a generated `id` (`HistoryEntry.id`), assigned by `Storage` on first save/read and stable for the life of the deck. Flashcard state is filed under it, never the title.
- localStorage keys: `studydeck_history` and `studydeck_flash_{deckId}` (records keyed by question `id`). Full shapes in `docs/core/design-doc.md` under "localStorage Schema".

### Screens

`Home → Mode Select → Quiz/Flashcard → Stats → Home`, with a `Review` branch off both Mode Select and Stats. The live app has **four** modes: Practice, Test, Review, Flashcard.

The Flashcard screen has two study modes of its own: **Standard** (browse, records nothing) and **Mastery** (the spaced drill). Mastery is a *single-session* mode: four Know Its **in a row** master a card, each hit dropping it further down the rotation (5 / 10 / 15 cards, student-configurable via the gear, stored per device) and the fourth — the one that masters it — sending it the whole way to the back, which is why a four-hit ladder has only three configurable gaps. A card's first-ever Know It jumps straight to 3/4, so known material clears in two passes; a miss drops it 3 and resets the streak to 0. Mastery itself persists per deck, so a later round only offers what isn't mastered yet — a fully mastered deck opens on "Deck Mastered", whose only real action is Reset Progress. The rotation never shrinks (mastered cards keep circulating as spacers), so a round ends on every card being mastered, not on the queue emptying.

This replaced a two-stage cross-day ladder — next-day cold checks plus 3/7/16/35-day refreshers — on 2026-08-18 at Davis's call. **Don't reintroduce day-based scheduling without asking.** See the design doc's "Mastery drill" section before changing any of it; the small-deck gap cropping in particular is load-bearing, not cosmetic (crop the longest gap shorter than the rotation and the tail card is never reached, so the round can't end). Practice shows live feedback with retries (retries don't affect stats); Test shows no feedback until Stats and disallows retries; Review is a read-only browser with the correct answer shown.

### Visual design

"Starfield" deep-space aesthetic — solid tonal-layered panels (no `backdrop-filter`/glass), one restrained accent (Starlight Blue), a reserved multi-hue Nebula gradient held back for Home's hero only. **`DESIGN.md`** at the repo root is the source of truth for the full system (palette, typography, named rules); `docs/core/design-doc.md`'s Visual Design section is a synced technical summary. Color tokens live in `src/theme/tokens.css` (isolated so a shared cross-project theme can swap in later); component styles in `src/theme/styles.css`. Use the existing `--bg`/`--surface`/`--accent`/etc. tokens rather than introducing new colors.

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
