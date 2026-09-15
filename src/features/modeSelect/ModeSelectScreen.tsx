// Mode Select — the branch point for QUIZ decks.
// Flashcard decks never reach this screen: App routes them straight to the
// Flashcard screen (a one-option menu is a pointless click), so this renders
// exactly Practice / Test / Review.

import { useState } from 'react';
import type { HistoryEntry, QuizMode, QuizQuestion } from '../../types';
import { naturalOrder, shuffleArray } from '../../lib/shuffle';
import { Storage } from '../../lib/Storage';

type Mode = QuizMode | 'review';

// Line-icon set replacing the old full-color emoji (DESIGN.md's Signal Rule
// keeps color reserved for the accent/mark — mode icons draw in currentColor
// so they inherit the muted/selected states .mode-icon already defines).
const ICON_PROPS = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

function PencilIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M4 20l1-5L15.5 4.5l3.5 3.5L9 18.5 4 20z" />
      <path d="M14 6.5l3.5 3.5" />
    </svg>
  );
}

function StopwatchIcon() {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="13.5" r="7.5" />
      <path d="M9 2.5h6" />
      <path d="M12 5.5v2.5" />
      <path d="M12 13.5l3-3" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M3 5l9 2 9-2v14l-9 2-9-2V5z" />
      <path d="M12 7v14" />
    </svg>
  );
}

interface ModeDef {
  mode: Mode;
  icon: () => React.JSX.Element;
  name: string;
  desc: string;
}

const QUIZ_MODES: ModeDef[] = [
  {
    mode: 'practice',
    icon: PencilIcon,
    name: 'Practice',
    desc: 'Immediate right/wrong feedback. Retry wrong answers without affecting your score.',
  },
  {
    mode: 'test',
    icon: StopwatchIcon,
    name: 'Test',
    desc: 'No feedback until the end. See your score and review what you missed.',
  },
  {
    mode: 'review',
    icon: BookIcon,
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
  // The order preference does NOT reset — it belongs to the deck, not the
  // visit, so it comes back off the last answer given for this set.
  const [randomOrder, setRandomOrder] = useState(() => Storage.getQuizOrderRandom(file.id!));

  // Review browses the deck as it was written; shuffling a read-through would
  // only make the same pass harder to find your place in. So the switch is
  // Practice/Test's, and slides away with them.
  const orderApplies = selected !== 'review';

  function toggleRandomOrder(on: boolean) {
    setRandomOrder(on);
    Storage.setQuizOrderRandom(file.id!, on);
  }

  function start() {
    const questions = file.data.questions as QuizQuestion[];
    const natural = naturalOrder(questions.length);
    const order = orderApplies && randomOrder ? shuffleArray(natural) : natural;

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
            <div className="mode-icon">
              <m.icon />
            </div>
            <div className="mode-name">{m.name}</div>
            <div className="mode-desc">{m.desc}</div>
          </div>
        ))}
      </div>

      <div className="mode-start-row">
        <button id="mode-start-btn" className="btn" onClick={start}>
          Start
        </button>
        {/* Always mounted so it can animate in and out; `hidden` on the input
            (not display:none on the label) is what takes it out of the tab
            order and the accessibility tree while it's away, leaving CSS free
            to slide the visual. */}
        <label
          className={'toggle-label mode-order-toggle' + (orderApplies ? ' shown' : '')}
          aria-hidden={!orderApplies}
        >
          <input
            type="checkbox"
            checked={randomOrder}
            hidden={!orderApplies}
            onChange={(e) => toggleRandomOrder(e.target.checked)}
          />
          <span className="toggle-track"></span>
          <span className="mode-order-name">Random order</span>
        </label>
      </div>
    </section>
  );
}
