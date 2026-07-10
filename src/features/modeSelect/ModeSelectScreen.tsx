// Mode Select — the branch point after a deck is chosen (spec: ModeSelect.spec.md).
// Shows only the modes the deck's `type` supports, offers random order for quiz
// modes, and launches the chosen mode.

import { useState } from 'react';
import type { HistoryEntry, QuizMode, QuizQuestion } from '../../types';
import { naturalOrder, shuffledOrder } from '../../lib/shuffle';

type Mode = QuizMode | 'review' | 'flashcard';

interface ModeDef {
  mode: Mode;
  icon: string;
  name: string;
  desc: string;
}

const QUIZ_MODES: ModeDef[] = [
  {
    mode: 'practice',
    icon: '📝',
    name: 'Practice',
    desc: 'Immediate right/wrong feedback. Retry wrong answers without affecting your score.',
  },
  {
    mode: 'test',
    icon: '🧪',
    name: 'Test',
    desc: 'No feedback until the end. See your score and review what you missed.',
  },
  {
    mode: 'review',
    icon: '📖',
    name: 'Review',
    desc: 'Browse every question with the correct answer shown. No scoring, no quiz.',
  },
];

const FLASHCARD_MODE: ModeDef = {
  mode: 'flashcard',
  icon: '🃏',
  name: 'Flashcard',
  desc: 'Flip cards, sort into Know It and Still Learning piles. Progress is saved.',
};

interface ModeSelectProps {
  file: HistoryEntry;
  onBack: () => void;
  onStartQuiz: (mode: QuizMode, order: number[], wasRandom: boolean) => void;
  onStartReview: (order: number[]) => void;
  onStartFlashcard: (randomOrder: boolean) => void;
}

export function ModeSelectScreen({
  file,
  onBack,
  onStartQuiz,
  onStartReview,
  onStartFlashcard,
}: ModeSelectProps) {
  // R2: availability is driven by deck type, not by inspecting questions.
  const deckType = file.data.type === 'flashcard' ? 'flashcard' : 'quiz';
  const modes = deckType === 'flashcard' ? [FLASHCARD_MODE] : QUIZ_MODES;

  // R4: selection + random reset on every entry (fresh component per mount).
  const [selected, setSelected] = useState<Mode>(deckType === 'flashcard' ? 'flashcard' : 'practice');
  const [random, setRandom] = useState(false);

  function start() {
    const questions = file.data.questions as QuizQuestion[];
    const order = random ? shuffledOrder(questions.length) : naturalOrder(questions.length);

    if (selected === 'flashcard') {
      onStartFlashcard(random);
    } else if (selected === 'review') {
      onStartReview(order);
    } else {
      onStartQuiz(selected, order, random);
    }
  }

  return (
    <section id="mode-screen" className="screen">
      <div className="screen-header">
        <button className="btn-ghost" onClick={onBack}>
          ← Back
        </button>
        <h2>{file.title}</h2>
      </div>
      <p className="deck-subtitle">{file.count} questions</p>

      <div className="mode-grid">
        {modes.map((m) => (
          <div
            key={m.mode}
            className={'mode-card' + (selected === m.mode ? ' selected' : '')}
            onClick={() => setSelected(m.mode)}
          >
            <div className="mode-icon">{m.icon}</div>
            <div className="mode-name">{m.name}</div>
            <div className="mode-desc">{m.desc}</div>
          </div>
        ))}
      </div>

      <div className="mode-options">
        {/* R6: hidden (not removed) for flashcard, which has its own random toggle. */}
        <label
          className="toggle-label"
          style={{ visibility: selected === 'flashcard' ? 'hidden' : 'visible' }}
        >
          <input type="checkbox" checked={random} onChange={(e) => setRandom(e.target.checked)} />
          <span className="toggle-track"></span>
          Random order
        </label>
      </div>

      <button id="mode-start-btn" className="btn" onClick={start}>
        Start
      </button>
    </section>
  );
}
