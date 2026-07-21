---
type: task-list
project: StudyDeck
date: 2026-07-19
status: active
tags: [studydeck, claude-code, implementation, auth, supabase]
---

Hand this file to [[Claude Code]] along with `PRD-auth.md` and `design-doc-auth.md`. Also keep the base `PRD.md` and `design-doc.md` open, this feature extends that app, doesn't replace it. Work phase by phase, verify in a real browser (and with a second test account where noted) before moving on.

---

## Phase 0 — Accounts and Config (Davis, not Claude Code)

**Goal:** Supabase project and Resend account exist and are connected before any code is written.

- [ ] Create a Supabase project (free tier)
- [ ] Create a Resend account (free tier), verify a sending domain (or use Resend's shared domain for initial testing)
- [ ] In Supabase dashboard: Auth → SMTP settings, point at Resend using the Resend API key
- [ ] Confirm the Supabase project URL and anon public key are on hand for env vars
- [ ] Verify: send a test magic-link email from the Supabase dashboard's auth test tools and confirm it arrives, and that it's coming from Resend, not Supabase's default sender

---

## Phase 1 — Schema and Row Level Security

**Goal:** `decks` and `flash_state` tables exist in Supabase, RLS enabled and correct.

- [ ] Create `decks` table per `design-doc-auth.md` schema
- [ ] Create `flash_state` table per `design-doc-auth.md` schema
- [ ] Enable Row Level Security on both tables
- [ ] Add policy on both tables: users can only `select`/`insert`/`update`/`delete` rows where `user_id = auth.uid()`
- [ ] **Verify with two separate test accounts**: log in as account A, insert a deck, log in as account B, confirm account B cannot see or query account A's row through the client. This is a hard gate, do not proceed to Phase 4 until this passes.

---

## Phase 2 — Client Wiring

**Goal:** App can talk to Supabase, no UI yet.

- [ ] `npm install @supabase/supabase-js`
- [ ] Add Supabase URL and anon key as Vite env vars (`.env`, gitignored)
- [ ] Create `src/lib/SupabaseClient.ts` — the only module that imports `@supabase/supabase-js`. Export: `signInWithOtp(email)`, `signOut()`, `onAuthStateChange(callback)`, `getSession()`, `getDecks()`, `saveDeck(deck)`, `deleteDeck(id)`, `getFlashState(deckTitle)`, `setFlashState(deckTitle, state)`
- [ ] Verify: a temporary console log confirms `getSession()` resolves without throwing, both logged out (null session) and after a manual test login

---

## Phase 3 — Auth UI

**Goal:** Clicking "Log in," entering an email, and clicking the emailed link results in a logged-in session, visible in the UI.

- [ ] Build `src/features/auth/AuthButton.tsx`: ghost-style "Log in" button, top-right of Home screen, left of the existing "Copy Prompt" button
- [ ] Build `src/features/auth/LoginModal.tsx`: glass card matching existing modal/card styling, email input, "Send login link" button, loading state, "check your email" confirmation state, error state
- [ ] Wire `LoginModal` submit to `SupabaseClient.signInWithOtp(email)`
- [ ] Handle the redirect back into the app after the email link is clicked, restore session via `onAuthStateChange`
- [ ] Once logged in, `AuthButton` swaps to a small circular avatar (initials or color derived from email); clicking it opens a small menu with "Log out"
- [ ] Wire logout to `SupabaseClient.signOut()`, `AuthButton` reverts to "Log in"
- [ ] Handle expired/used-link error state: show "This link has expired or was already used, request a new one" and reopen the modal
- [ ] Verify: full loop in a real browser, click Log in, enter email, receive the branded email, click the link, land back logged in with avatar showing, log out, avatar reverts to button

---

## Phase 4 — Storage Integration

**Goal:** Logged-in users' deck history and flashcard state read from and write to Supabase; logged-out users are completely unaffected.

- [ ] Extend `src/lib/Storage.ts`: every existing method (`getHistory`, `saveFile`, `deleteFile`, `getFlashState`, `setFlashState`) checks current auth state internally
- [ ] Logged out: existing `localStorage` behavior, byte-for-byte unchanged from the base app
- [ ] Logged in: delegate to the matching `SupabaseClient.ts` method instead
- [ ] Confirm no other module (`QuizEngine`, `FlashEngine`, screens) needed any changes, the `Storage` interface didn't change shape
- [ ] Verify: log in, add/delete a deck, confirm it appears/disappears correctly, log out, confirm the guest/local view is unaffected by whatever happened while logged in

---

## Phase 5 — First-Login Migration

**Goal:** Existing local decks and flashcard progress automatically move into a new account on first login, without a separate prompt.

- [ ] Build `src/features/auth/migration.ts`: on a successful new login, read current `localStorage` history and flash state, bulk-write into `decks` and `flash_state` via `SupabaseClient.ts`
- [ ] Do not clear `localStorage` after migration, leave it as a local cache so logout doesn't strand the user
- [ ] Handle partial migration failure gracefully: login still succeeds, local data is untouched, retry migration automatically on next login if it didn't fully complete
- [ ] Verify: with existing decks loaded locally (not logged in), log in for the first time, confirm every deck and flashcard pile shows up under the account with nothing lost or duplicated

---

## Phase 6 — Edge Cases and Free-Tier Behavior

**Goal:** The app handles the two known free-tier quirks gracefully.

- [ ] Add a loading state to the login flow that tolerates a few seconds of latency without looking broken, covers the case where a paused free-tier project is waking up
- [ ] Confirm Resend send failures surface a generic "Couldn't send the login email, try again" rather than a raw error
- [ ] Verify: manually pause the Supabase project (or wait for auto-pause) and confirm a login attempt still eventually succeeds rather than failing silently

---

## Phase 7 — Final Verification

**Goal:** Feature is done, both experiences work, nothing regressed.

- [ ] Full guest-mode regression pass: every existing feature from the base app (`task-list.md` phases) still works identically with no login
- [ ] Full logged-in pass: log in, generate/paste a deck, complete a quiz, sort flashcards, log out, log back in, confirm everything is exactly as left it
- [ ] Cross-device check: log into the same account from a second browser (or incognito window), confirm the same decks and progress appear
- [ ] Re-confirm the RLS test from Phase 1 still passes after all the UI work
- [ ] Update the base `design-doc.md`'s "localStorage Schema" section to note the Supabase mirror, per the base `CLAUDE.md` rule to keep it in sync with architecture changes
