---
type: prd
project: StudyDeck
date: 2026-07-19
status: active
tags: [studydeck, prd, planning, auth, supabase]
---

## Overview

Adds optional cloud persistence and login to [[StudyDeck]]. Today every deck and every flashcard pile lives only in the browser's `localStorage`. This PRD covers letting a user log in with just their email so their decks and progress survive a browser reset, a new device, or Safari quietly wiping site data. Guest mode (no login, local-only) stays exactly as it works today. This reverses one line of the original `PRD.md` non-goals ("no backend, no accounts, no sync") and should be read alongside it, not in place of it.

## Problem

Students paste an AI-generated deck's JSON into [[StudyDeck]] and it only exists in that one browser. Clear your cache, switch browsers, get a new laptop, or just have Safari's tracking-prevention wipe old site data, and the deck plus any flashcard progress on it is gone with no way to get it back. This is a real loss, not just an inconvenience: the deck itself was often generated through a real conversation with an AI and re-creating it isn't a copy-paste, it's redoing the work.

## Users

Same as the base app: Davis and friends sharing `.json` study sets. This feature specifically serves anyone who studies from the same deck across more than one sitting, which is effectively everyone using Test or Flashcard mode seriously, since flashcard pile progress (Know It / Still Learning) is exactly the kind of state that's painful to lose.

## Requirements

**Login is optional, never required.** A visitor who never logs in gets the exact same app they get today, `localStorage` only, no account nudge blocking any feature. Login is an upgrade, not a gate.

**Login entry point.** A "Log in" button, ghost/outline style (not competing visually with the existing solid-purple "Copy Prompt" button), top-right of the Home screen. Once logged in, that slot shows a small avatar instead, which is also the logout entry point.

**Email magic link, no password.** Clicking "Log in" opens a modal asking for an email address. Submitting sends an email with a single link. Clicking that link opens StudyDeck already logged in. No password to set, remember, or reset. No 6-digit code to type.

**Session persists indefinitely.** Once logged in, stay logged in across visits until the user explicitly logs out. No forced re-authentication window.

**First-login migration.** The moment someone logs in for the first time, whatever decks and flashcard pile state already exist in their `localStorage` are automatically uploaded to their new account. No separate "do you want to save these?" prompt, it just happens.

**What syncs.** Deck history (the same records currently in `studydeck_history`: title, question count, last opened, full deck data) and flashcard pile state (`known`/`learning` question ids per deck). Both keyed to the logged-in user, restored on any device they log into.

**Branded login email.** The email should look like it came from StudyDeck, not from a generic auth provider, dark background, purple CTA button, matching the app's existing visual identity. Sent via a custom SMTP provider rather than the auth platform's default sender, both for volume headroom (more than one person testing at once) and because default-sender emails can't be branded at all on the platform being used.

## Success Criteria

- A logged-in user can clear all browser data, log back in with the same email, and see every deck and every flashcard pile exactly as they left it.
- A user who never logs in notices no difference from the app today.
- The whole feature runs at $0 infrastructure cost at current expected usage (Davis plus a handful of friends).
- Logging in and receiving the email takes under a minute in normal conditions.

## Non-Goals

- No password-based authentication, ever, for this feature.
- No phone/SMS login (cost and setup not justified for this use case, see `notes/backend-persistence-plan.md`).
- No sharing or publishing decks between different users' accounts, that's a distinct future idea, not in scope here.
- No real-time multi-device sync or conflict resolution beyond last-write-wins, this app is not built for two people editing the same account's data simultaneously.
- No admin dashboard, no moderation tooling, no way for Davis to browse other users' data outside Supabase's own dashboard.
- No changes to the guest (logged-out) experience.
