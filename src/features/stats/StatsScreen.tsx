// Stats screen — score summary, doughnut chart, and per-question breakdown
// (spec: src/features/stats/Stats.spec.md). Retake reuses the same order, or
// prompts same/new-random only when the finished run was randomized.

import { useLayoutEffect, useRef, useState } from 'react';
import { Chart } from 'chart.js/auto';
import type { AnswerRecord, QuizQuestion, QuizSession, SessionRecord } from '../../types';
import { Katex } from '../../components/Math/Katex';
import { buildPrompt, copyWithFeedback } from '../../lib/clipboard';
import { shuffledOrder } from '../../lib/shuffle';
import { buildPieData, formatDuration } from './stats';

const LETTERS = ['A', 'B', 'C', 'D'];

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
    chartRef.current = new Chart(canvas, {
      type: 'doughnut',
      data: {
        datasets: [
          {
            data: [pie.correct, pie.incorrect],
            backgroundColor: ['#7c3aed', '#ef4444'],
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

function BreakdownItem({ ans, q }: { ans: AnswerRecord; q: QuizQuestion }) {
  const [label, setLabel] = useState('Copy explanation prompt');
  const copy = () =>
    copyWithFeedback(buildPrompt(q, ans.chosenIndex), setLabel, 'Copy explanation prompt');

  if (ans.firstAttemptCorrect) {
    return (
      <div className="breakdown-item correct glass-card">
        <div className="breakdown-correct-top">
          <span className="breakdown-check">✓</span>
          <Katex className="breakdown-q-collapsed" text={q.question} />
        </div>
        <button className="btn-ghost copy-ai-btn" onClick={copy}>
          {label}
        </button>
      </div>
    );
  }

  return (
    <div className="breakdown-item wrong glass-card">
      <Katex as="div" className="breakdown-q-text" text={q.question} />
      <div className="breakdown-answer-row wrong-row">
        Your answer:{' '}
        <Katex text={`${LETTERS[ans.chosenIndex]}) ${q.answers[ans.chosenIndex]}`} />
      </div>
      <div className="breakdown-answer-row correct-row">
        Correct answer:{' '}
        <Katex text={`${LETTERS[ans.correctIndex]}) ${q.answers[ans.correctIndex]}`} />
      </div>
      <button className="btn-ghost copy-ai-btn" onClick={copy}>
        {label}
      </button>
    </div>
  );
}

export function StatsScreen({ record, session, onHome, onReview, onRetake }: StatsScreenProps) {
  const [showModal, setShowModal] = useState(false);

  function retake() {
    // R8: only prompt for order when the original run was random.
    if (session.wasRandom) setShowModal(true);
    else onRetake(session.order);
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

      {showModal && (
        <div id="retake-modal">
          <div className="retake-modal-card glass-card">
            <p>Retake with...</p>
            <button
              className="btn"
              onClick={() => {
                setShowModal(false);
                onRetake(session.order);
              }}
            >
              Same Order
            </button>
            <button
              className="btn-ghost"
              onClick={() => {
                setShowModal(false);
                onRetake(shuffledOrder(session.questions.length));
              }}
            >
              New Random Order
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
