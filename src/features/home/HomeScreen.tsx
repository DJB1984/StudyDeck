// Home — landing screen and entry point for every session (spec: Home.spec.md).
// Lists previously loaded decks, adds new ones via drag-drop/picker, deletes,
// and offers a "Copy Format Spec" button since StudyDeck ships no built-in AI.

import { useRef, useState } from 'react';
import type { Deck, HistoryEntry } from '../../types';
import { Storage } from '../../lib/Storage';
import { validateDeck } from '../../lib/DeckValidation';
import { showError } from '../../lib/toast';
import { FORMAT_SPEC_MD } from '../../lib/formatSpec';
import { copyWithFeedback } from '../../lib/clipboard';

function today(): string {
  return new Date().toLocaleDateString();
}

export function HomeScreen({ onOpenDeck }: { onOpenDeck: (entry: HistoryEntry) => void }) {
  const [history, setHistory] = useState<HistoryEntry[]>(() => Storage.getHistory());
  const [dragOver, setDragOver] = useState(false);
  const [copyLabel, setCopyLabel] = useState('Copy Format Spec');
  const fileInputRef = useRef<HTMLInputElement>(null);

  function refresh() {
    setHistory(Storage.getHistory());
  }

  // R8/R9/R10: read → parse → validate → save → open.
  function readFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      let raw: Deck;
      try {
        raw = JSON.parse(e.target?.result as string) as Deck;
      } catch (err) {
        showError('Invalid JSON: ' + (err as Error).message);
        return;
      }
      const errors = validateDeck(raw as unknown as Record<string, unknown>);
      if (errors.length > 0) {
        showError(errors.join('\n'));
        return;
      }
      const entry: HistoryEntry = {
        name: file.name,
        title: raw.title,
        count: raw.questions.length,
        lastOpened: today(),
        data: raw,
      };
      Storage.saveFile(entry);
      refresh();
      onOpenDeck(entry);
    };
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

  function openCard(file: HistoryEntry) {
    // R4: bump lastOpened, re-save (re-sorts newest-first), then open.
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

  return (
    <section className="screen">
      <h1>StudyDeck</h1>
      <p className="subtitle">Load a study set and start practicing.</p>

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
        <p>
          Drag and drop a <code>.json</code> file here
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          style={{ display: 'none' }}
          onChange={handlePick}
        />
        <button className="btn" onClick={() => fileInputRef.current?.click()}>
          Load file
        </button>
      </div>

      {history.length > 0 ? (
        <div id="file-history-grid">
          {history.map((file) => (
            <div key={file.title} className="file-card glass-card" onClick={() => openCard(file)}>
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
      ) : (
        <div id="empty-state">
          <p>
            No study sets loaded yet. Drop a <code>.json</code> file above to get started.
          </p>
        </div>
      )}

      <div id="generate-section" className="glass-card">
        <h3>Don't have a study set yet?</h3>
        <p>
          StudyDeck has no built-in AI — any AI can generate one for you. Copy the format spec,
          paste it into ChatGPT, Claude, Gemini, or whatever you've got, along with your notes, and
          ask it to generate a quiz or a flashcard set.
        </p>
        <ol>
          <li>
            Click <strong>Copy Format Spec</strong> below
          </li>
          <li>
            Paste it into your AI chat, along with your notes/slides and whether you want a{' '}
            <strong>quiz</strong> or <strong>flashcards</strong>
          </li>
          <li>
            Save the AI's JSON output as a <code>.json</code> file
          </li>
          <li>Drag that file into the drop zone above</li>
        </ol>
        <button
          className="btn"
          onClick={() =>
            copyWithFeedback(FORMAT_SPEC_MD, setCopyLabel, 'Copy Format Spec')
          }
        >
          {copyLabel}
        </button>
      </div>
    </section>
  );
}
