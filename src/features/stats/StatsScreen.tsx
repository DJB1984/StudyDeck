// Stats screen — score summary, doughnut chart, and per-question breakdown.
// Retake reuses the same question order.

import { useLayoutEffect, useRef, useState } from 'react';
import { Chart } from 'chart.js/auto';
import type { AnswerRecord, QuizQuestion, QuizSession, SessionRecord } from '../../types';
import { Katex } from '../../components/Math/Katex';
import { LETTERS } from '../../components/QuizUI';
import { buildPrompt, copyWithFeedback } from '../../lib/clipboard';
import { buildPieData, formatDuration } from './stats';

interface StatsScreenProps {
  record: SessionRecord;
  session: QuizSession;
  onHome: () => void;
  onReview: () => void;
  onRetake: (order: number[]) => void;
}

function StatsPie({ record }: { record: SessionRecord }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (chartRef.current) chartRef.current.destroy();
    const pie = buildPieData(record);
    // Correct/incorrect must stay tied to the same --correct/--incorrect tokens
    // the breakdown list below uses (design system's Feedback-Only Rule) —
    // resolved from the live CSS custom properties rather than re-hardcoded,
    // so the two can't drift apart again.
    const rootStyle = getComputedStyle(document.documentElement);
    const correctColor = rootStyle.getPropertyValue('--correct').trim() || '#22c55e';
    const incorrectColor = rootStyle.getPropertyValue('--incorrect').trim() || '#ef4444';
    chartRef.current = new Chart(canvas, {
      type: 'doughnut',
      data: {
        datasets: [
          {
            data: [pie.correct, pie.incorrect],
            backgroundColor: [correctColor, incorrectColor],
            borderWidth: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '72%',
        animation: { duration: 600 },
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
      },
    });
    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [record]);

  return <canvas ref={canvasRef} id="stats-pie-canvas" />;
}

/** "Your answer" / "correct answer" text for non-mcq formats — mcq keeps its own lettered rendering below. */
function formatAnswerText(ans: AnswerRecord, q: QuizQuestion, format: string, which: 'chosen' | 'correct'): string {
  if (format === 'multiSelect') {
    const indices = which === 'chosen' ? ans.chosenIndices : ans.correctIndices;
    if (!indices || indices.length === 0) return which === 'chosen' ? "You didn't answer this one" : '';
    return indices.map((i) => `${LETTERS[i]}) ${q.answers[i]}`).join(', ');
  }
  if (format === 'order') {
    const ids = which === 'chosen' ? ans.chosenOrder : ans.correctOrder;
    if (!ids || ids.length === 0) return which === 'chosen' ? "You didn't answer this one" : '';
    return ids.map((id) => q.items?.find((it) => it.id === id)?.text ?? id).join(' → ');
  }
  if (format === 'numeric') {
    if (which === 'chosen') return ans.numericInput ?? "You didn't answer this one";
    // Stats always reveals the correct answer regardless of Practice's no-hint
    // policy (every other format does too) — the tolerance is genuinely useful
    // context here, not a mid-practice hint.
    return `${q.correctValue} (±${q.tolerance})`;
  }
  return '';
}

function BreakdownItem({ ans, q }: { ans: AnswerRecord; q: QuizQuestion }) {
  const [label, setLabel] = useState('Copy explanation prompt');
  const format = q.answerFormat ?? 'mcq';
  // -1 means the question was left unanswered (skipped via Back/Next) — scored
  // wrong, but there's no chosen answer to build an explanation prompt from.
  const wasAnswered =
    format === 'multiSelect'
      ? !!ans.chosenIndices && ans.chosenIndices.length > 0
      : format === 'order'
        ? !!ans.chosenOrder && ans.chosenOrder.length > 0
        : format === 'numeric'
          ? !!ans.numericInput
          : format === 'code'
            ? !!ans.codeInput
            : ans.chosenIndex !== -1;
  const copy = () =>
    copyWithFeedback(buildPrompt(q, ans.chosenIndex), setLabel, 'Copy explanation prompt');

  if (ans.firstAttemptCorrect) {
    return (
      <div className="breakdown-item correct glass-card">
        <div className="breakdown-correct-top">
          <span className="breakdown-check">✓</span>
          <Katex className="breakdown-q-collapsed" text={q.question} />
        </div>
        {format === 'mcq' && (
          <button className="btn-ghost copy-ai-btn" onClick={copy}>
            {label}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="breakdown-item wrong glass-card">
      <Katex as="div" className="breakdown-q-text" text={q.question} />
      <div className="breakdown-answer-row wrong-row">
        {format === 'mcq' ? (
          wasAnswered ? (
            <>
              Your answer: <Katex text={`${LETTERS[ans.chosenIndex]}) ${q.answers[ans.chosenIndex]}`} />
            </>
          ) : (
            "You didn't answer this one"
          )
        ) : format === 'code' ? (
          wasAnswered ? (
            <>
              Your answer:
              <pre className="code-breakdown-block">{ans.codeInput}</pre>
            </>
          ) : (
            "You didn't answer this one"
          )
        ) : wasAnswered ? (
          <>
            Your answer: <Katex text={formatAnswerText(ans, q, format, 'chosen')} />
          </>
        ) : (
          "You didn't answer this one"
        )}
      </div>
      <div className="breakdown-answer-row correct-row">
        Correct answer:{' '}
        {format === 'mcq' ? (
          <Katex text={`${LETTERS[ans.correctIndex]}) ${q.answers[ans.correctIndex]}`} />
        ) : format === 'code' ? (
          <span className="code-breakdown-expected">
            {q.checks?.structure?.requiredNames?.length ? (
              <span>Must define: {q.checks.structure.requiredNames.join(', ')}. </span>
            ) : null}
            {q.checks?.tests?.length ? <span>Must pass all {q.checks.tests.length} test case(s).</span> : null}
          </span>
        ) : (
          <Katex text={formatAnswerText(ans, q, format, 'correct')} />
        )}
      </div>
      {wasAnswered && format === 'mcq' && (
        <button className="btn-ghost copy-ai-btn" onClick={copy}>
          {label}
        </button>
      )}
    </div>
  );
}

export function StatsScreen({ record, session, onHome, onReview, onRetake }: StatsScreenProps) {
  function retake() {
    onRetake(session.order);
  }

  return (
    <section id="stats-screen" className="screen">
      <div className="screen-header">
        <button className="btn-ghost" onClick={onHome}>
          ← Home
        </button>
        <h2>Results</h2>
      </div>

      <div className="stats-summary">
        <div className="stats-pie-wrap">
          <StatsPie record={record} />
          <div className="stats-pie-center">
            <div id="stats-score-pct">{record.score}%</div>
          </div>
        </div>
        <div>
          <div id="stats-score-line">
            {record.correct} / {record.total} correct
          </div>
          <div id="stats-duration-line">Session time: {formatDuration(record.totalDuration)}</div>
        </div>
      </div>

      <div id="stats-breakdown">
        {record.questions.map((ans) => {
          const q = session.questions.find((qq) => qq.id === ans.id); // R11: match by id
          if (!q) return null;
          return <BreakdownItem key={ans.id} ans={ans} q={q} />;
        })}
      </div>

      <div className="stats-actions">
        <button className="btn-ghost" onClick={onReview}>
          Review
        </button>
        <button className="btn" onClick={retake}>
          Retake
        </button>
      </div>
    </section>
  );
}
