# Intent

Stats turns a finished quiz session into a score, a visual breakdown, and next-step actions (retake or review). It is kept deliberately separate from the Quiz engine so that scoring and presentation logic can evolve — new metrics, different charts — without touching how questions are asked.

# Requirements

- R1 [verify: unit] `buildRecord(answerRecord, duration, mode)` produces `{ mode, totalDuration, total, correct, score, questions }` where `total` is the number of questions in the session (Quiz passes one record per session question, including a synthesized `chosenIndex: -1` / `firstAttemptCorrect: false` entry for anything left unanswered — see Quiz.spec.md R3/R12), `correct` is the count of `firstAttemptCorrect === true`, and `questions` is the raw answer record. [caution: `correct` reads `firstAttemptCorrect` as-is and does no scoring itself — Quiz has already decided what that means per mode (first-attempt in Practice, final-answer in Test, always false when unanswered).]
- R2 [verify: unit] `score` is `Math.round(correct / total * 100)`, and is `0` when `total` is `0` (no divide-by-zero).
- R3 [verify: unit] `buildPieData(record)` returns `{ correct, incorrect }` where `incorrect = total - correct`.
- R4 [verify: ui] The score summary shows the score percentage in the center of the chart, a `{correct} / {total} correct` line, and a `Session time: {duration}` line. Duration formats as `{m}m {s}s` when at least a minute, else `{s}s`.
- R5 [verify: ui] [caution: Chart.js v4 syntax only — the pie is a doughnut (`type: 'doughnut'`, `cutout: '72%'`), not a v2/v3 pie config. Destroy any previous chart instance before creating a new one to avoid canvas-reuse errors.] The correct/incorrect split renders as a doughnut chart using the accent purple for correct and the incorrect red for incorrect, legend and tooltip disabled.
- R6 [verify: ui] The per-question breakdown lists every question in the session, in session order — including ones left unanswered. Correct questions render collapsed: a check mark plus the single-line (ellipsized) question text. Wrong questions render expanded: full question text, the chosen answer (labeled A–D) marked wrong — or, if `chosenIndex === -1` (never answered), "You didn't answer this one" in place of a chosen answer — and the correct answer (labeled A–D) marked correct.
- R7 [verify: ui] Every breakdown item has a "Copy explanation prompt" button EXCEPT an unanswered question (`chosenIndex === -1`), which has no chosen answer to build a prompt from. The button copies the AI prompt for that question and its chosen answer, with brief "Copied!" feedback. Question and answer text in the breakdown are KaTeX-rendered.
- R8 [verify: ui] A Retake action restarts the same quiz immediately, in the same question order. [caution: there is no random-reorder option — Mode Select's random-order toggle was removed (2026-07-21) and `QuizSession.wasRandom` no longer exists, so the old same/random retake prompt is gone. Do not reintroduce it without Mode Select regaining a way to produce a randomized order.]
- R9 [verify: ui] A Review action opens the Review screen for this deck, remembering Stats as the origin to return to.
- R10 [verify: ui] A Home action returns to the Home screen.
- R11 [verify: ui] The breakdown looks up each question's full data by matching the answer record's `id` against the deck's questions. [caution: match by `id`, never by array index — the session order may be shuffled relative to the deck.]

# Change log

- 2026-07-21: Quiz gained free Back/Next navigation (see Quiz.spec.md), so a session can end with unanswered questions — R1/R6/R7 updated to cover the `chosenIndex: -1` sentinel. Mode Select's random-order toggle was removed, so R8's retake modal is gone — retake is now unconditional same-order.
- 2026-07-09: Spec authored for the React + TypeScript migration, backfilled from `Stats`, `Renderer.renderStats`, `formatDuration`, and `initStatsScreen` (incl. the retake modal) in `legacy/studydeck.html`. Captures first-attempt scoring aggregation, the doughnut (v4) chart, collapsed-correct/expanded-wrong breakdown with copy-to-AI, id-based question lookup, and the random-only retake-order prompt. Authored as the target for the React Stats feature.
