// Review — read-only browser through a quiz deck with the correct answer shown.
// Reachable from Mode Select and from Stats; the caller owns the "back to
// origin" navigation.

import { useEffect, useState } from 'react';
import type { QuizQuestion } from '../../types';
import {
  ProgressHeader,
  QuestionBody,
  AnswerList,
  MultiSelectAnswerList,
  OrderList,
  NumericInput,
} from '../../components/QuizUI';
import { CodeEditor } from '../../components/Code/CodeEditor';
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
  const format = q.answerFormat ?? 'mcq';

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
  // mcq only: buildPrompt assumes a single `answers`/`correct` shape.
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

      {/* fillBlank shows the canonical answer sitting in each blank, read-only —
          Review's whole job is showing the correct answer in place. */}
      <QuestionBody
        question={q}
        blankSlots={
          format === 'fillBlank'
            ? {
                values: (q.blanks ?? []).map((b) => b.accept[0] ?? ''),
                onChange: () => {},
                onEnter: () => {},
                disabled: true,
                getClassName: () => 'correct-answer',
              }
            : undefined
        }
      />

      {format === 'mcq' && (
        <AnswerList
          answers={q.answers}
          getClassName={(i) => 'answer-btn' + (i === q.correct ? ' correct-answer' : '')}
          isDisabled={() => true}
          onSelect={() => {}}
        />
      )}

      {format === 'multiSelect' && (
        <MultiSelectAnswerList
          answers={q.answers}
          isSelected={(i) => q.correctIndices?.includes(i) ?? false}
          getClassName={(i) => 'answer-btn multi-select-btn' + (q.correctIndices?.includes(i) ? ' correct-answer' : '')}
          isDisabled={() => true}
          onToggle={() => {}}
        />
      )}

      {format === 'order' && (
        <OrderList
          items={(q.correctOrder ?? []).map((id) => q.items?.find((it) => it.id === id)).filter((it): it is NonNullable<typeof it> => !!it)}
          onReorder={() => {}}
          disabled={true}
        />
      )}

      {format === 'numeric' && (
        <NumericInput
          value={String(q.correctValue ?? '')}
          onChange={() => {}}
          onEnter={() => {}}
          disabled={true}
          inputWidget={q.inputWidget ?? 'text'}
          sliderMin={q.sliderMin}
          sliderMax={q.sliderMax}
          sliderStep={q.sliderStep}
          className="correct-answer"
        />
      )}

      {format === 'code' && (
        <>
          <CodeEditor
            key={q.id}
            value={q.starterCode ?? ''}
            onChange={() => {}}
            language={q.language ?? 'javascript'}
            readOnly
          />
          {(q.checks?.structure?.requiredNames?.length || q.checks?.tests?.length) && (
            <div className="code-review-checks glass-card">
              {q.checks?.structure?.requiredNames?.length ? (
                <div className="code-check-row">Must define: {q.checks.structure.requiredNames.join(', ')}</div>
              ) : null}
              {q.checks?.tests?.map((t, i) => (
                <div key={i} className="code-check-row">
                  <code>{t.call}</code> → <code>{t.expect}</code>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {format !== 'mcq' &&
        format !== 'multiSelect' &&
        format !== 'order' &&
        format !== 'numeric' &&
        format !== 'fillBlank' &&
        format !== 'code' && (
          <div className="format-unsupported glass-card">
            This question type isn't supported yet in this build.
          </div>
        )}

      <div className="review-nav">
        <button className="btn-ghost review-nav-prev" onClick={prev} disabled={atStart}>
          ← Prev
        </button>
        {format === 'mcq' && (
          <button className="btn-ghost review-nav-mid" onClick={handleCopy}>
            {copyLabel}
          </button>
        )}
        <button className="btn-ghost review-nav-next" onClick={nextQ} disabled={atEnd}>
          Next →
        </button>
      </div>
    </section>
  );
}
