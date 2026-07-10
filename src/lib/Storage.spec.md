# Intent

Storage is the single choke point for every localStorage read and write in StudyDeck. It exists so that no other module ever touches `localStorage` directly, which keeps persistence logic (quota handling, key naming, atomic deletes) in one place and makes a future migration to IndexedDB a one-module change rather than an app-wide rewrite.

# Requirements

- R1 [verify: unit] `get(key)` reads the raw string from localStorage and returns `JSON.parse` of it, or `null` if the key is absent. Any thrown error (missing key, corrupt JSON) is caught and results in `null`, never a throw.
- R2 [verify: unit] `set(key, val)` `JSON.stringify`s `val` and writes it via `localStorage.setItem`, returning `true` on success and `false` on unrecoverable failure. It never throws out to callers.
- R3 [verify: unit] [caution: quota eviction is the reason set() is more than a one-liner — do not "simplify" it back to a bare setItem. On `QuotaExceededError`, if history is non-empty, evict the OLDEST history entry (see R9 for which end that is) via `deleteFile`, surface a user-facing warning toast with the exact text "Storage full — oldest file removed to make room.", then retry the write EXACTLY ONCE. If the retry also throws, return `false`. If history was already empty, return `false` without evicting.]
- R4 [verify: unit] `getHistory()` returns the parsed `studydeck_history` array, or an empty array `[]` when the key is absent or unreadable — never `null`.
- R5 [verify: unit] `saveFile(entry)` upserts by `title`: if an existing history entry has the same `title`, it is replaced in place (position preserved); otherwise the new entry is prepended so it becomes the newest. It persists via `set('studydeck_history', ...)`.
- R6 [verify: unit] [caution: this delete MUST be atomic across BOTH keys — removing only the history entry leaves an orphaned flash-pile key that accumulates forever. Do not split these into two separately-callable operations.] `deleteFile(title)` removes the matching history entry (filtered by `title`) AND removes the `studydeck_flash_{title}` key in the same call. The flash-key removal is wrapped so a failure there cannot throw.
- R7 [verify: unit] `getFlashState(title)` returns the parsed `studydeck_flash_{title}` object, or the default `{ known: [], learning: [] }` when absent.
- R8 [verify: unit] `setFlashState(title, state)` persists `state` under `studydeck_flash_{title}` via `set` (and therefore inherits R3 quota handling).
- R9 [verify: unit] [caution: "oldest" = the LAST element of the history array, because saveFile prepends new entries (newest-first ordering). Evicting `history[0]` would delete the most recent file — the exact opposite of intended behavior.] Quota eviction in R3 removes `history[history.length - 1]`.
- R10 [verify: unit] The only localStorage keys Storage reads or writes are `studydeck_history` and `studydeck_flash_{title}`. Flash piles are stored as arrays of question `id` strings, never array indices, so pile state survives question reordering.
- R11 [verify: manual] No module other than Storage accesses `localStorage`, `window.localStorage`, or an equivalent web-storage API directly. All persistence flows through Storage's public methods. [caution: this is the whole reason the module exists — a stray `localStorage.setItem` elsewhere defeats the IndexedDB-migration abstraction and bypasses quota handling.]
- R12 [verify: manual] Storage surfaces the quota warning by calling the app's shared toast/notification mechanism, not by throwing or by console-only logging, so the user actually sees why a file disappeared.

# Change log

- 2026-07-09: Spec authored for the React + TypeScript migration, backfilled from the legacy single-file `Storage` module in `legacy/studydeck.html`. Captures the get/set/getHistory/saveFile/deleteFile/getFlashState/setFlashState surface, atomic two-key delete, quota-eviction-with-retry, newest-first ordering, and the id-keyed flash-pile invariant. Authored as the target the React `Storage` lib is built against.
