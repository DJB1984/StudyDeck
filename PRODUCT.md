# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary:** Davis and the college friends he shares AI-generated `.json` study decks with directly.

**Secondary (confirmed real, not aspirational):** any student who lands on the live site or GitHub repo on their own, with zero prior context from Davis — onboarding and first-run clarity must work for a total stranger, not just people he's walked through it.

**Job:** they've already used some AI (Claude, ChatGPT, Gemini, etc.) to generate a question set grounded in their own course materials, and need a fast, no-setup way to actually practice, test, review, or flashcard-drill that set — not just read it in a chat window.

## Product Purpose

StudyDeck is a dependency-light, AI-agnostic runtime and player for AI-generated study decks. It intentionally contains no built-in AI — any model capable of producing a compatible `.json` file (per the shared format spec) can feed it. It provides the polished study environment a raw AI chat transcript can't: Practice, Test, Review, and Flashcard modes, plus progress tracking. Success means a complete stranger can go from "a `.json` file" to "a finished study session" in under 5 minutes with no setup.

## Positioning

Unlike Quizlet or Khan Academy (closed content ecosystems) or copy-pasting questions into a chat window (tedious, no structure, no persistence), StudyDeck is the open, AI-agnostic middle layer: any AI can generate content through one shared format spec, and StudyDeck is the only thing that turns that JSON into a real practice/test/flashcard experience with stats and progress. A product tied to one AI vendor or one closed question bank could not truthfully copy this.

## Operating Context

- **Upstream workflow (outside the app):** a student takes course materials to any AI and uses the format spec — surfaced in-app via Home's "Copy Prompt" button (Quick or Guided variant) — to generate a compatible `.json` deck.
- **In-app workflow:** Home (load or drag-drop a `.json`, see history) → Mode Select → Quiz (Practice or Test) / Flashcard → Stats → Review.
- Runs entirely client-side as a static site; no install and no account required for the core loop.
- Optional login (Supabase email magic link) upgrades local-only progress to cross-device cloud sync; guest mode is functionally identical to the pre-auth app.
- Live production instance at https://studydeck.brookslanding.com that strangers may land on cold, with no introduction from Davis.

## Capabilities and Constraints

- Four modes: Quiz–Practice (retry + immediate feedback; retries don't affect stats), Quiz–Test (no feedback until Stats; no retries), Flashcard (Know It / Still Learning piles, persisted per-deck), Review (read-only, correct answer shown).
- Full KaTeX math/physics notation (`$...$` inline, `$$...$$` display); Chart.js v4 graphs (point arrays or equations) as question context only — never as an answer choice.
- Deck JSON is versioned (`version: 1` today); unknown versions warn, they don't hard-fail.
- No backend for the core product — all core state lives in `localStorage`. Optional Supabase-backed auth/sync is strictly additive and never gates a feature: logging out (or never logging in) reproduces the exact pre-auth app.
- Graph and KaTeX rendering failures must degrade to fallback text, never crash the session.
- Terminology: "deck" = a loaded `.json` question set; "pile" = a flashcard's Know It / Still Learning bucket; "session" = one Practice/Test/Flashcard run recorded in Stats.
- Undecided: no formal open-source license has been chosen yet, even though the GitHub repo (`DJB1984/StudyDeck`) and the live site are both publicly reachable.

## Brand Commitments

Name: "StudyDeck." The shipped "Starfield" deep-space visual identity and design tokens are existing incumbent design, documented separately in `DESIGN.md`, `docs/core/design-doc.md`, and `src/theme/` — not decided here.

## Evidence on Hand

- `test-decks/` — real example quiz/flashcard decks used to validate against.
- `legacy/studydeck.html` — the original single-file implementation, preserved unchanged as reference.
- `docs/core/PRD.md`, `docs/core/design-doc.md`, `docs/auth/PRD.md` — the authoritative behavior/requirements record.
- `prompts/` — the AI-facing schema contracts (`studydeck-quiz-spec.md`, `studydeck-flashcard-spec.md`) plus the four Quick/Guided intros composed with them.
- Live production deployment at https://studydeck.brookslanding.com.
- Absence to preserve: no user testimonials, usage metrics, or case studies exist yet — future work must not fabricate them.

## Product Principles

1. **AI-agnostic by design** — StudyDeck never bundles a model or locks to one vendor; the shared format spec is the only contract with the outside world.
2. **Local-first, cloud-optional** — every feature must work fully logged-out; sync is a strict upgrade, never a gate.
3. **Content quality is the AI's job; the study experience is StudyDeck's** — practice/test/review/flashcard flows, stats, and progress persistence are what StudyDeck actually owns.
4. **Rendering must degrade, never break** — malformed LaTeX or a bad graph in a student's own deck should show a fallback, not crash their study session.
5. **Zero-setup for a stranger** — the audience now includes people who land on the live site with no context from Davis, so the first five minutes (load a file → complete a session) must ask nothing of them beyond having a valid `.json`.

## Accessibility & Inclusion

No accessibility standard or specific user need has been established yet. Treat as open until a real requirement surfaces rather than inventing one.
