// Mode Select — the branch point for QUIZ decks (spec: ModeSelect.spec.md).
// Flashcard decks never reach this screen: App routes them straight to the
// Flashcard screen (a one-option menu is a pointless click), so this renders
// exactly Practice / Test / Review.

import { useState } from 'react';
import type { HistoryEntry, QuizMode, QuizQuestion } from '../../types';
import { naturalOrder, shuffledOrder } from '../../lib/shuffle';

type Mode = QuizMode | 'review';

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

interface ModeSelectProps {
  file: HistoryEntry;
  onBack: () => void;
  onStartQuiz: (mode: QuizMode, order: number[], wasRandom: boolean) => void;
  onStartReview: (order: number[]) => void;
}

export function ModeSelectScreen({ file, onBack, onStartQuiz, onStartReview }: ModeSelectProps) {
  // R4: selection + random reset on every entry (fresh component per mount).
  const [selected, setSelected] = useState<Mode>('practice');
  const [random, setRandom] = useState(false);

  function start() {
    const questions = file.data.questions as QuizQuestion[];
    const order = random ? shuffledOrder(questions.length) : naturalOrder(questions.length);

    if (selected === 'review') onStartReview(order);
    else onStartQuiz(selected, order, random);
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
        {QUIZ_MODES.map((m) => (
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
        {/* R6: always visible — every mode here supports random order. */}
        <label className="toggle-label">
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
