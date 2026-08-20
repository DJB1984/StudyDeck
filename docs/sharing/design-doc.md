# StudyDeck — Sharing: Design Doc

**Status:** shipped 2026-08-19.
**Scope:** copy a link to a study set, send it to someone, and let them add it to their own library — logged in or not.

Read this alongside `docs/auth/design-doc.md` (the Supabase tables and RLS this builds on) and `docs/core/design-doc.md` (the localStorage shape and screen state machine).

---

## The model in one paragraph

A share is a **snapshot of a deck, stored exactly once**, addressed by an unguessable token that lives in the link. Everyone who adds that link gets their **own deck** in their own library — their own mastery progress, their own quiz stats, nothing shared but the questions — and their library row **points at** the one stored snapshot instead of storing the questions again. Fifty recipients cost one payload row.

## Decisions (Davis, 2026-08-19)

| Question | Decision |
| --- | --- |
| Copy or live pointer? | **Own copy, single stored payload.** Recipients study their own deck; the JSON is stored once. |
| How do we know they already have it? | **Stamped share token first, content hash as fallback.** Never title. |
| Sharer's version changed since? | **Not applicable — decks can't be edited yet.** See "Gotchas for when deck editing lands". |
| Can a signed-out user create a link? | **No — creating needs a login.** *Adding* from a link works signed out. |

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

There is **no way to edit or rename a deck in the app today** — that is the only reason the staleness question has no answer here. When editing arrives:

1. **A share-pointer row has no payload of its own.** Editing a deck whose cloud row is `data: null, share_token: '…'` must **fork it**: write the edited JSON into `decks.data` and clear `share_token` (copy-on-write). Editing the `shared_decks` row instead would silently rewrite the questions under every other recipient.
2. **An edit changes the content hash**, so the edited copy stops matching its snapshot. That's correct — it is no longer that deck — but it means the *token* stamp becomes the only thing tying them together. Decide deliberately whether an edited copy keeps the token (dedupe still works, but "add" and "already have it" get fuzzy) or drops it.
3. **The sharer's edit does not reach recipients**, by design (own-copy model). If "a newer version is available" is ever wanted, `shared_decks` needs a version/updated_at column and the offer screen needs an update path — Davis was asked and deferred this on 2026-08-19 because there was nothing to be stale about yet.
4. **Renaming isn't just `saveFile`.** `Storage.saveFile` upserts *by title*, so writing an entry under a new title adds a second deck rather than renaming the first. A real rename has to go through `replaceHistory` (and mirror a delete of the old title to the cloud).

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
