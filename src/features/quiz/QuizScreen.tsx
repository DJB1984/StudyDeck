// Quiz — the two scored modes, Practice and Test (spec: src/features/quiz/Quiz.spec.md).
// Navigation is free in both modes: Back/Next are always visible and never require
// answering first, and either arrow key moves between questions. A per-question
// answer map (keyed by question id, not index) persists across that navigation, so
// revisiting a question restores what was picked instead of resetting it.
//
// Core invariant, Practice: firstAttemptCorrect is recorded on the FIRST submission
// per question and never overwritten by retries, so learning-by-retry can't inflate
// the score. Core invariant, Test: there's no "first attempt" — no feedback is shown,
// so changing your answer via Back isn't a retry, it's just picking again. Only the
// FINAL chosen answer is scored. Either mode: a question never answered by the time
// the session ends is scored wrong, not omitted.
//
// answerFormat support: 'mcq' (default) is untouched from the original single-click
// behavior below. 'multiSelect' and 'order' need an explicit "Check answer" step in
// Practice mode (unlike mcq, a single click/drag doesn't mean "done answering"), but
// stay ungated in Test mode exactly like mcq — no feedback until Stats either way.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { AnswerRecord, OrderItem, QuizQuestion, QuizSession, SessionRecord } from '../../types';
import { ProgressHeader, QuestionBody, AnswerList, MultiSelectAnswerList, OrderList } from '../../components/QuizUI';
import { buildPrompt, copyWithFeedback } from '../../lib/clipboard';
import { buildRecord, formatDuration } from '../stats/stats';
import { shuffleArray } from '../../lib/shuffle';

interface SavedAnswer {
  chosenIndex: number;
  /** Practice only: fixed on the first-ever pick/submit for this question, never updated after. */
  firstAttemptCorrect: boolean | null;
  /** multiSelect only — current/submitted selection. */
  chosenIndices?: number[];
  /** order only — item ids in the current/submitted order. */
  chosenOrder?: string[];
  /** multiSelect/order only: has "Check answer" been pressed in Practice mode. */
  submitted?: boolean;
}

interface QuizScreenProps {
  session: QuizSession;
  onFinish: (record: SessionRecord) => void;
  onAbandon: () => void;
}

function isCorrectMulti(question: QuizQuestion, chosenIndices: number[] | undefined): boolean {
  if (!chosenIndices || !question.correctIndices) return false;
  const a = [...chosenIndices].sort((x, y) => x - y);
  const b = [...question.correctIndices].sort((x, y) => x - y);
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function isCorrectOrder(question: QuizQuestion, chosenOrder: string[] | undefined): boolean {
  if (!chosenOrder || !question.correctOrder) return false;
  return (
    chosenOrder.length === question.correctOrder.length &&
    chosenOrder.every((id, i) => id === question.correctOrder![i])
  );
}

export function QuizScreen({ session, onFinish, onAbandon }: QuizScreenProps) {
  const { questions, order, mode } = session;

  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, SavedAnswer>>({});
  const [copyLabel, setCopyLabel] = useState('Copy explanation prompt');

  const sessionStartRef = useRef<number>(Date.now());
  const questionEnteredAtRef = useRef<number>(Date.now());
  const timeSpentRef = useRef<Record<string, number>>({}); // accumulated seconds, test mode only

  // R14: a live session clock, test mode only, shown between Back and Next.
  const [testElapsed, setTestElapsed] = useState(0);
  useEffect(() => {
    if (mode !== 'test') return;
    const tick = () => setTestElapsed(Math.round((Date.now() - sessionStartRef.current) / 1000));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [mode]);

  const q = questions[order[idx]];
  const total = order.length;
  const current = idx + 1;
  const isLast = current === total;
  const format = q.answerFormat ?? 'mcq';

  const saved = answers[q.id];
  const chosenIndex = saved?.chosenIndex ?? null;
  const answered =
    format === 'mcq'
      ? chosenIndex !== null
      : format === 'multiSelect'
        ? !!saved?.chosenIndices && saved.chosenIndices.length > 0
        : format === 'order'
          ? !!saved?.chosenOrder
          : false;

  // Practice-mode "locked" (correct, no more retries) is format-aware; Test never locks.
  const isCurrentlyCorrect =
    format === 'mcq'
      ? chosenIndex === q.correct
      : format === 'multiSelect'
        ? !!saved?.submitted && isCorrectMulti(q, saved?.chosenIndices)
        : format === 'order'
          ? !!saved?.submitted && isCorrectOrder(q, saved?.chosenOrder)
          : false;
  const locked = mode === 'practice' && isCurrentlyCorrect;

  // 'order' display order: restores the saved order if the student already
  // touched this question, otherwise shuffles once per question (memoized so
  // unrelated re-renders — e.g. copyLabel changing — don't reshuffle mid-drag).
  const orderDisplayItems: OrderItem[] = useMemo(() => {
    if (format !== 'order' || !q.items) return [];
    if (saved?.chosenOrder) {
      return saved.chosenOrder
        .map((id) => q.items!.find((it) => it.id === id))
        .filter((it): it is OrderItem => !!it);
    }
    return shuffleArray(q.items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.id, saved?.chosenOrder]);

  useEffect(() => {
    questionEnteredAtRef.current = Date.now();
    setCopyLabel('Copy explanation prompt');
  }, [idx]);

  function handlePracticeClick(i: number) {
    if (locked) return;
    setAnswers((prev) => {
      const existing = prev[q.id];
      // R3: firstAttemptCorrect is fixed by the first-ever pick and untouched by retries.
      const firstAttemptCorrect = existing?.firstAttemptCorrect ?? i === q.correct;
      return { ...prev, [q.id]: { chosenIndex: i, firstAttemptCorrect } };
    });
  }

  function handleTestClick(i: number) {
    setAnswers((prev) => ({ ...prev, [q.id]: { chosenIndex: i, firstAttemptCorrect: null } }));
  }

  function handleAnswerClick(i: number) {
    if (mode === 'test') handleTestClick(i);
    else handlePracticeClick(i);
  }

  function isDisabled(_i: number): boolean {
    return locked; // Practice locks all answers once the correct one is picked; Test never locks.
  }

  function answerClass(i: number): string {
    let cls = 'answer-btn';
    if (mode === 'practice') {
      if (i === chosenIndex) cls += i === q.correct ? ' correct-answer' : ' wrong-answer';
    } else if (i === chosenIndex) {
      cls += ' selected-answer';
    }
    return cls;
  }

  // --- multiSelect handlers ---
  function handleMultiToggle(i: number) {
    if (locked) return;
    setAnswers((prev) => {
      const existing = prev[q.id];
      const current = existing?.chosenIndices ?? [];
      const next = current.includes(i) ? current.filter((x) => x !== i) : [...current, i];
      return {
        ...prev,
        [q.id]: {
          chosenIndex: -1,
          chosenIndices: next,
          firstAttemptCorrect: existing?.firstAttemptCorrect ?? null,
          submitted: mode === 'practice' ? false : true,
        },
      };
    });
  }

  function handleMultiSubmit() {
    if (mode !== 'practice' || locked) return;
    setAnswers((prev) => {
      const existing = prev[q.id];
      const chosenIndices = existing?.chosenIndices ?? [];
      const correct = isCorrectMulti(q, chosenIndices);
      const firstAttemptCorrect = existing?.firstAttemptCorrect ?? correct;
      return { ...prev, [q.id]: { chosenIndex: -1, chosenIndices, firstAttemptCorrect, submitted: true } };
    });
  }

  function multiClass(i: number): string {
    let cls = 'answer-btn multi-select-btn';
    const isSelected = saved?.chosenIndices?.includes(i) ?? false;
    if (mode === 'practice' && saved?.submitted) {
      const shouldBeSelected = q.correctIndices?.includes(i) ?? false;
      if (isSelected && shouldBeSelected) cls += ' correct-answer';
      else if (isSelected && !shouldBeSelected) cls += ' wrong-answer';
      else if (!isSelected && shouldBeSelected) cls += ' missed-answer';
    } else if (isSelected) {
      cls += ' selected-answer';
    }
    return cls;
  }

  // --- order handlers ---
  function handleOrderChange(next: OrderItem[]) {
    if (locked) return;
    setAnswers((prev) => {
      const existing = prev[q.id];
      return {
        ...prev,
        [q.id]: {
          chosenIndex: -1,
          chosenOrder: next.map((it) => it.id),
          firstAttemptCorrect: existing?.firstAttemptCorrect ?? null,
          submitted: mode === 'practice' ? false : true,
        },
      };
    });
  }

  function handleOrderSubmit() {
    if (mode !== 'practice' || locked) return;
    setAnswers((prev) => {
      const existing = prev[q.id];
      const chosenOrder = existing?.chosenOrder ?? orderDisplayItems.map((it) => it.id);
      const correct = isCorrectOrder(q, chosenOrder);
      const firstAttemptCorrect = existing?.firstAttemptCorrect ?? correct;
      return { ...prev, [q.id]: { chosenIndex: -1, chosenOrder, firstAttemptCorrect, submitted: true } };
    });
  }

  function orderItemClass(i: number): string {
    if (mode !== 'practice' || !saved?.submitted || !q.correctOrder) return '';
    const item = orderDisplayItems[i];
    return item && q.correctOrder[i] === item.id ? 'correct-answer' : 'wrong-answer';
  }

  // Accumulates time on the question being left, keyed by id so revisits sum
  // rather than overwrite. Called from every place idx is about to change or
  // the session is about to end.
  function flushTime() {
    if (mode !== 'test') return;
    const elapsed = Math.round((Date.now() - questionEnteredAtRef.current) / 1000);
    timeSpentRef.current[q.id] = (timeSpentRef.current[q.id] ?? 0) + elapsed;
  }

  function goTo(newIdx: number) {
    flushTime();
    setIdx(Math.max(0, Math.min(total - 1, newIdx)));
  }

  function prev() {
    if (idx > 0) goTo(idx - 1);
  }

  function buildAnswerRecords(): AnswerRecord[] {
    // R12: one record per question in `order`, not just the ones actually
    // answered — a skipped question is scored wrong rather than omitted.
    return order.map((qi) => {
      const question = questions[qi];
      const qFormat = question.answerFormat ?? 'mcq';
      const a = answers[question.id];
      const timeSpent = mode === 'test' ? (timeSpentRef.current[question.id] ?? 0) : null;

      if (qFormat === 'multiSelect') {
        const chosenIndices = a?.chosenIndices ?? [];
        const correct = isCorrectMulti(question, chosenIndices);
        const firstAttemptCorrect =
          chosenIndices.length === 0 ? false : mode === 'practice' ? (a!.firstAttemptCorrect ?? false) : correct;
        return {
          id: question.id,
          firstAttemptCorrect,
          chosenIndex: -1,
          correctIndex: -1,
          chosenIndices,
          correctIndices: question.correctIndices ?? [],
          timeSpent,
        };
      }

      if (qFormat === 'order') {
        const chosenOrder = a?.chosenOrder ?? [];
        const correct = isCorrectOrder(question, chosenOrder);
        const firstAttemptCorrect =
          chosenOrder.length === 0 ? false : mode === 'practice' ? (a!.firstAttemptCorrect ?? false) : correct;
        return {
          id: question.id,
          firstAttemptCorrect,
          chosenIndex: -1,
          correctIndex: -1,
          chosenOrder,
          correctOrder: question.correctOrder ?? [],
          timeSpent,
        };
      }

      // mcq (default) — unchanged from the original single-format implementation.
      const chosen = a?.chosenIndex ?? -1;
      const firstAttemptCorrect =
        chosen === -1
          ? false
          : mode === 'practice'
            ? (a!.firstAttemptCorrect ?? false)
            : chosen === question.correct; // test: only the FINAL pick is scored
      return {
        id: question.id,
        firstAttemptCorrect,
        chosenIndex: chosen,
        correctIndex: question.correct,
        timeSpent,
      };
    });
  }

  function finish() {
    flushTime();
    const duration = Math.round((Date.now() - sessionStartRef.current) / 1000);
    onFinish(buildRecord(buildAnswerRecords(), duration, mode));
  }

  function next() {
    if (isLast) finish();
    else goTo(idx + 1);
  }

  function handleCopy() {
    copyWithFeedback(
      buildPrompt(q, chosenIndex ?? undefined),
      setCopyLabel,
      'Copy explanation prompt',
    );
  }

  // Keyboard: 1–4 select enabled mcq answers only (other formats have no
  // single-key-per-option mapping); ←/→ freely move between questions (no
  // answer required); Enter also advances/finishes.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (format === 'mcq' && ['1', '2', '3', '4'].includes(e.key)) {
        const i = parseInt(e.key, 10) - 1;
        if (i < q.answers.length && !isDisabled(i)) handleAnswerClick(i);
      } else if (e.key === 'ArrowLeft') {
        if (idx > 0) {
          e.preventDefault();
          prev();
        }
      } else if (e.key === 'Enter' || e.key === 'ArrowRight') {
        e.preventDefault();
        next();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, answers]);

  const feedbackMsg =
    mode !== 'practice' || !answered
      ? ''
      : format === 'mcq'
        ? chosenIndex === q.correct
          ? 'Correct!'
          : 'Incorrect — try again'
        : saved?.submitted
          ? isCurrentlyCorrect
            ? 'Correct!'
            : 'Incorrect — try again'
          : '';
  const feedbackClass =
    !answered || (format !== 'mcq' && !saved?.submitted) ? '' : isCurrentlyCorrect ? 'correct' : 'incorrect';

  return (
    <section id="quiz-screen" className="screen">
      <ProgressHeader current={current} total={total} onAbandon={onAbandon} abandonTitle="Quit quiz" />

      <QuestionBody question={q} />

      {format === 'mcq' && (
        <AnswerList
          answers={q.answers}
          getClassName={answerClass}
          isDisabled={isDisabled}
          onSelect={handleAnswerClick}
        />
      )}

      {format === 'multiSelect' && (
        <MultiSelectAnswerList
          answers={q.answers}
          isSelected={(i) => saved?.chosenIndices?.includes(i) ?? false}
          getClassName={multiClass}
          isDisabled={() => locked}
          onToggle={handleMultiToggle}
        />
      )}

      {format === 'order' && (
        <OrderList
          items={orderDisplayItems}
          onReorder={handleOrderChange}
          disabled={locked}
          getClassName={orderItemClass}
        />
      )}

      {format !== 'mcq' && format !== 'multiSelect' && format !== 'order' && (
        <div className="format-unsupported glass-card">
          This question type isn't supported yet in this build.
        </div>
      )}

      {mode === 'practice' && (format === 'multiSelect' || format === 'order') && !locked && (
        <button
          className="btn quiz-check-btn"
          onClick={format === 'multiSelect' ? handleMultiSubmit : handleOrderSubmit}
          disabled={!answered}
        >
          Check answer
        </button>
      )}

      {mode === 'practice' && (
        <div id="quiz-feedback">
          <span
            id="quiz-feedback-msg"
            className={feedbackClass}
            style={{ visibility: feedbackMsg ? 'visible' : 'hidden' }}
          >
            {feedbackMsg}
          </span>
        </div>
      )}

      <div className="quiz-nav-row">
        <button className="btn-ghost quiz-nav-back" onClick={prev} disabled={idx === 0}>
          ← Back
        </button>
        {mode === 'test' && (
          <span id="quiz-timer" className="quiz-nav-mid">
            {formatDuration(testElapsed)}
          </span>
        )}
        {mode === 'practice' && format === 'mcq' && (
          <button className="btn-ghost quiz-nav-mid" onClick={handleCopy}>
            {copyLabel}
          </button>
        )}
        <button className="btn quiz-nav-next" onClick={next}>
          {isLast ? 'See Results' : 'Next →'}
        </button>
      </div>
    </section>
  );
}
