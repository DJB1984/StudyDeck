// Quiz — the two scored modes, Practice and Test.
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
import {
  ProgressHeader,
  QuestionBody,
  AnswerList,
  MultiSelectAnswerList,
  OrderList,
  NumericInput,
  CodeResultsPanel,
} from '../../components/QuizUI';
import { CodeEditor } from '../../components/Code/CodeEditor';
import { ConfirmModal } from '../../components/ConfirmModal';
import { buildPrompt, copyWithFeedback } from '../../lib/clipboard';
import { buildRecord, formatDuration } from '../stats/stats';
import { shuffleArray } from '../../lib/shuffle';
import { matchNumeric } from '../../lib/answerMatching';
import { runCodeChecks } from '../../lib/codeRunners';
import type { CodeCheckResult } from '../../lib/codeRunners';

interface SavedAnswer {
  chosenIndex: number;
  /** Practice only: fixed on the first-ever pick/submit for this question, never updated after. */
  firstAttemptCorrect: boolean | null;
  /** multiSelect only — current/submitted selection. */
  chosenIndices?: number[];
  /** order only — item ids in the current/submitted order. */
  chosenOrder?: string[];
  /** numeric only — raw text/slider value as typed, graded via answerMatching.matchNumeric. */
  numericValue?: string;
  /** code only — current editor text, graded via lib/codeRunners. */
  codeValue?: string;
  /** code only — result of the last "Run Tests" click in Practice mode. */
  codeResult?: CodeCheckResult;
  /** multiSelect/order/numeric/code only: has "Check answer" been pressed in Practice mode. */
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
  const [codeRunning, setCodeRunning] = useState(false);
  const [codeRunningLabel, setCodeRunningLabel] = useState('Running…');
  const [confirmQuit, setConfirmQuit] = useState(false);

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
          ? true // an order question always has a full current sequence to submit, touched or not
          : format === 'numeric'
            ? q.inputWidget === 'slider'
              ? true // a slider always has a value, touched or not — same reasoning as order
              : !!saved?.numericValue && saved.numericValue.trim() !== ''
            : format === 'code'
              ? (saved?.codeValue ?? q.starterCode ?? '').trim() !== ''
              : false;

  // Practice-mode "locked" (correct, no more retries) is format-aware; Test never locks.
  const isCurrentlyCorrect =
    format === 'mcq'
      ? chosenIndex === q.correct
      : format === 'multiSelect'
        ? !!saved?.submitted && isCorrectMulti(q, saved?.chosenIndices)
        : format === 'order'
          ? !!saved?.submitted && isCorrectOrder(q, saved?.chosenOrder)
          : format === 'numeric'
            ? !!saved?.submitted && matchNumeric(saved?.numericValue ?? '', q.correctValue ?? 0, q.tolerance ?? 0)
            : format === 'code'
              ? !!saved?.submitted && !!saved?.codeResult?.overallPass
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
    setCodeRunning(false);
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
      // Only reflects what the student actually picked — a correct option they
      // DIDN'T pick is never highlighted, that would give the answer away.
      const shouldBeSelected = q.correctIndices?.includes(i) ?? false;
      if (isSelected && shouldBeSelected) cls += ' correct-answer';
      else if (isSelected && !shouldBeSelected) cls += ' wrong-answer';
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

  // --- numeric/slider handlers ---
  function handleNumericChange(v: string) {
    if (locked) return;
    setAnswers((prev) => {
      const existing = prev[q.id];
      return {
        ...prev,
        [q.id]: {
          chosenIndex: -1,
          numericValue: v,
          firstAttemptCorrect: existing?.firstAttemptCorrect ?? null,
          submitted: mode === 'practice' ? false : true,
        },
      };
    });
  }

  function handleNumericSubmit() {
    if (mode !== 'practice' || locked) return;
    setAnswers((prev) => {
      const existing = prev[q.id];
      const numericValue = existing?.numericValue ?? '';
      const correct = matchNumeric(numericValue, q.correctValue ?? 0, q.tolerance ?? 0);
      const firstAttemptCorrect = existing?.firstAttemptCorrect ?? correct;
      return { ...prev, [q.id]: { chosenIndex: -1, numericValue, firstAttemptCorrect, submitted: true } };
    });
  }

  function numericInputClass(): string {
    if (mode !== 'practice' || !saved?.submitted) return '';
    return isCurrentlyCorrect ? 'correct-answer' : 'wrong-answer';
  }

  // --- code handlers ---
  function handleCodeChange(v: string) {
    if (locked) return;
    setAnswers((prev) => {
      const existing = prev[q.id];
      return {
        ...prev,
        [q.id]: {
          chosenIndex: -1,
          codeValue: v,
          codeResult: existing?.codeResult,
          firstAttemptCorrect: existing?.firstAttemptCorrect ?? null,
          submitted: mode === 'practice' ? false : true,
        },
      };
    });
  }

  async function handleCodeSubmit() {
    if (mode !== 'practice' || locked) return;
    const code = saved?.codeValue ?? q.starterCode ?? '';
    const questionId = q.id; // captured so a slow run lands on the right question even after navigation
    setCodeRunningLabel('Running…');
    setCodeRunning(true);
    const result = await runCodeChecks(q.language, code, q.checks ?? {}, setCodeRunningLabel);
    setCodeRunning(false);
    setAnswers((prev) => {
      const existing = prev[questionId];
      const firstAttemptCorrect = existing?.firstAttemptCorrect ?? result.overallPass;
      return {
        ...prev,
        [questionId]: { chosenIndex: -1, codeValue: code, codeResult: result, firstAttemptCorrect, submitted: true },
      };
    });
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

  async function buildAnswerRecords(): Promise<AnswerRecord[]> {
    // R12: one record per question in `order`, not just the ones actually
    // answered — a skipped question is scored wrong rather than omitted.
    return Promise.all(order.map(async (qi) => {
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

      if (qFormat === 'numeric') {
        const numericValue = a?.numericValue ?? '';
        const hasValue = numericValue.trim() !== '';
        const correct = matchNumeric(numericValue, question.correctValue ?? 0, question.tolerance ?? 0);
        const firstAttemptCorrect = !hasValue ? false : mode === 'practice' ? (a!.firstAttemptCorrect ?? false) : correct;
        return {
          id: question.id,
          firstAttemptCorrect,
          chosenIndex: -1,
          correctIndex: -1,
          numericInput: hasValue ? numericValue : undefined,
          timeSpent,
        };
      }

      if (qFormat === 'code') {
        const codeValue = a?.codeValue ?? question.starterCode ?? '';
        const hasCode = codeValue.trim() !== '';
        // Practice already recorded firstAttemptCorrect from the first "Run
        // Tests" click — re-running here would let later retries silently
        // change it, breaking the retry-doesn't-inflate-score invariant. Test
        // mode never showed a Run button, so grading against the final code
        // only happens here, once. Unlike the other formats above, `hasCode`
        // can be true even when `a` itself is undefined (starterCode alone is
        // non-empty and the student never touched this question at all), so
        // this reads `a?.` rather than asserting `a!` exists.
        const firstAttemptCorrect = !hasCode
          ? false
          : mode === 'practice'
            ? (a?.firstAttemptCorrect ?? false)
            : (await runCodeChecks(question.language, codeValue, question.checks ?? {})).overallPass;
        return {
          id: question.id,
          firstAttemptCorrect,
          chosenIndex: -1,
          correctIndex: -1,
          codeInput: hasCode ? codeValue : undefined,
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
    }));
  }

  async function finish() {
    flushTime();
    const duration = Math.round((Date.now() - sessionStartRef.current) / 1000);
    const records = await buildAnswerRecords();
    onFinish(buildRecord(records, duration, mode));
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

  // Keyboard: 1–9 select enabled mcq answers only — a question may carry any
  // number of choices from 2 up, and a key past the last one is ignored (other
  // formats have no
  // single-key-per-option mapping); ←/→ freely move between questions (no
  // answer required); Enter also advances/finishes. Skipped entirely while a
  // form control (numeric text input, slider, code editor) is focused —
  // otherwise Enter would silently advance instead of submitting/inserting a
  // newline, and ←/→ would fight the slider's native nudging or the code
  // editor's own cursor movement instead of moving between questions.
  useEffect(() => {
    function isFormField(el: HTMLElement | null): boolean {
      if (!el) return false;
      return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || !!el.closest('.code-editor');
    }
    function onKey(e: KeyboardEvent) {
      // The quit confirm is modal: while it's up, keys must not reach the
      // question underneath (Enter would advance it, a digit would answer it).
      // window.confirm() used to block the page for us; this doesn't.
      if (confirmQuit) return;
      if (isFormField(e.target as HTMLElement)) return;
      if (format === 'mcq' && /^[1-9]$/.test(e.key)) {
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
  }, [idx, answers, confirmQuit]);

  const feedbackMsg =
    mode !== 'practice' || !answered || format === 'code' // code's detailed pass/fail lives in CodeResultsPanel instead
      ? ''
      : format === 'mcq'
        ? chosenIndex === q.correct
          ? 'Correct!'
          : 'Incorrect — try again'
        : saved?.submitted
          ? isCurrentlyCorrect
            ? 'Correct!'
            : format === 'multiSelect'
              ? 'Incorrect — recheck your selections' // no more/fewer hint, that leaks info
              : 'Incorrect — try again'
          : '';
  const feedbackClass =
    !answered || format === 'code' || (format !== 'mcq' && !saved?.submitted)
      ? ''
      : isCurrentlyCorrect
        ? 'correct'
        : 'incorrect';

  // Test mode has no retries and no feedback until Stats — quitting mid-session
  // throws that progress away for good, so it's the one mode worth a confirm.
  // Practice has nothing at stake (retries don't count) and stays a single click.
  function handleAbandon() {
    if (mode === 'test') {
      setConfirmQuit(true);
      return;
    }
    onAbandon();
  }

  return (
    <section id="quiz-screen" className="screen">
      <ProgressHeader current={current} total={total} onAbandon={handleAbandon} abandonTitle="Quit quiz" />

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

      {format === 'numeric' && (
        <NumericInput
          value={saved?.numericValue ?? ''}
          onChange={handleNumericChange}
          onEnter={handleNumericSubmit}
          disabled={locked}
          inputWidget={q.inputWidget ?? 'text'}
          sliderMin={q.sliderMin}
          sliderMax={q.sliderMax}
          sliderStep={q.sliderStep}
          className={numericInputClass()}
        />
      )}

      {format === 'code' && (
        <CodeEditor
          key={q.id}
          value={saved?.codeValue ?? q.starterCode ?? ''}
          onChange={handleCodeChange}
          language={q.language ?? 'javascript'}
          readOnly={locked}
        />
      )}

      {format === 'code' && mode === 'practice' && (codeRunning || (saved?.submitted && saved?.codeResult)) && (
        <CodeResultsPanel result={saved?.codeResult ?? null} running={codeRunning} runningLabel={codeRunningLabel} />
      )}

      {format !== 'mcq' &&
        format !== 'multiSelect' &&
        format !== 'order' &&
        format !== 'numeric' &&
        format !== 'code' && (
          <div className="format-unsupported glass-card">
            This question type isn't supported yet in this build.
          </div>
        )}

      {mode === 'practice' &&
        (format === 'multiSelect' || format === 'order' || format === 'numeric' || format === 'code') &&
        !locked && (
          <button
            className="btn quiz-check-btn"
            onClick={
              format === 'multiSelect'
                ? handleMultiSubmit
                : format === 'order'
                  ? handleOrderSubmit
                  : format === 'code'
                    ? handleCodeSubmit
                    : handleNumericSubmit
            }
            disabled={!answered || (format === 'code' && codeRunning)}
          >
            {format === 'code' ? (codeRunning ? 'Running…' : 'Run Tests') : 'Check answer'}
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

      {confirmQuit && (
        <ConfirmModal
          title="Quit this test?"
          message="Your progress won't be saved."
          confirmLabel="Quit test"
          danger
          onConfirm={onAbandon}
          onCancel={() => setConfirmQuit(false)}
        />
      )}
    </section>
  );
}
