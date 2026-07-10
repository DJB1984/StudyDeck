# StudyDeck

A single-file HTML app for studying from AI-generated `.json` question decks — quiz, test, and flashcard modes, with no backend, no build step, and no built-in AI.

> Built as the "player" half of a study workflow where an AI (Claude, ChatGPT, Grok, Gemini — any of them) generates the questions from your own course materials.

---

## Demo

<!-- Replace with a GIF or screenshot once the app is stable -->
<!-- Record with ScreenToGif (Windows) -->
<!-- Show: loading a deck, answering a quiz question with KaTeX/graph rendering, and the stats screen -->

---

## Why I Built This

I was using AI to study from my professor's slides, but the generation side and the practice side were disconnected — I'd get a batch of questions from a chat, then have to manually track which ones I got wrong, scroll back to find math notation that didn't render, and lose all my progress the moment I closed the tab. Khan Academy and Quizlet don't let you bring your own AI-generated content. So I built a lightweight, AI-agnostic player: any model generates a `.json` deck from a shared format spec, and StudyDeck handles rendering, retries, flashcard piles, and stats — entirely client-side.

---

## Features

- **Quiz — Practice mode** — one question at a time with immediate right/wrong feedback, unlimited retries that don't affect your score, and a "copy to AI" button that formats a wrong answer into a prompt you can paste anywhere for an explanation.
- **Quiz — Test mode** — same flow with no feedback until the end and no retries, then a stats screen with correct answers collapsed and wrong answers expanded for review.
- **Flashcards** — Quizlet-style flip cards sorted into Know It / Still Learning piles, with progress keyed to stable question IDs so it survives reordering and persists across sessions.
- **LaTeX rendering** — full KaTeX support for math and physics notation via `$...$` and `$$...$$`.
- **Graph rendering** — Chart.js plots from either raw data points or an equation string, with required axis labels and titles.
- **Local history** — every deck you've loaded is saved in `localStorage` and reloads instantly from the home screen; deleting a deck cleans up its flashcard state too.
- **AI-agnostic format spec** — a plain markdown spec (`studydeck-format-spec.md`) any model can read to generate a valid deck, so nothing is locked to one AI provider.

---

## Tech Stack

- [React](https://react.dev/) 18 + [TypeScript](https://www.typescriptlang.org/) — component model with type safety
- [Vite](https://vite.dev/) — dev server and static build (no backend)
- [KaTeX](https://katex.org/) v0.16.x — LaTeX math rendering
- [Chart.js](https://www.chartjs.org/) v4.x — graph rendering
- `localStorage` — deck history and flashcard progress persistence

> Originally a single-file vanilla-JS app (kept at [`legacy/studydeck.html`](legacy/studydeck.html)), rebuilt in React/TS.

---

## Getting Started

```bash
git clone https://github.com/DJB1984/StudyDeck.git
cd StudyDeck
npm install
npm run dev
```

Then open the printed local URL. Build a static bundle with `npm run build` (output in `dist/`).

To try it immediately, drag one of the example decks from `test-decks/` onto the home screen. To create your own deck, give any AI model `studydeck-format-spec.md` along with your course material and ask it to generate a compatible `.json` file.

---

## How It Works

The app is a client-side React SPA — a screen state machine in `App.tsx`, no backend, no router library. Logic is split into modules that each own one concern: `Storage` is the only module that touches `localStorage`; the `Katex` and `Graph` components own all rendering and degrade to fallback text/"Graph unavailable" rather than crash; the quiz and flashcard engines separately track session state. A deck is just JSON: quiz decks carry `question`/`answers`/`correct` (+ optional `graph`), flashcard decks carry `front`/`back`, and a stable string `id` on every question ties stats and pile state to the question itself rather than its array position — so decks can be edited or reordered without losing progress.

Every feature has a co-located `*.spec.md` requirements file describing its intended behavior, kept honest by a requirements-writer agent that authors specs before a change and audits the code against them after.

---

## Lessons Learned

- Designing the JSON schema *before* writing any UI code made the AI-generation side trivial — the format spec and the app's validation logic could be written independently and still agree.
- Keeping strict module boundaries (e.g. only `Storage` touches `localStorage`) made it easy to reason about `QuotaExceededError` handling in one place instead of scattering try/catch everywhere.
- Rendering failures (bad LaTeX, malformed graph data) need to fail *locally* to one question, not the whole app — worth designing for from the start rather than retrofitting error boundaries later.

---

## License

MIT
