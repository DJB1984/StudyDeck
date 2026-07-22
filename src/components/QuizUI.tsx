// Shared presentational pieces of a "question screen" — used by both
// src/features/quiz/QuizScreen.tsx (Practice/Test) and
// src/features/review/ReviewScreen.tsx (read-only browse). The two screens
// look identical apart from this shell: how an answer gets its class/disabled
// state, and whether picking one does anything, is still entirely owned by
// each screen (scoring/retry-locking in Quiz, always-disabled-and-correct in
// Review) — only the markup and CSS classes are shared here, not any state.

import { Katex } from './Math/Katex';
import { Graph } from './Graph/Graph';
import type { OrderItem, QuizQuestion } from '../types';

export const LETTERS = ['A', 'B', 'C', 'D'];

interface ProgressHeaderProps {
  current: number;
  total: number;
  onAbandon: () => void;
  abandonTitle: string;
}

/** The ✕ / "N of total" / fill-bar row atop Practice, Test, and Review alike. */
export function ProgressHeader({ current, total, onAbandon, abandonTitle }: ProgressHeaderProps) {
  return (
    <div className="progress-header">
      <button className="abandon-btn" title={abandonTitle} onClick={onAbandon}>
        ✕
      </button>
      <span className="progress-text">
        {current} of {total}
      </span>
      <div className="progress-bar">
        {/* Bar reflects questions COMPLETED, not including the current one — reads 0% on Q1. */}
        <div className="progress-fill" style={{ width: `${((current - 1) / total) * 100}%` }}></div>
      </div>
    </div>
  );
}

/** Graph (if any) + KaTeX-rendered question text. */
export function QuestionBody({ question }: { question: QuizQuestion }) {
  return (
    <>
      {question.graph && <Graph key={question.id} graph={question.graph} />}
      <div className="question-text">
        <Katex key={question.id + '-q'} text={question.question} />
      </div>
    </>
  );
}

interface AnswerListProps {
  answers: string[];
  getClassName: (i: number) => string;
  isDisabled: (i: number) => boolean;
  onSelect: (i: number) => void;
}

/** The four A–D answer buttons. Styling/interactivity per button is fully caller-driven. */
export function AnswerList({ answers, getClassName, isDisabled, onSelect }: AnswerListProps) {
  return (
    <div className="answer-list">
      {answers.map((ans, i) => (
        <button
          key={i}
          className={getClassName(i)}
          disabled={isDisabled(i)}
          onClick={() => onSelect(i)}
        >
          <span className="answer-label">{LETTERS[i]}</span>
          <Katex className="answer-text" text={ans} />
        </button>
      ))}
    </div>
  );
}

interface MultiSelectAnswerListProps {
  answers: string[];
  isSelected: (i: number) => boolean;
  getClassName: (i: number) => string;
  isDisabled: (i: number) => boolean;
  onToggle: (i: number) => void;
}

/**
 * Checkbox-style answer list for `answerFormat: 'multiSelect'` — any number of
 * options, any number of them correct. Same shell/state split as AnswerList:
 * this component owns only markup, the caller decides selection/class/disabled.
 */
export function MultiSelectAnswerList({
  answers,
  isSelected,
  getClassName,
  isDisabled,
  onToggle,
}: MultiSelectAnswerListProps) {
  return (
    <div className="answer-list multi-select-list">
      {answers.map((ans, i) => (
        <button
          key={i}
          type="button"
          className={getClassName(i)}
          disabled={isDisabled(i)}
          onClick={() => onToggle(i)}
          aria-pressed={isSelected(i)}
        >
          <span className="answer-checkbox">{isSelected(i) ? '☑' : '☐'}</span>
          <Katex className="answer-text" text={ans} />
        </button>
      ))}
    </div>
  );
}

interface OrderListProps {
  /** Current display order (already shuffled/restored by the caller). */
  items: OrderItem[];
  onReorder: (next: OrderItem[]) => void;
  disabled: boolean;
  /** Optional per-position class, e.g. for Review's correct/incorrect highlight. */
  getClassName?: (i: number) => string;
}

/**
 * Reorderable list for `answerFormat: 'order'` — native HTML5 drag-and-drop,
 * plus Up/Down buttons as a keyboard/touch-friendly fallback (native drag
 * doesn't work on touch screens without extra polyfill work). The caller owns
 * the actual order (in `items`) and persistence; this is shell-only, matching
 * AnswerList/MultiSelectAnswerList.
 */
export function OrderList({ items, onReorder, disabled, getClassName }: OrderListProps) {
  function move(from: number, to: number) {
    if (disabled || to < 0 || to >= items.length || from === to) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onReorder(next);
  }

  function handleDrop(e: React.DragEvent, to: number) {
    e.preventDefault();
    const from = Number(e.dataTransfer.getData('text/plain'));
    if (!Number.isNaN(from)) move(from, to);
  }

  return (
    <div className="order-list">
      {items.map((item, i) => (
        <div
          key={item.id}
          className={'order-item' + (getClassName ? ' ' + getClassName(i) : '')}
          draggable={!disabled}
          onDragStart={(e) => e.dataTransfer.setData('text/plain', String(i))}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => handleDrop(e, i)}
        >
          <span className="order-handle" aria-hidden="true">
            ⠿
          </span>
          <span className="order-index">{i + 1}</span>
          <Katex className="order-text" text={item.text} />
          <span className="order-move-buttons">
            <button
              type="button"
              className="order-move-btn"
              disabled={disabled || i === 0}
              onClick={() => move(i, i - 1)}
              aria-label="Move up"
            >
              ↑
            </button>
            <button
              type="button"
              className="order-move-btn"
              disabled={disabled || i === items.length - 1}
              onClick={() => move(i, i + 1)}
              aria-label="Move down"
            >
              ↓
            </button>
          </span>
        </div>
      ))}
    </div>
  );
}
