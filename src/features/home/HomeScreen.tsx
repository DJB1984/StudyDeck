// Home — landing screen and entry point for every session (spec: Home.spec.md).
// Designed to be understood at a glance by a non-technical first-time user:
// the tagline teaches the recipe, the get-started card is the hero when no
// decks exist, and paste-to-import removes the save-as-.json hurdle entirely.

import { useEffect, useRef, useState } from 'react';
import type { Deck, HistoryEntry } from '../../types';
import { Storage } from '../../lib/Storage';
import { validateDeck } from '../../lib/DeckValidation';
import { showError } from '../../lib/toast';
import { FORMAT_SPEC_MD } from '../../lib/formatSpec';
import { copyWithFeedback } from '../../lib/clipboard';
import { stripCodeFences } from '../../lib/deckText';
import { RotatingWord } from './RotatingWord';

// R17: word lists live here — adding an AI or a mode is a one-line edit.
const AI_NAMES = ['ChatGPT', 'Claude', 'Gemini', 'Grok'];
const OUTPUTS = ['flashcards', 'quizzes', 'tests'];

function today(): string {
  return new Date().toLocaleDateString();
}

// R12: label says "Copy Prompt" but the payload is still the full format spec.
function CopyPromptButton({ className = 'btn' }: { className?: string }) {
  const [label, setLabel] = useState('Copy Prompt');
  return (
    <button
      className={className}
      onClick={() => copyWithFeedback(FORMAT_SPEC_MD, setLabel, 'Copy Prompt')}
    >
      {label}
    </button>
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
        <div className="get-started-step">
          <span className="step-num">2</span>
          <span className="step-text">
            Paste it into ChatGPT — or any AI — along with your notes
          </span>
        </div>
        <div className="get-started-step">
          <span className="step-num">3</span>
          <span className="step-text">Paste the AI's reply back here</span>
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pasteBoxRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (pasteOpen) pasteBoxRef.current?.focus();
  }, [pasteOpen]);

  function refresh() {
    setHistory(Storage.getHistory());
  }

  // R21: the ONE load path — file reads and pastes both funnel through here.
  // R8/R9/R10: parse → validate → save → open, with actionable toasts.
  function loadDeckFromText(text: string, sourceName?: string): boolean {
    let raw: Deck;
    try {
      raw = JSON.parse(text) as Deck;
    } catch (err) {
      showError('Invalid JSON: ' + (err as Error).message);
      return false;
    }
    const errors = validateDeck(raw as unknown as Record<string, unknown>);
    if (errors.length > 0) {
      showError(errors.join('\n'));
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
    if (loadDeckFromText(text)) {
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

  function deleteCard(e: React.MouseEvent, title: string) {
    e.stopPropagation(); // R3: don't also trigger the card's open action.
    Storage.deleteFile(title);
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
      <h1>StudyDeck</h1>
      {/* R14/R15: two rotating slots, staggered so they can never flip together.
          gcd(3600, 2400) = 1200; the 600ms offset keeps every pair of flips
          ≥600ms apart forever — more than the 250ms roll, so no overlap. */}
      <p className="subtitle tagline">
        Use <RotatingWord words={AI_NAMES} intervalMs={3600} initialDelayMs={600} /> to turn your
        notes into <RotatingWord words={OUTPUTS} intervalMs={2400} />.
      </p>

      {isEmpty ? (
        // R11: the get-started card IS the empty state, rendered as the hero.
        <>
          <GetStartedCard />
          {addDeckSurface}
        </>
      ) : (
        // R22: returning users see their decks first; helper shrinks to one row.
        <>
          <div id="file-history-grid">
            {history.map((file) => (
              <div
                key={file.title}
                className="file-card glass-card"
                onClick={() => openCard(file)}
              >
                <button
                  className="delete-btn"
                  title="Remove from history"
                  onClick={(e) => deleteCard(e, file.title)}
                >
                  &times;
                </button>
                <h3>{file.title}</h3>
                <div className="meta">
                  {file.count} questions · {file.lastOpened}
                </div>
              </div>
            ))}
          </div>
          {addDeckSurface}
          <div id="new-set-row">
            <span>Need a new set?</span>
            <CopyPromptButton className="btn-ghost" />
          </div>
        </>
      )}
    </section>
  );
}
