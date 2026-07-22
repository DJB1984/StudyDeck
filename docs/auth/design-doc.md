---
type: design-doc
project: StudyDeck
date: 2026-07-19
status: active
tags: [studydeck, design, architecture, auth, supabase]
---

Companion to the base `design-doc.md`. Read that first, this only covers what's new. Nothing here changes the existing screens, JSON schema, or CSS tokens described there.

## Tech Stack Addition

| Concern | Choice | Reason |
|---|---|---|
| Backend | [[Supabase]] (Postgres + Auth), free tier | HostGator's Hatchling plan has no Node backend (see `Context/infrastructure.md`); Supabase is a BaaS the static frontend calls directly, no server to run or deploy |
| Client library | `@supabase/supabase-js` | Official client, handles auth session storage and Postgres queries |
| Auth method | Supabase Auth, email magic link (`signInWithOtp` with a redirect, not a typed code) | No password to build or store, no SMS provider needed |
| Email delivery | Custom SMTP via [[Resend]], configured in the Supabase dashboard, not in app code | Supabase's default sender caps at 2 emails/hour project-wide and can't be template-customized on free tier; Resend free tier gives 3,000/month and full template control |

No changes to hosting. HostGator keeps serving the static `dist/` build exactly as it does today; Supabase and Resend are both called directly from the browser.

## Data Model

Two new Postgres tables in Supabase, both scoped to `auth.uid()`.

```sql
create table decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  title text not null,
  question_count int not null,
  last_opened timestamptz not null default now(),
  data jsonb not null,       -- the full deck JSON, same shape as studydeck_history entries
  created_at timestamptz not null default now()
);

create table flash_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  deck_title text not null,  -- matches the deck's title, mirrors the studydeck_flash_{title} key today
  known jsonb not null default '[]',
  learning jsonb not null default '[]',
  updated_at timestamptz not null default now(),
  unique (user_id, deck_title)
);
```

**Row Level Security is not optional.** Both tables must have RLS enabled with a policy restricting every operation to `user_id = auth.uid()`. Without this, the Supabase anon key used by the static frontend can read and write every user's rows. This is the single most important item in this whole feature to get right before shipping, flag it explicitly in the task list and verify it with two separate test accounts before calling the feature done.

## Auth Flow

1. User clicks "Log in" → `LoginModal` opens, asks for email.
2. Submitting calls `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: <app URL> } })`.
3. Resend (via Supabase's configured SMTP) sends the branded email (see `notes/backend-persistence-plan.md` for the approved design).
4. User clicks the link in the email, lands back on `studydeck.brookslanding.com` with an active Supabase session.
5. An `onAuthStateChange` listener fires app-wide, updating auth state and triggering first-login migration if this is a new account (see below).

**Session persistence.** The Supabase client's default behavior stores the session (refresh token) in `localStorage` and keeps it valid indefinitely until explicit sign-out, which matches the "stay logged in" requirement with no extra code. Worth noting explicitly so it isn't confused with the problem this whole feature solves: if that local session token gets wiped, the user just clicks "Log in" and gets a new magic link, no data loss, because the actual decks and flashcard state live in Supabase, not in that token. Losing the session costs one click; losing `localStorage` today costs the whole deck.

## Module Architecture

Follows the same rule as the base app: each module owns its domain, nothing reaches past another to touch its data.

- **`src/lib/SupabaseClient.ts`** — the ONLY module that imports `@supabase/supabase-js` or holds a reference to the client. Exposes the auth methods (`signInWithOtp`, `signOut`, `onAuthStateChange`, `getSession`) and the two table queries (`getDecks`, `saveDeck`, `deleteDeck`, `getFlashState`, `setFlashState`). Mirrors how `Storage.ts` is the only module allowed to touch `localStorage`.
- **`src/lib/Storage.ts`** — extended, not replaced. Every existing method (`getHistory`, `saveFile`, `deleteFile`, `getFlashState`, `setFlashState`) keeps its exact signature so `QuizEngine`, `FlashEngine`, and every screen that already calls `Storage` needs zero changes. Internally, each method checks auth state: logged out, behaves exactly as today (`localStorage` only); logged in, delegates to `SupabaseClient.ts` instead. This is the seam that makes the rest of the app indifferent to whether the user is logged in.
- **`src/features/auth/`** — new feature folder:
  - `AuthButton.tsx` — the Home screen header element. Renders the ghost "Log in" button when logged out, a small avatar (initials or a generated color from the email) when logged in. Click on the avatar opens a small menu with "Log out."
  - `LoginModal.tsx` — email input, submit, loading/sent state ("Check your email"), error state (invalid email, send failure).
  - `migration.ts` — runs once per new login. Reads current `localStorage` history and flash state, bulk-inserts into `decks` and `flash_state` via `SupabaseClient.ts`, then leaves the local copies in place as a cache (does not clear `localStorage` on migration, so a logout doesn't strand the user without their last-seen data before the next login).

## Screens

No new full screens. Two additions to the existing Home screen:

**Header, top-right.** Ghost/outline "Log in" button, positioned left of the existing solid-purple "Copy Prompt" button. Logged in: replaced by a circular avatar of the same size.

**Login modal.** Follows the existing glass card pattern from `design-doc.md` (`--surface`, `--blur`, `--border`, `--radius`). Single email input, one primary button ("Send login link"), cancel/close (X or backdrop click). After submit: swap the form for a confirmation state ("Check your email — link sent to {email}").

## Email Design

Sent via Supabase's custom email template, configured to route through Resend SMTP. Design approved 2026-07-19 (see mockup discussion in `Daily/2026-07-19.md`):

- Explicit dark background (`#0a0a0f`), not reliant on email client dark-mode inversion, which Gmail and Apple Mail apply unpredictably to emails that don't declare their own colors.
- No blur, glass, or gradient effects, most email clients strip `backdrop-filter` and related CSS entirely, so the card is a flat dark surface.
- Solid purple (`#7c3aed`) CTA button, plus a plain-text fallback link underneath for clients that clip or strip styled buttons.
- Trust line: "Didn't request this? Safe to ignore, no account changes were made." Necessary so a magic-link email doesn't read as phishing.
- 560px max width, centered, single column, mobile-safe tap target on the button.

## Error Handling / Edge Cases

- **Expired or already-used magic link**: Supabase rejects it, app shows "This link has expired or was already used, request a new one" and reopens the login modal.
- **Migration failure mid-upload**: if the bulk insert to `decks`/`flash_state` partially fails (e.g. quota, network drop), retry once; if it still fails, log in succeeds anyway and local data is untouched, the user can manually re-trigger migration or it retries automatically on next login. Never block login on migration succeeding.
- **Free-tier project auto-pause**: Supabase free projects pause after 7 days of no activity. First request after a pause has extra latency (a few seconds) while it wakes, not an error, just worth the login modal having a loading state that can sit for a couple seconds without looking broken.
- **Resend send failure**: surface a generic "Couldn't send the login email, try again" rather than exposing provider error details.
