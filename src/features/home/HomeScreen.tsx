// Home — landing screen and entry point for every session.
// Designed to be understood at a glance by a non-technical first-time user:
// the tagline teaches the recipe, the get-started card is the hero when no
// decks exist, and paste-to-import removes the save-as-.json hurdle entirely.

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Deck, HistoryEntry } from '../../types';
import { Storage, MAX_DECKS } from '../../lib/Storage';
import { validateDeck } from '../../lib/DeckValidation';
import { showError } from '../../lib/toast';
import { QUIZ_PROMPT_MD, FLASHCARD_PROMPT_MD } from '../../lib/formatSpec';
import { copyWithFeedback } from '../../lib/clipboard';
import { stripCodeFences } from '../../lib/deckText';
import { normalize, tally, type MasteryTally } from '../flashcard/schedule';
import { RotatingWord } from './RotatingWord';
import { AuthButton } from '../auth/AuthButton';
import { Starfield } from '../../components/Starfield/Starfield';
import { ConfirmModal } from '../../components/ConfirmModal';
import { ShareModal } from '../share/ShareModal';

// R17: word lists live here — adding an AI or a mode is a one-line edit.
// Two links of a chain: the "copy a link" idea, drawn rather than spelled out,
// so the card's corner stays two small glyphs instead of a word and an ×.
function LinkIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M10 13.5a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1.2 1.2M14 10.5a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l1.2-1.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

const AI_NAMES = ['ChatGPT', 'Claude', 'Gemini', 'Grok', 'Copilot', 'Perplexity'];
const OUTPUTS = ['flashcards', 'quizzes', 'tests'];

function today(): string {
  return new Date().toLocaleDateString();
}

// A flashcard deck's mastery standing, counted against the deck's OWN card ids
// rather than trusting the stored record count: a re-imported deck can leave
// behind records for questions it no longer contains, and "12 / 8 mastered" is
// worse than no badge at all.
function masteryFor(file: HistoryEntry): MasteryTally {
  const state = normalize(Storage.getFlashState(file.id ?? ''));
  return tally(
    file.data.questions.map((q) => q.id),
    state.cards ?? {},
  );
}

// Flashcard decks show mastery IN PLACE OF the question count — progress is
// what a returning student is looking for, and the count survives as its
// denominator. A live snapshot re-read from Storage on every render rather than
// persisted as its own value, so it can't drift from the records the flashcard
// engine actually owns; never-opened decks read "0 / N mastered" via
// getFlashState's empty default.
//
// Cards part-way up a streak are called out beside the mastered count: they're
// the closest thing this mode has to unfinished business, and a deck with eight
// cards half-learned is a more useful thing to open than one that's never been
// touched.
function FlashMeta({ file }: { file: HistoryEntry }) {
  const m = masteryFor(file);
  return (
    <>
      <span className="meta-flash">
        {m.mastered} / {m.total} mastered
      </span>
      {m.inProgress > 0 && <> · {m.inProgress} started</>} · {file.lastOpened}
    </>
  );
}

// R12: label says "Copy Prompt" but the payload is a full composed prompt
// (deck-type intro + matching schema contract). Clicking opens a full-screen
// Quiz/Flashcards choice modal (matching LoginModal's overlay pattern) instead
// of copying immediately.
function CopyPromptButton({ className = 'btn' }: { className?: string }) {
  const [label, setLabel] = useState('Copy Prompt');
  const [modalOpen, setModalOpen] = useState(false);

  function pick(text: string) {
    setModalOpen(false);
    copyWithFeedback(text, setLabel, 'Copy Prompt');
  }

  return (
    <>
      <button className={className} onClick={() => setModalOpen(true)}>
        {label}
      </button>
      {modalOpen && <CopyPromptModal onPick={pick} onClose={() => setModalOpen(false)} />}
    </>
  );
}

function CopyPromptModal({
  onPick,
  onClose,
}: {
  onPick: (text: string) => void;
  onClose: () => void;
}) {
  // Portaled to document.body so the viewport-covering overlay can't get
  // trapped inside GetStartedCard's box regardless of what ancestor styling
  // that card picks up later (LoginModal renders inline instead, since
  // nothing in its own ancestor chain creates a containing block today).
  return createPortal(
    <div
      className="copy-prompt-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="copy-prompt-modal-card glass-card">
        <button className="modal-close" onClick={onClose} aria-label="Close">
          &times;
        </button>
        <h3>Copy a prompt</h3>
        <p className="copy-prompt-modal-desc">What kind of study set do you want?</p>
        <div className="copy-prompt-modal-grid">
          <button className="copy-prompt-modal-option" onClick={() => onPick(QUIZ_PROMPT_MD)}>
            <div className="copy-prompt-modal-option-title">Quiz</div>
            <div className="copy-prompt-modal-option-desc">
              Multiple choice and more, with practice and test modes.
            </div>
          </button>
          <button className="copy-prompt-modal-option" onClick={() => onPick(FLASHCARD_PROMPT_MD)}>
            <div className="copy-prompt-modal-option-title">Flashcards</div>
            <div className="copy-prompt-modal-option-desc">
              Flip cards sorted into "Know It" and "Still Learning" piles.
            </div>
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// R12: three plain-English steps, one primary button. No "format spec"/"JSON"
// in the user-facing text.
function GetStartedCard() {
  return (
    <div id="get-started-card" className="glass-card">
      <h3>Make a study set with any AI</h3>
      <div className="get-started-steps">
        <div className="get-started-step">
          <span className="step-num">1</span>
          <span className="step-text">Copy the prompt</span>
          <CopyPromptButton />
        </div>
        {/* R12: step 2 is a pure handoff — the pasted prompt asks for notes
            itself, so don't tell the student to attach anything here. */}
        <div className="get-started-step">
          <span className="step-num">2</span>
          <span className="step-text">
            Paste it into ChatGPT — or any AI — and it'll take it from there
          </span>
        </div>
        <div className="get-started-step">
          <span className="step-num">3</span>
          <span className="step-text">Paste the finished study set back here</span>
        </div>
      </div>
    </div>
  );
}

export function HomeScreen({ onOpenDeck }: { onOpenDeck: (entry: HistoryEntry) => void }) {
  const [history, setHistory] = useState<HistoryEntry[]>(() => Storage.getHistory());
  const [dragOver, setDragOver] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [sharing, setSharing] = useState<HistoryEntry | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pasteBoxRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (pasteOpen) pasteBoxRef.current?.focus();
  }, [pasteOpen]);

  // Re-read history after a login-time hydration/migration bulk-overwrites
  // the local cache — without this, the write succeeds but
  // an already-mounted Home screen never learns to show it.
  useEffect(() => {
    return Storage.subscribe(refresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function refresh() {
    setHistory(Storage.getHistory());
  }

  // R21: the ONE load path — file reads and pastes both funnel through here.
  // R8/R9/R10: parse → validate → save → open, with actionable toasts.
  // R20: `parseHint` is appended to PARSE failures only (never validation
  // errors) — the paste path uses it for the copied-mid-generation tip.
  function loadDeckFromText(text: string, sourceName?: string, parseHint?: string): boolean {
    let raw: Deck;
    try {
      raw = JSON.parse(text) as Deck;
    } catch (err) {
      const hint = parseHint ? '\n\n' + parseHint : '';
      showError('Invalid JSON: ' + (err as Error).message + hint);
      return false;
    }
    const errors = validateDeck(raw as unknown as Record<string, unknown>);
    if (errors.length > 0) {
      showError(errors.join('\n'));
      return false;
    }
    // Asked before building the entry so the limit is explained in one clear
    // message and nothing navigates to a deck that was never saved. saveFile
    // refuses on its own too — this is the readable half, not the enforcing one.
    if (Storage.isAtDeckLimit(raw.title)) {
      showError(
        `You've reached the limit of ${MAX_DECKS} study sets. Remove one from your library to add another.`,
      );
      return false;
    }
    const entry: HistoryEntry = {
      name: sourceName ?? `${raw.title}.json`,
      title: raw.title,
      count: raw.questions.length,
      lastOpened: today(),
      data: raw,
    };
    Storage.saveFile(entry);
    refresh();
    onOpenDeck(entry);
    return true;
  }

  function readFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => loadDeckFromText(e.target?.result as string, file.name);
    reader.readAsText(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    // R6: reject non-.json without attempting to parse.
    if (!file.name.toLowerCase().endsWith('.json')) {
      showError('Please drop a .json file.');
      return;
    }
    readFile(file);
  }

  function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) readFile(file);
    // R7: reset so re-selecting the same file fires change again.
    e.target.value = '';
  }

  // R18–R20: paste flow — strip AI code fences, then the SAME load path as
  // files. Even empty-after-stripping input goes through it so the user gets
  // an "Invalid JSON" toast instead of a silent no-op.
  function handlePasteAdd() {
    const text = stripCodeFences(pasteText);
    const tip =
      'Tip: make sure the AI finished generating before you copy — copying mid-reply cuts the set off partway.';
    if (loadDeckFromText(text, undefined, tip)) {
      setPasteText('');
      setPasteOpen(false);
    }
  }

  function openCard(file: HistoryEntry) {
    // R4: bump lastOpened, re-save, then open.
    const updated: HistoryEntry = { ...file, lastOpened: today() };
    Storage.saveFile(updated);
    refresh();
    onOpenDeck(updated);
  }

  // R3: the delete control asks first, via the in-app ConfirmModal rather than
  // a browser confirm() popup. Holding the pending title (not a boolean) keeps
  // one modal serving every card.
  function deleteCard(e: React.MouseEvent, title: string) {
    e.stopPropagation(); // R3: don't also trigger the card's open action.
    setPendingDelete(title);
  }

  function shareCard(e: React.MouseEvent, file: HistoryEntry) {
    e.stopPropagation(); // don't also open the deck.
    setSharing(file);
  }

  function confirmDelete() {
    if (pendingDelete === null) return;
    Storage.deleteFile(pendingDelete);
    setPendingDelete(null);
    refresh();
  }

  const isEmpty = history.length === 0;

  const addDeckSurface = (
    <div
      id="drop-zone"
      className={'glass-card' + (dragOver ? ' drag-over' : '')}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {!pasteOpen ? (
        <>
          <p>Add a study set — paste your AI's reply, or drop a file here</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={handlePick}
          />
          <div className="add-deck-actions">
            <button className="btn" onClick={() => setPasteOpen(true)}>
              Paste study set
            </button>
            <button className="btn-ghost" onClick={() => fileInputRef.current?.click()}>
              Load file
            </button>
          </div>
        </>
      ) : (
        <div className="paste-box">
          <textarea
            ref={pasteBoxRef}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="Paste your AI's reply here…"
            rows={6}
          />
          <div className="add-deck-actions">
            <button className="btn" onClick={handlePasteAdd} disabled={!pasteText.trim()}>
              Add Study Set
            </button>
            {/* R18: Clear empties the box but keeps it open; Cancel discards AND closes. */}
            <button
              className="btn-ghost"
              onClick={() => setPasteText('')}
              disabled={!pasteText.trim()}
            >
              Clear
            </button>
            <button
              className="btn-ghost"
              onClick={() => {
                setPasteText('');
                setPasteOpen(false);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <section className="screen">
      {/* One header for both branches (R11/R22): title + tagline on the left,
          and — only once at least one deck exists — the prominent "Need a new
          set?" corner on the right. Empty state keeps the corner out so the
          GetStartedCard hero stays the single first-run path. */}
      <div className="home-hero">
        <Starfield />
        <div id="home-header">
          <div className="home-header-left">
            <div className="home-title-row">
              <h1 className="home-title">StudyDeck</h1>
            </div>
            {/* R14/R15: two rotating slots, staggered so they can never flip together.
                gcd(3600, 2400) = 1200; the 600ms offset keeps every pair of flips
                ≥600ms apart forever — more than the 250ms roll, so no overlap.

                The sentence is split into three fixed parts rather than left to
                wrap on its own: "Perplexity" is twice the width of "Grok", so
                free wrapping re-flowed the whole tagline every few seconds and
                words hopped between lines under the reader. Each part is a
                nowrap unit and the line breaks are struck in CSS (part 3 always,
                part 2 as well on narrow screens), so a longer word can only
                lengthen its OWN line — nothing moves up or down. */}
            <p className="subtitle tagline">
              <span className="tagline-part">
                Use <RotatingWord words={AI_NAMES} intervalMs={3600} initialDelayMs={600} /> to
                turn
              </span>{' '}
              <span className="tagline-part tagline-part-wrap-sm">your notes</span>{' '}
              <span className="tagline-part tagline-part-wrap">
                into interactive <RotatingWord words={OUTPUTS} intervalMs={2400} />.
              </span>
            </p>
          </div>
          {/* AuthButton is always visible, independent of
              isEmpty — it does NOT reuse the Copy Prompt corner's gate. It's
              placed AFTER new-set-corner so it's always the rightmost element —
              pinned in the same spot whether or not a "Need a new set?" corner
              is showing, instead of shifting position with isEmpty. */}
          <div className="home-header-right">
            {!isEmpty && (
              <div id="new-set-corner">
                <span>Need a new set?</span>
                <CopyPromptButton />
              </div>
            )}
            <AuthButton />
          </div>
        </div>
      </div>

      {isEmpty ? (
        // R11: the get-started card IS the empty state, rendered as the hero.
        <>
          <GetStartedCard />
          {addDeckSurface}
        </>
      ) : (
        // R22: returning users see their decks first, then the add-deck surface.
        <>
          {/* The library is a ruled catalog, not a card grid. A deck title is
              prose of unpredictable length; three-across tiles truncate it and
              stack identical bordered boxes, which is exactly the shape the
              redesign was called to get rid of. Full-width rules let the title
              run at reading size and give the plate number a column of its
              own. Every handler here is unchanged — only the markup moved. */}
          <div className="catalog-head">
            <span className="plate-label">Your study sets</span>
            <span className="catalog-rule" aria-hidden="true" />
            <span className="plate-label catalog-count">
              {String(history.length).padStart(2, '0')}
            </span>
          </div>
          <ol id="file-history-list">
            {history.map((file, i) => (
              <li
                key={file.title}
                className="file-row"
                onClick={() => openCard(file)}
              >
                {/* Plate number — the row's position in the catalog, not an id
                    that means anything. It exists so the eye has a fixed left
                    edge to run down, the way a chart index does. */}
                <span className="file-row-cat" aria-hidden="true">
                  {String(i + 1).padStart(3, '0')}
                </span>
                <div className="file-row-body">
                  <h3 className="file-row-title">{file.title}</h3>
                  {/* Flashcard decks show the Know It tally IN PLACE OF the
                      question count — progress is what a returning student is
                      looking for, and the count survives as its denominator.
                      The tally is a live snapshot re-read from Storage on every
                      render rather than persisted as its own value, so it can't
                      drift from the piles the flashcard engine actually owns;
                      never-opened decks read "0 / N known" via getFlashState's
                      empty default. */}
                  <div className="meta">
                    {file.data.type === 'flashcard' ? (
                      <FlashMeta file={file} />
                    ) : (
                      <>
                        {file.count} questions · {file.lastOpened}
                      </>
                    )}
                  </div>
                </div>
                <div className="file-card-actions">
                  <button
                    className="share-btn"
                    title="Share this study set"
                    aria-label={`Share ${file.title}`}
                    onClick={(e) => shareCard(e, file)}
                  >
                    <LinkIcon />
                  </button>
                  <button
                    className="delete-btn"
                    title="Remove from history"
                    aria-label={`Remove ${file.title}`}
                    onClick={(e) => deleteCard(e, file.title)}
                  >
                    &times;
                  </button>
                </div>
              </li>
            ))}
          </ol>
          {addDeckSurface}
        </>
      )}

      {sharing && (
        <ShareModal
          file={sharing}
          onClose={() => {
            setSharing(null);
            // The share may have stamped a token onto the deck — re-read so a
            // second Share opens straight onto the existing link.
            refresh();
          }}
        />
      )}

      {pendingDelete !== null && (
        <ConfirmModal
          title="Remove this study set?"
          confirmLabel="Remove"
          danger
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </section>
  );
}
