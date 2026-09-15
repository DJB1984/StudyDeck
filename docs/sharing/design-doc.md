# StudyDeck — Sharing: Design Doc

**Status:** shipped 2026-08-19. Owner-owned sets added 2026-09-14.
**Scope:** copy a link to a study set, send it to someone, and let them add it to their own library — logged in or not. The sharer owns the set; recipients hold read-only copies that track its name.

Read this alongside `docs/auth/design-doc.md` (the Supabase tables and RLS this builds on) and `docs/core/design-doc.md` (the localStorage shape and screen state machine).

---

## The model in one paragraph

A share is a **snapshot of a deck, stored exactly once**, addressed by an unguessable token that lives in the link. Everyone who adds that link gets their **own deck** in their own library — their own mastery progress, their own quiz stats, nothing shared but the questions — and their library row **points at** the one stored snapshot instead of storing the questions again. Fifty recipients cost one payload row.

**The sharer owns the set** (2026-09-14). They are the only one who can change it; a recipient's copy is read-only and takes its name from the snapshot, so renaming a shared set renames it for everyone holding the link, silently, the next time they open StudyDeck. What stays untouchably theirs is the *studying* — progress is never shared in either direction.

## Decisions (Davis, 2026-08-19)

| Question | Decision |
| --- | --- |
| Copy or live pointer? | **Own copy, single stored payload.** Recipients study their own deck; the JSON is stored once. |
| How do we know they already have it? | **Stamped share token first, content hash as fallback.** Never title. |
| Sharer's version changed since? | **Superseded 2026-09-14** — see the decisions below. A rename now reaches every copy; questions still can't be edited. |
| Can a signed-out user create a link? | **No — creating needs a login.** *Adding* from a link works signed out. |

## Decisions (Davis, 2026-09-14)

| Question | Decision |
| --- | --- |
| Who may change a shared set? | **Only the person who shared it.** A recipient's copy is fully read-only — no rename, no editing. |
| What does "the owner changed it" mean today? | **A rename, and only a rename.** Question editing still doesn't exist; the plumbing is built so it slots in. |
| How does an update reach recipients? | **Silently, on next open.** No badge, no prompt, no accept step. |
| What happens to a recipient's progress? | **Kept, by question `id`.** A rename must never cost anyone a mastery streak. |

## Data model

Two changes to the schema in `supabase/schema.sql`:

```sql
shared_decks (
  id, token unique, owner_id, title, question_count,
  content_hash,          -- canonical hash of `data`; see lib/deckIdentity.ts
  data jsonb,            -- the snapshot, stored once
  created_at,
  unique (owner_id, content_hash)   -- re-sharing returns the SAME token
)

decks
  + share_token text references shared_decks(token)   -- pointer, may be null
  ~ data jsonb  is now NULLABLE
  + check (data is not null or share_token is not null)
```

A `decks` row is now **either** self-contained (`data`) **or** a pointer (`share_token`) — never both. `SupabaseClient.saveDeck` picks: a deck carrying a `shareToken` uploads the pointer and `data: null`. `getDecks` resolves pointers with one follow-up `shared_decks` query (deliberately not a PostgREST embed, so nothing depends on a generated relationship name) and drops any row whose snapshot has vanished — a deck-shaped hole is worse than an absent deck.

Locally, `HistoryEntry` gains one optional field:

```ts
shareToken?: string;   // set on the deck the owner published AND on every added copy
```

The full deck payload always stays in `localStorage` regardless — that is the local cache, and the app must work offline and signed out.

### Row Level Security

`shared_decks` deliberately has **no blanket public select**. A `using (true)` policy would let anyone holding the browser-shipped anon key list every shared deck on the service. Instead:

- **`get_shared_deck(p_token)`** — `SECURITY DEFINER`, granted to `anon` + `authenticated`. Answers only for an exact token. That makes the token a capability, not a directory listing.
- **`shared_decks_select_visible`** — an authenticated user may read a share row they own, or one referenced by a deck in their own library (which is what lets `getDecks` resolve pointers).
- **`create_share(...)`** — `SECURITY DEFINER` (it needs the token-uniqueness loop), granted to `authenticated` only, with an explicit `auth.uid() is null → raise` guard replacing the RLS check that definer rights bypass, and a 2MB payload ceiling since this is the one write path an abuser could aim volume at.

## Ownership and live names

The token alone cannot tell a publisher's deck from a copy of it — it is stamped on both, deliberately, because it is the dedupe key. So ownership is its own field:

```ts
shareOwner?: boolean;   // true only on the deck THIS student published
```

`isSharedCopy(entry)` in `shareLibrary.ts` is the single expression of the rule: a deck is read-only when it carries a token and the flag isn't `true`. **Absence reads as read-only on purpose** — a rename has to reach the snapshot, and a student who can't prove they own it can't do that anyway. Decks published before the flag existed therefore read as read-only until their owner signs in, at which point they're back to normal.

**The account is the authority.** `shared_decks.owner_id` settles it, in two places: `getDecks` compares it to `auth.uid()` when resolving pointers, and `get_shared_titles` returns it as `is_owner` on every sync. Signed out it is always `false`, which says nothing — so `applyOwnership` writes nothing at all when logged out, rather than demoting an owner to a recipient on their own device.

### Two new SQL entry points

`shared_decks` still has **no update policy**. Both of these are `SECURITY DEFINER`, which is what keeps that true:

- **`rename_share(p_token, p_title)`** — authenticated only, owner-matched, and touches `title` and nothing else. `data`, `content_hash` and `owner_id` stay immutable, which is exactly why a rename can't break the content-hash dedupe or orphan a link. A non-owner's call matches no row and reports success without confirming the token exists.
- **`get_shared_titles(p_tokens[])`** — anon + authenticated, exact-token, array sliced to 200. Returns `title`, `question_count`, `content_hash` and `is_owner`. Granted to anon for the same reason `get_shared_deck` is: a deck added while signed out has no cloud row, so its token is the only handle it has.

### The sync pass

`src/features/share/shareSync.ts`. One batched RPC for the whole library, run **once per app session** on Home's mount (Home remounts on every return from a quiz) and again at the front of `syncOnLogin`.

That login ordering is load-bearing: a set whose owner renamed it is still under the old name locally, and `mergeDown` — seeing the account's copy under a name no local deck holds — would take it for a different deck and add a second copy. Settling names first makes the two sides agree before either direction runs.

Renames are applied through **`Storage.renameFile`**, never by writing history: the deck keeps its `id` (and with it every mastery streak and the quiz-order preference, both id-keyed), and the title-keyed cloud rows for `decks` and `flash_state` are moved rather than stranded. That is how a recipient's progress survives an owner's rename.

**Collisions.** If an unrelated local deck already holds the incoming name, the copy parks beside it as `"Title (2)"` — the same resolution adding a shared deck uses. The free title is computed against every deck *but this one*, so a copy already parked there reads as settled instead of drifting to `(3)` on every sync; and if the deck it was dodging is later removed, the next sync moves it onto the real name.

**One direction only.** The sync never pushes a local title up. Only the explicit rename does, via `renameSharedDeck` — which is the one rename path the UI may call, and refuses a copy of someone else's set.

## Identity: "is this the same deck?"

`src/lib/deckIdentity.ts` owns the answer, shared by sharing and by login migration so the two can't disagree.

- `canonicalDeck()` — JSON with keys sorted at every level. Key order matters because `data` round-trips through a Postgres `jsonb` column, which does not preserve it.
- `deckHash()` — two 32-bit FNV-1a lanes with different seeds, concatenated to 16 hex chars. Synchronous on purpose: every caller runs inside a synchronous Storage read, and `crypto.subtle.digest` is async-only. It is a collision check across the decks one student holds, **not a security boundary** — nothing is authorized on a hash match.

## Dedupe, in order of confidence

`findExistingCopy()` in `src/features/share/shareLibrary.ts`:

1. **Stamped `shareToken`.** Survives a rename, and never confuses two different decks that happen to share a title.
2. **Content hash.** Catches a deck that arrived some other way — imported as a file, or synced down before it was ever shared. A match **stamps the token on**, so pass 1 catches it from then on and the cloud row can drop its duplicate payload.
3. **No third pass.** Title is deliberately *not* a matching rule: "Chapter 4" from two different classes is two different study sets, and merging them would hand a student someone else's questions under their own deck's name.

A match means the link **opens the deck they already have** — no prompt, no second copy. A miss means the offer screen.

`Storage.saveFile` preserves `shareToken` across an upsert the same way it preserves `id`: the token belongs to the deck on disk, not to whatever copy is being written over it. Without that, re-importing the file (or just opening the deck, which re-saves the entry with a new `lastOpened`) would strip the token and the next click of that link would add a duplicate.

**Title collision on add.** `Storage` upserts by title, so an unrelated local deck holding the incoming name would be overwritten. Same resolution login migration uses: keep both, the newcomer under a free `"Title (2)"`. Unlike migration's `retitle()`, sharing renames the **entry only** and leaves the inner `data.title` exactly as published — `data` has to stay byte-identical to the snapshot, or its hash stops matching and the cloud pointer stops being faithful. Nothing renders `data.title`.

## Flow

**Creating** (`ShareModal`, from a deck card's link button on Home):
deck already has a token → show it, no network call at all · signed out → log in from inside the modal, then publish · signed in → `create_share` → stamp the token on the deck → show the link.

`create_share` is idempotent per (owner, content), so sharing the same deck twice returns the token it already has and a re-share spreads the same link.

**Opening** (`ShareScreen`, `/?s=<token>`):
strip the token from the address bar → `await SupabaseClient.ready()` (adding works signed out, but a signed-in student's add must mirror, and Storage decides that synchronously from a session that may still be restoring) → `get_shared_deck` → **validate the payload like any pasted deck** → already have it? open their copy after a ~900ms "you already have this" beat · don't? offer Add / Not now.

**URL form: a query param (`/?s=…`), not a path.** The app ships as a static bundle on shared hosting with no rewrite rules, so `/s/<token>` would 404 before React ever loaded. The param form also works from `npm run preview` and `file://`.

## Gotchas for when deck editing lands

**Renaming shipped 2026-09-06** (the pencil in a Home row's margin, `Storage.renameFile`), and became owner-only and propagating on 2026-09-14. Editing a deck's *questions* still does not exist. When it arrives:

1. **A share-pointer row has no payload of its own.** This one has changed shape: a RECIPIENT can no longer edit at all (their copy is read-only), so there is no fork to do on their side — the Home pencil isn't offered and `renameSharedDeck` refuses. The OWNER editing their own set *should* rewrite `shared_decks`, which is the whole point of the new model. What still needs care is the in-between: a copy whose owner flag is unset because the student hasn't signed in yet reads as read-only, so an edit UI must gate on `isSharedCopy()` and not on `share_token` alone.
2. **An edit changes the content hash**, so the edited copy stops matching its snapshot. That's correct — it is no longer that deck — but it means the *token* stamp becomes the only thing tying them together. Decide deliberately whether an edited copy keeps the token (dedupe still works, but "add" and "already have it" get fuzzy) or drops it.
3. **Question edits must reach recipients**, unlike in the original own-copy model — the owner owns the set now (2026-09-14), and names already propagate. The seam is built: `shareSync.syncSharedNames()` already pulls each snapshot's `content_hash` on every pass, so "this copy is behind" is a comparison away. What's missing is the payload half — `get_shared_titles` returns no `data` (deliberately: pulling every deck's JSON on every app open is the wrong shape), so an out-of-date copy needs a follow-up `get_shared_deck` for just the decks whose hash moved. Apply it silently, like a rename.
   Two rules that come with it: **progress is kept by question `id`** (records for surviving ids stay, removed questions drop theirs, new questions start fresh — this is already how flashcard and quiz state are keyed, so it is nearly free), and **`rename_share` is not the model to copy** — it updates `title` alone precisely so the hash can't move under a recipient. A payload update needs its own definer function that rewrites `data`, `content_hash` and `question_count` together, or the two fall out of step.
4. **Renaming isn't just `saveFile` — handled, see `Storage.renameFile` and `shareSync.renameSharedDeck`.** `saveFile` upserts *by title*, so writing an entry under a new title would add a second deck rather than rename the first. `renameFile` writes history directly (id, `shareToken` and `data` all preserved) and mirrors to the cloud as save-new-title → delete-old-title, for `decks` and `flash_state` alike, since both are title-keyed. Save runs first so an interrupted rename leaves a duplicate the next login's merge can reconcile rather than a hole; the one exception is an account sitting exactly at the 100-deck cap, where the server's insert trigger refuses the new row until the old one is gone, so a refused save falls back to delete-then-save. A rename does **not** touch `data.title`, so a shared copy's content hash — and with it the link's dedupe — survives it. What it does NOT do any more is stop at the local cache: on a set the student published, `shareSync.renameSharedDeck` follows the local write with `rename_share`, and every recipient picks the new name up on their next open. `shared_decks` still has no update *policy* — that definer function is the only write into an existing row, and it can only touch `title`.

## Per-account ceilings

**100 study sets per account**, and 100 shares per account. Set at a level no real student reaches — five classes at four decks a term is years of headroom — because its job is to bound what one account can cost, not to ration. Enforced in three places, and the number is duplicated in each, so all three move together:

| Where | What it guards |
| --- | --- |
| `MAX_DECKS` in `src/lib/Storage.ts` | `saveFile` refuses a new deck past the cap and toasts. The backstop nothing can bypass. |
| `Storage.isAtDeckLimit(title)` callers | Home's import path and `ShareScreen`'s offer, so the limit is explained in place rather than by a silent non-navigation. |
| `enforce_deck_limits` trigger + `create_share` in `supabase/schema.sql` | **The one that binds.** The anon key ships in the bundle, so a TypeScript-only cap is a suggestion. |

Two rules that keep the cap from breaking a full library:

1. **The cap is on adding, never on updating.** Opening a deck re-saves it with a fresh `lastOpened`; if that were refused, an account at the limit could no longer open its own decks. Client-side this is the `else` branch of `saveFile`; server-side it's a `not exists (... where title = new.title)` test, because **an upsert fires a `BEFORE INSERT` trigger even when it resolves to an update** — `TG_OP` alone would get this wrong.
2. **"Already have it" outranks the cap.** `ShareScreen` checks for an existing copy *before* checking the limit, so a full library never refuses someone a deck they already own.

The same trigger carries the only size ceiling on a `decks` row (2MB, matching `create_share`). Before it, `create_share` guarded the shared snapshot but nothing guarded what a client could upsert into its own library.

**Worst-case storage per account is the two numbers multiplied:** 100 decks × 2MB ≈ 200MB. Real decks run 20–80KB, so real accounts land near 5MB — but if the 2MB ceiling ever needs to justify itself against a free-tier database, lowering it to ~512KB is still ~5× the largest plausible deck.

## Not built

Revoking a link (shares are permanent once created), listing your own shares, per-share expiry, any rate limit on how *fast* shares can be created (only how many), and any notion of the sharer seeing who added their deck. `shared_decks` rows are never deleted by the app, so an owner deleting their own deck leaves recipients' copies working — deliberate.
