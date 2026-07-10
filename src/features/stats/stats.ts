// Stats logic — builds the session record and derived score/pie data
// (spec: src/features/stats/Stats.spec.md). Kept separate from the Quiz engine
// so scoring can evolve independently of how questions are asked.

import type { AnswerRecord, QuizMode, SessionRecord } from '../../types';

// R1: `correct` counts FIRST-attempt correctness only. R2: score is 0 when total is 0.
export function buildRecord(
  answerRecord: AnswerRecord[],
  duration: number,
  mode: QuizMode,
): SessionRecord {
  const total = answerRecord.length;
  const correct = answerRecord.filter((a) => a.firstAttemptCorrect).length;
  return {
    mode,
    totalDuration: duration,
    total,
    correct,
    score: total > 0 ? Math.round((correct / total) * 100) : 0,
    questions: answerRecord,
  };
}

// R3
export function buildPieData(record: SessionRecord): { correct: number; incorrect: number } {
  return { correct: record.correct, incorrect: record.total - record.correct };
}

// R4: {m}m {s}s when at least a minute, else {s}s.
export function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
