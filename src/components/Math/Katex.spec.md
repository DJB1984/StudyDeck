# Intent

Katex renders LaTeX math embedded in deck text (questions, answers, card fronts/backs, graph labels, stats breakdown) into formatted math using KaTeX. It exists so that physics/math decks display real notation, while guaranteeing that a malformed LaTeX string from an AI-generated deck degrades to readable raw text instead of crashing the screen it appears on.

# Requirements

- R1 [verify: ui] Text is scanned for two delimiter styles: `$$...$$` renders as display (block) math and `$...$` renders as inline math. Content outside delimiters is left as-is. [caution: `$$` (display) must be matched before `$` (inline) so a `$$...$$` block isn't mis-parsed as two empty inline spans — preserve delimiter ordering.]
- R2 [verify: ui] [caution: KaTeX runs with `throwOnError: false` so malformed LaTeX renders as its raw source string rather than throwing. This is the non-negotiable safety property — never enable throwOnError, and wrap the render call so even an unexpected KaTeX error cannot crash the host component.] Malformed LaTeX falls back to raw string display and never crashes.
- R3 [verify: ui] Rendering is applied to every place decks show text: quiz question text and all four answers, flashcard front and back, Review question and answers, the Stats breakdown, and Graph title/axis labels.
- R4 [verify: ui] If the KaTeX library is unavailable at call time, rendering is a safe no-op that leaves the plain text in place rather than erroring.
- R5 [verify: manual] Rendered math inherits the surrounding font size where the design calls for it (e.g. graph labels shrink KaTeX to match the small axis text) rather than forcing KaTeX's default size everywhere.

# Change log

- 2026-07-09: Spec authored for the React + TypeScript migration, backfilled from `Renderer.renderKaTeX` and its call sites throughout `legacy/studydeck.html`. Captures the `$$`-before-`$` display/inline delimiters, the `throwOnError: false` raw-string fallback, the library-missing no-op, and the full set of surfaces LaTeX must render on. Authored as the target for the React Katex component (KaTeX auto-render equivalent).
