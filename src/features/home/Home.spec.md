# Intent

Home is the landing screen and the entry point for every study session. It lets a student re-open any previously loaded deck instantly, add new decks by drag-drop or file picker, remove decks they no longer want, and — because StudyDeck ships no built-in AI — copy the format spec to generate a new deck with any external AI.

# Requirements

- R1 [verify: ui] Home renders a grid of file cards, one per entry in `Storage.getHistory()`, each showing the deck `title` and a metadata line `{count} questions · {lastOpened}`.
- R2 [verify: ui] Cards appear newest-first, matching the order Storage returns (Storage prepends new/updated entries). [caution: ordering comes from Storage's saveFile prepend behavior — Home must render history in the array order it receives, not re-sort it.]
- R3 [verify: ui] Each card has a delete control. Clicking it removes that deck via `Storage.deleteFile(title)` and re-renders the grid, WITHOUT navigating away from Home. [caution: the delete click must not also trigger the card's open action — in the legacy app this is `stopPropagation`; in React, stop the event from bubbling to the card's click handler.]
- R4 [verify: ui] Clicking a card (anywhere but the delete control) updates that entry's `lastOpened` to today, re-saves it via `Storage.saveFile`, refreshes the grid, and navigates to Mode Select for that deck.
- R5 [verify: ui] A drop zone accepts a dragged file; on drop, the file is routed into the load flow. Dragging over the zone applies a visible highlight state that clears on drag-leave or drop.
- R6 [verify: ui] The drop handler rejects any file whose name does not end in `.json` (case-insensitive) with the error `Please drop a .json file.` and does not attempt to parse it.
- R7 [verify: ui] A "Load file" button opens a native file picker restricted to `.json`; choosing a file routes it into the same load flow as drop. [caution: after a pick, reset the input value so re-selecting the same file fires the change event again.]
- R8 [verify: ui] The load flow reads the file text, `JSON.parse`s it, and on parse failure shows the error `Invalid JSON: {message}` without adding anything to history.
- R9 [verify: ui] On successful parse, the file is validated via DeckValidation; if any errors are returned, they are shown joined by newlines and the file is NOT saved. Only a clean validation proceeds.
- R10 [verify: ui] On a valid deck, a history entry `{ name, title, count: questions.length, lastOpened: today, data: parsedDeck }` is saved via `Storage.saveFile`, the deck becomes the current file, the grid re-renders, and the app navigates to Mode Select.
- R11 [verify: ui] When history is empty, the grid is hidden and an empty-state message inviting the user to drop a `.json` file is shown instead.
- R12 [verify: ui] A "generate" section explains that any AI can produce a deck and provides a "Copy Format Spec" button that writes the full format-spec markdown to the clipboard, giving brief "Copied!" feedback then reverting. [caution: the copied text must stay in sync with `studydeck-format-spec.md` — it is embedded verbatim so the button works offline without a fetch.]
- R13 [verify: ui] Errors surface through the shared toast (see the app-level error toast), which is dismissible and supports multi-line text.

# Change log

- 2026-07-09: Spec authored for the React + TypeScript migration, backfilled from the home-screen wiring in `legacy/studydeck.html` (`renderFileHistory`, `initDropZone`, `FileLoader`, `initGenerateSection`). Captures the history grid, per-card delete vs open distinction, drag-drop + picker load flow with `.json`/JSON/validation gating, empty state, and the Copy Format Spec action. Authored as the target for the React Home feature.
