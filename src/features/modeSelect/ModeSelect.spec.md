# Intent

Mode Select is the branch point after a QUIZ deck is chosen. It presents the quiz study modes (Practice, Test, Review), lets the student opt into randomized question order, and launches the chosen mode. It exists to stop a student from ever picking a mode that is structurally incompatible with their deck — which, as of 2026-07-10, is enforced by routing rather than by filtering cards on this screen: flashcard decks never reach Mode Select at all (opening one auto-opens the Flashcard screen), because a one-option menu is a pointless click.

# Requirements

- R1 [verify: ui] The screen shows the deck `title` and a `{count} questions` subtitle for the current file.
- R2 [verify: ui] Mode Select renders ONLY for quiz decks (`type: "quiz"` or omitted) and shows exactly three mode cards: Practice, Test, and Review. Flashcard decks never see this screen — App routes them straight to the Flashcard screen on open. [caution: reachability is decided by deck `type` at the App routing layer, not by hiding cards here. Do not re-add a Flashcard card or a single-mode layout to this screen — the stretched lone-Flashcard-card state is exactly what was removed on purpose.]
- R3 [verify: ui] There are four study modes total across the app: Practice, Test, and Review launch from this screen; Flashcard exists but is reachable only by opening a flashcard deck (auto-open), never from Mode Select. [caution: Review is a real first-class mode reachable from here, not just a post-Stats branch. Don't collapse this screen to Practice/Test.]
- R4 [verify: ui] On entering the screen, selection resets to `practice` and the random-order toggle resets to off. [caution: these must reset on every entry — a stale selection or toggle from a previous deck must not carry over. The old flashcard-default branch is gone because flashcard decks no longer enter.]
- R5 [verify: ui] Clicking a mode card selects it (visually distinct selected state) and deselects the others.
- R6 [verify: ui] The random-order toggle is always visible — Practice, Test, and Review all support it. (The old hide-when-Flashcard rule is obsolete: flashcard decks never reach this screen, and the Flashcard screen owns its own random toggle — see Flashcard spec R7/R12.)
- R7 [verify: ui] Start launches the selected mode with the current deck's questions. When random order is on, question order is a shuffled permutation of indices; otherwise it is the natural `0..n-1` order.
- R8 [verify: ui] Start routing: Review → Review screen with origin remembered as Mode Select; Practice/Test → Quiz screen in that mode. There is no Flashcard routing from this screen (flashcard decks are routed by App at deck-open time; see Home spec R4/R10 and Flashcard spec R12).
- R9 [verify: ui] A Back control returns to Home without starting a session.
- R10 [verify: ui] Start is a no-op if there is no current file loaded.

# Change log

- 2026-07-10: Screen becomes quiz-only; flashcard decks bypass it entirely. Davis: "When you go into a flashcard set it's unnecessary to show the flashcard button. It should automatically open them." (Prompted by flashcard decks showing a single giant stretched Flashcard card — "that box shouldn't be resizable".) R2/R3 rewritten (reachable only for quiz decks; exactly Practice/Test/Review; Flashcard reachable only via auto-open), R4 simplified (practice-only default), R6 rewritten (random toggle always visible — the hide-for-Flashcard rule is obsolete), R8's Flashcard routing clause removed (App routes flashcard decks directly at deck-open; Flashcard's session defaults now live in Flashcard spec R12). R1, R5, R7, R9, R10 unchanged.
- 2026-07-09: Spec authored for the React + TypeScript migration, backfilled from `openModeScreen`/`initModeScreen` in `legacy/studydeck.html`. Captures type-driven mode filtering, the four-mode set (incl. Review as a first-class mode), per-entry reset of selection and random toggle, flashcard-only hiding of the Mode Select random toggle, and the per-mode Start routing. Authored as the target for the React ModeSelect feature.
