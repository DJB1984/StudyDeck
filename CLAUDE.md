# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Status

StudyDeck is a **React + TypeScript (Vite)** single-page app. It was migrated from an original single-file vanilla-JS HTML implementation, which is preserved unchanged at `legacy/studydeck.html` as a reference. Planning docs live in `docs/`:

- `docs/core/PRD.md` — product requirements (problem, users, modes, features, non-goals). Still current.
- `docs/core/design-doc.md` — technical design (schema, screens, visual design, storage, rendering). **Source of truth for behavior**; its "Tech Stack" and "App Architecture" sections describe the React app, and the JSON schema / localStorage / screens / graph / KaTeX sections are unchanged and still authoritative. Keep it in sync with any schema/architecture change.
- `docs/core/task-list.md` — the original phased plan for the single-file app (historical reference only).
- `docs/question-types/` — PRD, design doc, and task list for a batch of new interactive question/answer formats. **Shipped:** select-all-that-apply (`multiSelect`), drag-to-order (`order`), numeric free-response/slider (`numeric`), data tables (`table`, context-only), code-execution questions (`code`) for JavaScript and Python. **Not built:** graph click-to-answer (`graphClick`), type-the-answer flashcards (`inputMode: "type"`), command-line matching (`command`), and Java code questions — Java is specifically blocked on CheerpJ's licensing (its free tier requires loading from Leaning Technologies' CDN; self-hosting needs a paid Commercial License), not a technical limitation. See `docs/question-types/task-list.md` for phase-by-phase status.
- `docs/auth/` — PRD, design doc, and task list for the optional Supabase auth/cloud-sync feature (already shipped).
- `docs/sharing/design-doc.md` — share-a-study-set (shipped 2026-08-19): link out a deck, add it from a link signed in or out, and the dedupe rules that keep one shared deck to one stored payload. **Read it before touching `shared_decks`, `decks.share_token`, or anything under `src/features/share/`.**

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
- **`src/lib/deckIdentity.ts`** — the one answer to "are these the same deck?": a key-order-independent canonical form and a synchronous hash of it. Used by BOTH login migration and sharing, so the two can never disagree about deck identity. Not a security boundary — nothing is authorized on a hash match.
- **`src/lib/shareLink.ts`** — reads and builds the `?s=<token>` share URL. A query param, never a path: the app is a static bundle on shared hosting with no rewrite rules, so `/s/<token>` would 404 before React loaded.
- **`src/features/share/`** — `shareLibrary.ts` owns "do they already have this deck?" (token match, then content hash — never title) and adding one; `ShareModal.tsx` mints/copies a link from a Home deck card; `ShareScreen.tsx` is the landing a link opens.
- **`src/lib/formatSpec.ts` / `shuffle.ts`** — composes the `QUICK_PROMPT_MD` / `GUIDED_PROMPT_MD` prompt text (`?raw` imports, see "Project Status" above) and order helpers.
- **`src/components/Math/Katex.tsx`** — renders `$...$`/`$$...$$` via KaTeX auto-render; `throwOnError:false` so bad LaTeX falls back to raw text, never crashes.
- **`src/components/Graph/Graph.tsx`** — Chart.js v4 rendering. `renderGraph` logic MUST never throw out to the app — every failure catches and shows "Graph unavailable". LaTeX axis labels are KaTeX HTML overlays (Chart.js can't render LaTeX on canvas). Chart destroyed/recreated per question.
- **`src/components/QuizUI.tsx`** — the presentational shell shared by Quiz and Review (`ProgressHeader`, `QuestionBody`, `AnswerList`, plus the `letterFor()` answer-label helper). Deliberately shell-only: Quiz's scoring/retry-locking state and Review's static correct-highlight stay in their own screens, passed in as per-button className/disabled/onSelect callbacks. Don't grow this into a merged Quiz+Review component — the two modes' logic is genuinely different, only the markup isn't.
- **`src/features/quiz/`** — `QuizScreen.tsx` runs practice + test. Tracks `firstAttemptCorrect` per question; retries never overwrite the first-attempt record. Owns the session timer.
- **`src/features/flashcard/`** — `schedule.ts` owns the mastery POLICY (streak arithmetic, the fixed gap sizes, small-deck cropping, legacy back-fill) with no engine state and no I/O; `flashEngine.ts` owns the rotation and persistence and calls into it. `sortCard()` remains the single seam that changes a card's standing — every rule it applies comes from `schedule.ts`, so a different scheduler is a one-module swap. Records are keyed by question `id` (never index). The gaps are constants in `schedule.ts` (`GAPS`) and nothing persists them — they were briefly a per-device setting, removed 2026-08-18.
- **`src/features/stats/`** — `stats.ts` builds the session record + score/pie data, kept separate from Quiz so scoring can evolve. `StatsScreen.tsx` renders the doughnut + breakdown.
- **`src/features/home/`, `modeSelect/`, `review/`** — the remaining screens.

## Requirements specs — retired

**Do not invoke the `requirements-writer` subagent for this project, for any pass, before or after.** Davis's explicit call (2026-07-20) — stop using it entirely. This overrides any older instinct to spawn it before touching a feature folder. The co-located `{Feature}.spec.md` files it used to maintain (e.g. `Quiz.spec.md`, `Storage.spec.md`, `Auth.spec.md`) have been removed (2026-08-16, no longer helpful) — don't reintroduce them.

### Data model

- Deck JSON: `version`, optional `type` (`"quiz"` default, or `"flashcard"`), `title`, `questions[]`. Types live in `src/types.ts`.
- Quiz questions: stable string `id`, `question` (LaTeX via `$...$`/`$$...$$`), 2 or more `answers` (4 is conventional, not required — relaxed 2026-09-06), integer `correct` indexing one of them, optional `graph` (`points` or `equation`).
- Flashcards: stable string `id`, `front`, `back` (no `answers`/`correct`), plus an optional `graph` (same `GraphSpec` as quiz questions) and `graphSide` (`"front"` default, or `"back"`) placing it on one face. Mode Select reads `type` to show only matching mode(s).
- `version` must currently equal `1`; unknown versions warn, not hard-fail.
- History entries carry a generated `id` (`HistoryEntry.id`), assigned by `Storage` on first save/read and stable for the life of the deck. Flashcard state is filed under it, never the title.
- History entries may also carry `shareToken` — set on a deck the student published AND on every copy added from that link. It is the dedupe key for share links and is preserved across saves exactly like `id`.
- localStorage keys: `studydeck_history` and `studydeck_flash_{deckId}` (records keyed by question `id`). Full shapes in `docs/core/design-doc.md` under "localStorage Schema".

### Screens

`Home → Mode Select → Quiz/Flashcard → Stats → Home`, with a `Review` branch off both Mode Select and Stats. The live app has **four** modes: Practice, Test, Review, Flashcard.

The Flashcard screen has two study modes of its own: **Standard** (browse, records nothing) and **Mastery** (the spaced drill). Mastery is a *single-session* mode: four Know Its **in a row** master a card, each hit dropping it further down the rotation (a fixed 5 / 10 / 15 cards) and the fourth — the one that masters it — sending it the whole way to the back, which is why a four-hit ladder has only three gaps. The gaps are not student-configurable and **Random order is not offered in Mastery** — where a card sits IS the mode, so shuffling under it or letting the student shorten the gaps would undo the drill. Both were removed on 2026-08-18; don't reintroduce either without asking. A card's first-ever Know It jumps straight to 3/4, so known material clears in two passes; a miss drops it 3 and resets the streak to 0. Mastery itself persists per deck, so a later round only offers what isn't mastered yet — a fully mastered deck opens on "Deck Mastered", whose only real action is Reset Progress. The rotation never shrinks (mastered cards keep circulating as spacers), so a round ends on every card being mastered, not on the queue emptying.

This replaced a two-stage cross-day ladder — next-day cold checks plus 3/7/16/35-day refreshers — on 2026-08-18 at Davis's call. **Don't reintroduce day-based scheduling without asking.** See the design doc's "Mastery drill" section before changing any of it; the small-deck gap cropping in particular is load-bearing, not cosmetic (crop the longest gap shorter than the rotation and the tail card is never reached, so the round can't end). **The flashcard is swipe-driven** (2026-08-19). The card is draggable by any pointer via `src/features/flashcard/useCardSwipe.ts` — right is forward in both modes (next card / Know It), left is back (previous card / Still Learning), matching the arrow keys. In Mastery the drag crossfades the card's text into the verdict, with the rim taking the mode's own hue for Know It and Alert Red for Still Learning; Standard gets no cue because it records nothing. **On touch devices the action buttons are hidden entirely and the gesture is the only visible input, at every screen size** — the test is `(pointer: coarse)`, not width (changed 2026-08-19 at Davis's call; it used to be `max-width: 560px`, which cost a desktop window dragged narrow its buttons). Anything pointing with a mouse, trackpad, or pen keeps them however narrow the window gets. They stay in the accessibility tree either way (visually hidden, not `display:none`), and a **Card buttons** switch in Settings — shown on touch only, since nowhere else are they hidden — brings them back. Undo lives in the options row at every size (just after the mode pill), not with the verdicts.

**Sharing** adds one screen off to the side: a `?s=<token>` link opens the Share screen (the only screen reachable without passing through Home), which offers **Add to my library** — working signed in or out. Creating a link requires a login (Davis, 2026-08-19); adding never does. A shared deck's questions are stored **once** (`shared_decks`), and each recipient's cloud row points at that snapshot instead of copying the JSON, while their progress stays entirely their own. Clicking a link for a deck you already have adds nothing — it opens your copy. **Don't add title-based deck matching** to that dedupe: two classes' "Chapter 4" are two study sets.

Mode Select carries a **Random order** switch beside Start, sliding in for Practice/Test and away under Review. It is per deck and device-local (`studydeck_quiz_order`, keyed by deck id, absence = off) — restored 2026-09-14 after an early version was removed as unhelpful, the difference being that this one remembers per set. Don't mirror it to Supabase; Davis's call is that it's a preference about how to study, not the studying.

Practice shows live feedback with retries (retries don't affect stats); Test shows no feedback until Stats and disallows retries; Review is a read-only browser with the correct answer shown.

### Visual design

"Star Atlas" aesthetic (replaced "Starfield" on 2026-08-22, at Davis's call — the app read as machine-generated) — the app as an engraved celestial atlas plate: an ink ground, ivory type, hairline rules and small brass annotation instead of boxes, one cool star-blue for the single actionable thing per view. **`DESIGN.md`** at the repo root is the source of truth for the full system (palette, typography, named rules); `docs/core/design-doc.md`'s Visual Design section is a synced technical summary. Color tokens live in `src/theme/tokens.css` (isolated so a shared cross-project theme can swap in later); component styles in `src/theme/styles.css`. Use the existing `--bg`/`--surface`/`--accent`/`--brass`/etc. tokens rather than introducing new colors.

**The redesign changed material and composition only — no workflow, control, flow or piece of state moved.** Four things in particular are load-bearing and are the reasons the old look read as generated; don't reintroduce any of them without asking:

- **No glow, ever** — no gradient-filled buttons, no colored box-shadows, no glow behind a headline, no gradient-clipped text. Buttons are flat stamps that translate 1px on press.
- **Corners, not curves** — `--radius` is 4px and is the system maximum; controls are 3px, small chrome 2px. No pills (`999px`), no discs (`50%`) except the auth avatar.
- **Lists are ruled, not tiled** — Home's library, quiz answers and the Stats breakdown are full-width rows separated by one hairline each. The old `auto-fill minmax()` card grid is gone.
- **Two inks** — star-blue means "act on this / this is selected"; brass (`--brass`) means "this is a marking on the plate" and is never interactive. Every piece of metadata in the app shares one voice: small letter-spaced uppercase brass mono.

## Deployment (live site)

The app is LIVE at **https://studydeck.brookslanding.com** (HostGator shared hosting; the subdomain's document root on the server is `~/studydeck`, a sibling of `public_html` — not inside it).

- **Redeploy:** `bash ~/.claude/skills/deploy-hostgator/scripts/deploy.sh` from the repo root (Davis's root-level `deploy-hostgator` skill: builds, uploads over SSH with a tar fallback, then attempts a cache purge).
- **Config:** project-specific fields live in `deploy.config.json` at the repo root (gitignored — never commit it). Account details (host/port/username/keyPath) come from `~/.claude/deploy-hostgator.defaults.json`; the skill's SKILL.md documents how to update either.
- **Deploys are manual.** Pushing to GitHub does NOT update the live site — run the deploy script when a change should go live.
- **Caching:** HostGator's server-side cache can serve the previous deploy for up to ~2h. The script auto-sends an HTTP `PURGE` when `siteUrl` is set (a 501 response means that endpoint doesn't support purging — the cache just expires on its own). Browsers cache favicons extra-aggressively.

## Gotcha — question editing does not exist yet

Renaming a study set shipped 2026-09-06 (the pencil in a Home row's margin). Editing a deck's **questions** still does not exist, and two shipped systems quietly depend on that. **When it lands, read `docs/sharing/design-doc.md` "Gotchas for when deck editing lands" first.** The short version:

- A deck added from a share link has **no payload of its own in the cloud** (`decks.data` is null, `share_token` points at the snapshot). Editing it must **fork** — write the edited JSON into `decks.data` and clear `share_token` — or the edit rewrites the questions for every other recipient.
- Sharer-side edits deliberately do not reach recipients (own-copy model). "A newer version is available" would need a version column on `shared_decks`; Davis was asked on 2026-08-19 and deferred it precisely because nothing could go stale yet.

**Renaming goes through `Storage.renameFile` and nothing else.** `saveFile` upserts *by title*, so saving an entry under a new title would add a second deck instead of renaming the first. `renameFile` rewrites history directly (id, `shareToken` and `data` all preserved — `data.title` is deliberately left alone, so a shared copy's content hash and the link dedupe survive) and mirrors to the cloud as save-new-title → delete-old-title for BOTH title-keyed tables, `decks` and `flash_state`. It refuses a title another deck already holds; the UI says so under the field rather than freeing a "(2)" name. The published `shared_decks` snapshot is never touched — that table has no update policy, and recipients keep their own copies under their own names.

## Key constraints to preserve

- No backend — the app stays a static client-side bundle.
- Graph and KaTeX rendering failures must degrade gracefully (fallback text), never crash the app.
- Flashcard and quiz stats key off question `id`, never array index.
- Chart.js usage must be v4 syntax throughout (no v2/v3 config patterns).
- **100 study sets per account** (`MAX_DECKS` in `Storage.ts`, `enforce_deck_limits` + `create_share` in `schema.sql`). The cap is on ADDING a deck, never on updating one already held — an account at the limit must still be able to open its decks, since every open re-saves the entry. Change the number in both places or neither.
- Only `src/lib/Storage.ts` may touch `localStorage`.
- Only `src/lib/SupabaseClient.ts` may import `@supabase/supabase-js`.
- A shared deck's payload is stored once. A `decks` row is EITHER self-contained (`data`) OR a pointer (`share_token`) — never both.
- `shared_decks` must never get a blanket public `select` policy; token reads go through the `get_shared_deck` SECURITY DEFINER function, or the anon key becomes a directory of everyone's shared decks.
