# Intent

Review is a read-only browser through a quiz deck with the correct answer shown for every question. It exists as both a standalone study mode (skim the material with answers visible, no pressure) and as a post-quiz review path, so a student can walk the full deck after seeing their score.

# Requirements

- R1 [verify: ui] Review shows one question at a time: question text (KaTeX-rendered), an optional graph when present, and all four answer choices with the correct one highlighted. [caution: it highlights the CORRECT answer by index, unconditionally — it is not scored and does not reflect any student choice.]
- R2 [verify: ui] Answer buttons are non-interactive (disabled) — Review never accepts an answer or gives correctness feedback beyond the always-visible correct highlight.
- R3 [verify: ui] A progress indicator shows `{current} of {total}`.
- R4 [verify: ui] Prev/Next controls move between questions. Prev is disabled on the first question; Next is disabled on the last. [caution: navigation clamps at both ends rather than wrapping.]
- R5 [verify: ui] Keyboard: `ArrowLeft` triggers Prev, `ArrowRight` triggers Next, each respecting the disabled state at the ends.
- R6 [verify: ui] [caution: Review remembers where it was entered FROM and its Back control returns there, not to a hard-coded screen. Entered from Mode Select → Back to Mode Select; entered from Stats → Back to Stats. Losing this origin sends the student to the wrong place.] Review records an origin screen on entry and Back navigates to that origin.
- R7 [verify: ui] Review can be launched with an explicit question set and order (e.g. Mode Select passing the deck and its chosen order), or fall back to the current quiz's questions/order when opened from Stats.
- R8 [verify: ui] Each question's graph is rendered through the shared Graph component and degrades gracefully on failure (never crashes Review).

# Change log

- 2026-07-09: Spec authored for the React + TypeScript migration, backfilled from `ReviewScreen`, `openReviewScreen`, `renderReviewQuestion`, and `initReviewScreen` in `legacy/studydeck.html`. Captures read-only correct-answer highlighting, disabled answers, clamped prev/next with keyboard, and the remembered origin so Back returns to Mode Select or Stats depending on entry point. Authored as the target for the React Review feature.
