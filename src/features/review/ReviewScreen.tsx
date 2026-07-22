// Review — read-only browser through a quiz deck with the correct answer shown
// (spec: src/features/review/Review.spec.md). Reachable from Mode Select and from
// Stats; the caller owns the "back to origin" navigation.

import { useEffect, useState } from 'react';
import type { QuizQuestion } from '../../types';
import { ProgressHeader, QuestionBody, AnswerList } from '../../components/QuizUI';
import { buildPrompt, copyWithFeedback } from '../../lib/clipboard';

interface ReviewScreenProps {
  questions: QuizQuestion[];
  order: number[];
  onBack: () => void;
}

export function ReviewScreen({ questions, order, onBack }: ReviewScreenProps) {
  const [idx, setIdx] = useState(0);
  const [copyLabel, setCopyLabel] = useState('Copy explanation prompt');
  const total = order.length;
  const current = idx + 1;
  const q = questions[order[idx]];

  const atStart = current === 1;
  const atEnd = current === total;

  // R4: clamp at both ends (no wrap).
  const prev = () => setIdx((i) => Math.max(0, i - 1));
  const nextQ = () => setIdx((i) => Math.min(total - 1, i + 1));

  useEffect(() => {
    setCopyLabel('Copy explanation prompt');
  }, [idx]);

  // Review has no "chosen" answer (it's read-only), so the prompt just asks
  // to explain the correct one — always available, unlike Quiz's Practice mode.
  function handleCopy() {
    copyWithFeedback(buildPrompt(q), setCopyLabel, 'Copy explanation prompt');
  }

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
      <ProgressHeader current={current} total={total} onAbandon={onBack} abandonTitle="Quit review" />

      <QuestionBody question={q} />

      <AnswerList
        answers={q.answers}
        getClassName={(i) => 'answer-btn' + (i === q.correct ? ' correct-answer' : '')}
        isDisabled={() => true}
        onSelect={() => {}}
      />

      <div className="review-nav">
        <button className="btn-ghost review-nav-prev" onClick={prev} disabled={atStart}>
          ← Prev
        </button>
        <button className="btn-ghost review-nav-mid" onClick={handleCopy}>
          {copyLabel}
        </button>
        <button className="btn-ghost review-nav-next" onClick={nextQ} disabled={atEnd}>
          Next →
        </button>
      </div>
    </section>
  );
}
