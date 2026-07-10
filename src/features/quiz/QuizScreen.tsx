// Quiz — the two scored modes, Practice and Test (spec: src/features/quiz/Quiz.spec.md).
// Core invariant: firstAttemptCorrect is recorded on the FIRST submission per
// question and never overwritten by retries, so learning-by-retry in Practice
// can't inflate the score.

import { useEffect, useRef, useState } from 'react';
import type { AnswerRecord, QuizSession, SessionRecord } from '../../types';
import { Katex } from '../../components/Math/Katex';
import { Graph } from '../../components/Graph/Graph';
import { buildPrompt, copyWithFeedback } from '../../lib/clipboard';
import { buildRecord } from '../stats/stats';

const LETTERS = ['A', 'B', 'C', 'D'];

interface QuizScreenProps {
  session: QuizSession;
  onFinish: (record: SessionRecord) => void;
  onAbandon: () => void;
}

export function QuizScreen({ session, onFinish, onAbandon }: QuizScreenProps) {
  const { questions, order, mode } = session;

  const [idx, setIdx] = useState(0);
  const [correctIdx, setCorrectIdx] = useState<number | null>(null); // practice: correct pick
  const [wrongIdx, setWrongIdx] = useState<number | null>(null); // practice: last wrong pick
  const [pendingTest, setPendingTest] = useState<number | null>(null); // test selection
  const [lastChosen, setLastChosen] = useState<number | null>(null); // for copy prompt
  const [copyLabel, setCopyLabel] = useState('Copy explanation prompt');

  const recordRef = useRef<AnswerRecord[]>([]);
  const sessionStartRef = useRef<number>(Date.now());
  const questionStartRef = useRef<number>(Date.now());
  const firstDoneRef = useRef<boolean>(false);

  const q = questions[order[idx]];
  const total = order.length;
  const current = idx + 1;
  const isLast = current === total;

  // R13: reset everything on each question render.
  useEffect(() => {
    questionStartRef.current = Date.now();
    firstDoneRef.current = false;
    setCorrectIdx(null);
    setWrongIdx(null);
    setPendingTest(null);
    setLastChosen(null);
    setCopyLabel('Copy explanation prompt');
  }, [idx]);

  const practiceInteracted = correctIdx !== null || wrongIdx !== null;
  const nextVisible = mode === 'test' ? pendingTest !== null : practiceInteracted;

  // R3: only the first submission per question records a stat entry.
  function submitFirst(chosenIndex: number) {
    if (firstDoneRef.current) return;
    firstDoneRef.current = true;
    recordRef.current.push({
      id: q.id,
      firstAttemptCorrect: chosenIndex === q.correct,
      chosenIndex,
      correctIndex: q.correct,
      timeSpent: mode === 'test' ? Math.round((Date.now() - questionStartRef.current) / 1000) : null,
    });
  }

  function handlePracticeClick(i: number) {
    if (correctIdx !== null) return; // locked after a correct answer
    submitFirst(i);
    setLastChosen(i);
    if (i === q.correct) {
      setCorrectIdx(i);
      setWrongIdx(null); // R4: clear prior wrong highlight
    } else {
      setWrongIdx(i);
    }
  }

  function handleTestClick(i: number) {
    setPendingTest(i); // R6: pending selection, no correctness feedback
  }

  function handleAnswerClick(i: number) {
    if (mode === 'test') handleTestClick(i);
    else handlePracticeClick(i);
  }

  function isDisabled(_i: number): boolean {
    // Practice locks all answers once the correct one is picked; Test never locks.
    return mode === 'practice' && correctIdx !== null;
  }

  function answerClass(i: number): string {
    let cls = 'answer-btn';
    if (mode === 'practice') {
      if (i === correctIdx) cls += ' correct-answer';
      else if (i === wrongIdx) cls += ' wrong-answer';
    } else if (i === pendingTest) {
      cls += ' selected-answer';
    }
    return cls;
  }

  function next() {
    // R7: test records on advancing (submitting the pending selection).
    if (mode === 'test' && pendingTest !== null) submitFirst(pendingTest);
    if (isLast) {
      // R9/R12: session timer → Stats builds the record; Quiz emits raw records only.
      const duration = Math.round((Date.now() - sessionStartRef.current) / 1000);
      onFinish(buildRecord(recordRef.current, duration, mode));
    } else {
      setIdx(idx + 1);
    }
  }

  // R10: keyboard — 1–4 select enabled answers; Enter/→ triggers Next when visible.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (['1', '2', '3', '4'].includes(e.key)) {
        const i = parseInt(e.key, 10) - 1;
        if (i < q.answers.length && !isDisabled(i)) handleAnswerClick(i);
      } else if (e.key === 'Enter' || e.key === 'ArrowRight') {
        if (nextVisible) {
          e.preventDefault();
          next();
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, correctIdx, wrongIdx, pendingTest, nextVisible]);

  const feedbackMsg =
    mode === 'test'
      ? ''
      : correctIdx !== null
        ? 'Correct!'
        : wrongIdx !== null
          ? 'Incorrect — try again'
          : '';
  const feedbackClass = correctIdx !== null ? 'correct' : wrongIdx !== null ? 'incorrect' : '';

  return (
    <section id="quiz-screen" className="screen">
      <div id="quiz-header">
        <button id="quiz-abandon-btn" title="Quit quiz" onClick={onAbandon}>
          ✕
        </button>
        <span id="quiz-progress-text">
          {current} of {total}
        </span>
        <div id="quiz-progress-bar">
          {/* R2: bar reflects questions COMPLETED — reads 0% on Q1. */}
          <div id="quiz-progress-fill" style={{ width: `${((current - 1) / total) * 100}%` }}></div>
        </div>
      </div>

      {q.graph && <Graph key={q.id} graph={q.graph} />}

      <div id="quiz-question-text">
        <Katex key={q.id + '-q'} text={q.question} />
      </div>

      <div id="quiz-answer-list">
        {q.answers.map((ans, i) => (
          <button
            key={i}
            className={answerClass(i)}
            disabled={isDisabled(i)}
            onClick={() => handleAnswerClick(i)}
          >
            <span className="answer-label">{LETTERS[i]}</span>
            <Katex className="answer-text" text={ans} />
          </button>
        ))}
      </div>

      <div id="quiz-feedback" style={{ visibility: nextVisible ? 'visible' : 'hidden' }}>
        <span id="quiz-feedback-msg" className={feedbackClass}>
          {feedbackMsg}
        </span>
        {mode === 'practice' && practiceInteracted && lastChosen !== null && (
          <button
            className="btn-ghost"
            onClick={() =>
              copyWithFeedback(
                buildPrompt(q, lastChosen),
                setCopyLabel,
                'Copy explanation prompt',
              )
            }
          >
            {copyLabel}
          </button>
        )}
        {nextVisible && (
          <button className="btn" onClick={next}>
            {isLast ? 'See Results' : 'Next →'}
          </button>
        )}
      </div>
    </section>
  );
}
