# Intent

Mode Select is the branch point after a deck is chosen. It presents only the study modes the loaded deck's `type` actually supports, lets quiz decks opt into randomized question order, and launches the chosen mode. It exists to stop a student from ever picking a mode that is structurally incompatible with their deck (e.g. multiple-choice Test on a front/back flashcard set).

# Requirements

- R1 [verify: ui] The screen shows the deck `title` and a `{count} questions` subtitle for the current file.
- R2 [verify: ui] [caution: mode availability is driven by the deck `type`, NOT by inspecting individual questions. A `type: "flashcard"` deck shows ONLY Flashcard; a quiz deck (type "quiz" or omitted) shows Practice, Test, and Review. Do not show all four modes for every deck.] Only the modes supported by the deck type are rendered/selectable.
- R3 [verify: ui] There are four modes total across the app: Practice, Test, Review (quiz decks), and Flashcard (flashcard decks). [caution: the live app has FOUR modes — Review is a real mode reachable from here, not just a post-Stats branch. Parity requires all four.]
- R4 [verify: ui] On entering the screen, selection resets to the deck's default mode: `practice` for quiz decks, `flashcard` for flashcard decks. The random-order toggle also resets to off each time. [caution: these must reset on every entry — a stale selection or toggle from a previous deck must not carry over.]
- R5 [verify: ui] Clicking a mode card selects it (visually distinct selected state) and deselects the others.
- R6 [verify: ui] The random-order toggle is hidden when the selected mode is Flashcard, and shown for Practice/Test/Review. [caution: Flashcard has its OWN random toggle on its own screen — the Mode Select random toggle is hidden (not removed from layout) for flashcard to avoid duplicating that control.]
- R7 [verify: ui] Start launches the selected mode with the current deck's questions. When random order is on, question order is a shuffled permutation of indices; otherwise it is the natural `0..n-1` order.
- R8 [verify: ui] Start routing: Flashcard → Flashcard screen (starting a fresh session, with its own random toggle initialized from the Mode Select random state and drill-mode off); Review → Review screen with origin remembered as Mode Select; Practice/Test → Quiz screen in that mode.
- R9 [verify: ui] A Back control returns to Home without starting a session.
- R10 [verify: ui] Start is a no-op if there is no current file loaded.

# Change log

- 2026-07-09: Spec authored for the React + TypeScript migration, backfilled from `openModeScreen`/`initModeScreen` in `legacy/studydeck.html`. Captures type-driven mode filtering, the four-mode set (incl. Review as a first-class mode), per-entry reset of selection and random toggle, flashcard-only hiding of the Mode Select random toggle, and the per-mode Start routing. Authored as the target for the React ModeSelect feature.
