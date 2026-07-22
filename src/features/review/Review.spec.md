# Intent

Review is a read-only browser through a quiz deck with the correct answer shown for every question. It exists as both a standalone study mode (skim the material with answers visible, no pressure) and as a post-quiz review path, so a student can walk the full deck after seeing their score.

# Requirements

- R1 [verify: ui] Review shows one question at a time: question text (KaTeX-rendered), an optional graph when present, and all four answer choices with the correct one highlighted. [caution: it highlights the CORRECT answer by index, unconditionally — it is not scored and does not reflect any student choice.]
- R2 [verify: ui] Answer buttons are non-interactive (disabled) — Review never accepts an answer or gives correctness feedback beyond the always-visible correct highlight.
- R3 [verify: ui] A progress indicator shows `{current} of {total}` alongside a fill bar, in a header structurally identical to Quiz's (shared `.progress-header`/`.progress-text`/`.progress-bar`/`.progress-fill` classes) — no screen title text, matching Practice/Test having none either. [caution: the bar fills by `(current-1)/total`, same "completed" semantic as Quiz's R2 — reads 0% on Q1.]
- R4 [verify: ui] Prev/Next controls move between questions. Prev is disabled on the first question; Next is disabled on the last. [caution: navigation clamps at both ends rather than wrapping.]
- R5 [verify: ui] Keyboard: `ArrowLeft` triggers Prev, `ArrowRight` triggers Next, each respecting the disabled state at the ends.
- R6 [verify: ui] [caution: Review remembers where it was entered FROM and its exit control returns there, not to a hard-coded screen. Entered from Mode Select → back to Mode Select; entered from Stats → back to Stats. Losing this origin sends the student to the wrong place.] The exit control is a ✕ icon (`.abandon-btn`, shared with Quiz's Practice/Test) in the header, not a text "Back" button — matches Practice/Test visually. Clicking it navigates to the remembered origin.
- R7 [verify: ui] Review can be launched with an explicit question set and order (e.g. Mode Select passing the deck and its chosen order), or fall back to the current quiz's questions/order when opened from Stats.
- R8 [verify: ui] Each question's graph is rendered through the shared Graph component and degrades gracefully on failure (never crashes Review).
- R9 [verify: ui] A "Copy explanation prompt" button sits in the middle of the Prev/Next row and is ALWAYS present (Review has no chosen answer gating it, unlike Quiz's Practice mode). It copies an AI prompt asking to explain the correct answer for the current question — built via `buildPrompt(q)` with no chosen index — with brief "Copied!" feedback. Its label resets to default on navigating to a different question.

# Change log

- 2026-07-21 (round 4): Review's header/question-body/answer-list markup now literally IS Quiz's — both render `src/components/QuizUI.tsx`'s `ProgressHeader`/`QuestionBody`/`AnswerList` rather than each screen hand-rolling its own copy. Review passes `isDisabled={() => true}` and a correct-answer-only className function; Quiz passes its scoring-aware versions. No behavior change, just removes the duplication Davis flagged.
- 2026-07-21 (round 3): R3 gained a fill bar, reusing Quiz's `.progress-header` markup wholesale (and dropping the "Review" title text to match) — "should have a progress bar on the top, like the test and the practice."
- 2026-07-21 (round 2): R6's exit control changed from a text "← Back" button to the same ✕ icon (`.abandon-btn`) Practice/Test use, for visual cohesion across all three modes. Behavior (return to remembered origin) is unchanged.
- 2026-07-21: Added the always-on "Copy explanation prompt" button (R9), placed in the middle grid column of `.review-nav` alongside Prev/Next.
- 2026-07-09: Spec authored for the React + TypeScript migration, backfilled from `ReviewScreen`, `openReviewScreen`, `renderReviewQuestion`, and `initReviewScreen` in `legacy/studydeck.html`. Captures read-only correct-answer highlighting, disabled answers, clamped prev/next with keyboard, and the remembered origin so Back returns to Mode Select or Stats depending on entry point. Authored as the target for the React Review feature.
