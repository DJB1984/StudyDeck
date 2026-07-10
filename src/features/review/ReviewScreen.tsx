// Review — read-only browser through a quiz deck with the correct answer shown
// (spec: src/features/review/Review.spec.md). Reachable from Mode Select and from
// Stats; the caller owns the "back to origin" navigation.

import { useEffect, useState } from 'react';
import type { QuizQuestion } from '../../types';
import { Katex } from '../../components/Math/Katex';
import { Graph } from '../../components/Graph/Graph';

const LETTERS = ['A', 'B', 'C', 'D'];

interface ReviewScreenProps {
  questions: QuizQuestion[];
  order: number[];
  onBack: () => void;
}

export function ReviewScreen({ questions, order, onBack }: ReviewScreenProps) {
  const [idx, setIdx] = useState(0);
  const total = order.length;
  const current = idx + 1;
  const q = questions[order[idx]];

  const atStart = current === 1;
  const atEnd = current === total;

  // R4: clamp at both ends (no wrap).
  const prev = () => setIdx((i) => Math.max(0, i - 1));
  const nextQ = () => setIdx((i) => Math.min(total - 1, i + 1));

  // R5: keyboard ←/→, respecting the disabled ends.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft' && !atStart) prev();
      else if (e.key === 'ArrowRight' && !atEnd) nextQ();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [atStart, atEnd]);

  return (
    <section id="review-screen" className="screen">
      <div className="screen-header">
        <button className="btn-ghost" onClick={onBack}>
          ← Back
        </button>
        <h2>Review</h2>
        <span className="review-progress-text">
          {current} of {total}
        </span>
      </div>

      {q.graph && <Graph key={q.id} graph={q.graph} />}

      <div id="review-question-text">
        <Katex key={q.id + '-q'} text={q.question} />
      </div>

      <div id="review-answer-list">
        {q.answers.map((ans, i) => (
          <button
            key={i}
            className={'answer-btn' + (i === q.correct ? ' correct-answer' : '')}
            disabled
          >
            <span className="answer-label">{LETTERS[i]}</span>
            <Katex className="answer-text" text={ans} />
          </button>
        ))}
      </div>

      <div className="review-nav">
        <button className="btn-ghost" onClick={prev} disabled={atStart}>
          ← Prev
        </button>
        <button className="btn-ghost" onClick={nextQ} disabled={atEnd}>
          Next →
        </button>
      </div>
    </section>
  );
}
