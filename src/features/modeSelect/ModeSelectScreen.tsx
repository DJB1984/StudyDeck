// Mode Select — the branch point for QUIZ decks (spec: ModeSelect.spec.md).
// Flashcard decks never reach this screen: App routes them straight to the
// Flashcard screen (a one-option menu is a pointless click), so this renders
// exactly Practice / Test / Review.

import { useState } from 'react';
import type { HistoryEntry, QuizMode, QuizQuestion } from '../../types';
import { naturalOrder } from '../../lib/shuffle';

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
  onStartQuiz: (mode: QuizMode, order: number[]) => void;
  onStartReview: (order: number[]) => void;
}

export function ModeSelectScreen({ file, onBack, onStartQuiz, onStartReview }: ModeSelectProps) {
  // R4: selection resets on every entry (fresh component per mount).
  const [selected, setSelected] = useState<Mode>('practice');

  function start() {
    const questions = file.data.questions as QuizQuestion[];
    const order = naturalOrder(questions.length);

    if (selected === 'review') onStartReview(order);
    else onStartQuiz(selected, order);
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

      <button id="mode-start-btn" className="btn" onClick={start}>
        Start
      </button>
    </section>
  );
}
