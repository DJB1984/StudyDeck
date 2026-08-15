---
type: prd
project: StudyDeck
date: 2026-08-15
status: draft
tags: [studydeck, prd, planning, flashcard-redesign]
---

## Overview

Redesigns Flashcard mode's navigation, piling, and progress-visibility. Flashcard mode is functionally sound today — it already has a persisted, id-keyed Know It / Still Learning pile model (`src/features/flashcard/flashEngine.ts`) that's structurally ahead of where Quizlet's equivalent feature started. What it lacks is the ability for a student to *stay oriented*: where they are in the deck, what they've actually mastered, and whether "flipping through" is accomplishing anything. This doc scopes fixing that, informed by a direct comparison against Quizlet's flashcard UX (research summary below).

## Problem

Davis's framing: **"it's hard to keep track of where your flashcards are."** Concretely, today:

- A page reload always restarts the session from card 1 of a fresh full-deck round — only pile membership (`known`/`learning`) survives, not position.
- There is no way to go back to the previous card to fix a misclick — Flashcard is strictly forward-only (`Quiz` has always had free Back/Next; Flashcard never did).
- There's no glanceable view of deck-wide mastery — the only progress signal is `Card {current} of {total}` for the *current session*, and it disappears the moment you leave. Nothing on Home shows how much of a deck you already know before you open it.
- "Still Learning" cards only resurface at the end of a full pass (a round) — a student drilling a large deck gets exactly one shot at each weak card before having to finish everything else first.

### What Quizlet does, and where it also falls short

Quizlet's Flashcards mode uses the same fundamental shape StudyDeck already has: flip a card, sort it into Know / Still Learning. Researching it surfaced the actual failure mode worth avoiding, not just copying:

- **The sort toggle is off by default and buried in an Options menu.** Most users never turn it on, so they just flip through cards with no tracking at all — this is almost certainly the same experience Davis is describing. StudyDeck should not repeat this: piling is already always-on and un-hideable, and this redesign keeps it that way rather than making it optional/discoverable-only.
- Even when a user does turn sorting on, Still Learning cards only recirculate at the end of a round — same limitation StudyDeck has today.
- There's no deck-wide overview grid in Quizlet either — mastery is only inferable by which cards keep reappearing.
- Quizlet's actually adaptive, mastery-tracked experience lives in a separate mode ("Learn") that's mostly paywalled — splitting the free flashcard flow from any real feedback loop. StudyDeck has no paywall to work around, so there's no reason to split these concerns the way Quizlet did.

## Users

Same as the core PRD — Davis and college friends studying from AI-generated decks — with this batch specifically serving anyone drilling a flashcard deck large enough that losing your place actually costs time (language vocab, terminology-heavy courses, command/syntax memorization).

## Goals

- A student can leave a flashcard session (reload, navigate away, come back later) and resume exactly where they left off — same card, same piles, same toggle settings — rather than always restarting a fresh full-deck round.
- A student can correct a misclick by going back one card, without losing already-recorded pile state for the cards after it.
- A student can see, at a glance, how much of a deck they've mastered — both mid-session (richer than "Card X of Y") and before ever opening the deck (from Home).
- A student can opt into a stricter mode where Still Learning cards keep reappearing, interwoven into the rotation, until every card in the working set is marked Know It — without this being the forced default (today's simpler single-pass-then-choose flow stays the default for anyone who just wants a quick pass through a deck).

## Non-Goals

- **No persisted flashcard history/stats screen.** Explicit call: flashcards stay stats-free, unlike Quiz's Stats screen. What's tracked is a live snapshot of current pile membership, not a trend over time, streaks, or session count.
- **No typed-answer / "Write" mode.** `Deck.inputMode: 'type'` is already stubbed in `types.ts` with zero UI behind it — this redesign does not implement it. It stays a schema-only placeholder for a future, separate project.
- **No calendar-based spaced repetition.** The "keep going until mastered" mode (Goal 4) reorders cards *within a session*; it does not schedule cards for a future day the way Anki's SM-2/FSRS or a Leitner box system would. `sortCard()` remains the isolated seam a real spaced-repetition scheduler could hook into later — this redesign doesn't build that scheduler.
- **No swipe gestures.** Desktop-first interaction stays button/keyboard-driven; touch swipe is not part of this scope (StudyDeck has no dedicated mobile app and no existing swipe infrastructure anywhere in the codebase to extend).

## User Stories

- *As a student who got interrupted mid-deck*, when I reopen the deck, I land back on the card I was on with my Know It / Still Learning marks intact, instead of starting over from card 1.
- *As a student who fat-fingered "Know It" on a card I don't actually know*, I can go back one card and re-sort it correctly, without disturbing anything else in the round.
- *As a student deciding whether to open a deck at all*, I can see from Home roughly how much of it I already know, before committing to a session.
- *As a student mid-session*, I can see which cards ahead of me are still unlearned versus already known, not just a bare "12 of 40" counter.
- *As a student who wants to actually finish learning a deck in one sitting*, I can turn on a mode where the deck keeps cycling Still Learning cards back at me, interleaved with the rest, until I've marked every single one Know It — instead of having to manually click "Continue with Still Learning" after every pass.

## Comparison Table

| | Quizlet Flashcards | StudyDeck today | StudyDeck (this redesign) |
|---|---|---|---|
| Pile model | Know / Still Learning, opt-in toggle | Know It / Still Learning, always on | Unchanged — always on |
| Resurfacing weak cards | End of round only (when sorting is on) | End of round only | Default: end of round (unchanged). Opt-in "Study Until Mastered": interwoven continuously |
| Session position on reload | Persists (cloud-synced account) | Lost — always restarts fresh | Persists locally, resumes in place |
| Backward navigation | Inconsistent/limited | None | One-step Back, undoes the last sort |
| Deck-wide mastery view | None (inferred only) | None | Overview grid, color-coded by pile, clickable to jump |
| Visibility before opening a deck | None specific to flashcards | None | Home shows a live "known/total" badge |
| Persisted study history/stats | Yes (separate "Progress" feature) | No | No (explicit non-goal) |

## Success Criteria

- Reloading the browser mid-round resumes the exact same card, pile state, and toggle settings — verified by reloading after sorting a few cards and confirming both position and piles match.
- Going Back after a sort restores that card's prior pile membership (or "unseen" if it hadn't been sorted before) and re-shows it, without altering any other card's pile state.
- The Home screen's mastery badge for a flashcard deck matches `Storage.getFlashState(title)` exactly, including for a deck that's never been opened (0 known) and one that's fully mastered (100%).
- The deck overview grid accurately reflects live pile membership and clicking any cell jumps directly to that card in the active session.
- With "Study Until Mastered" on, a session does not reach a completion state until every card in the working set is in the `known` pile; with it off, behavior is byte-for-byte identical to today's single-pass-then-choose flow.
