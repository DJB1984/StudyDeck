// Shared presentational pieces of a "question screen" — used by both
// src/features/quiz/QuizScreen.tsx (Practice/Test) and
// src/features/review/ReviewScreen.tsx (read-only browse). The two screens
// look identical apart from this shell: how an answer gets its class/disabled
// state, and whether picking one does anything, is still entirely owned by
// each screen (scoring/retry-locking in Quiz, always-disabled-and-correct in
// Review) — only the markup and CSS classes are shared here, not any state.

import { useEffect, useRef, useState } from 'react';
import { Katex } from './Math/Katex';
import { Graph } from './Graph/Graph';
import { Table } from './Table/Table';
import type { CodeCheckResult } from '../lib/codeRunners';
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
        {/* Bar reflects questions COMPLETED, not including the current one — reads 0% on Q1.
            scaleX, not width, so the fill animates via transform instead of triggering layout. */}
        <div
          className="progress-fill"
          style={{ transform: `scaleX(${(current - 1) / total})` }}
        ></div>
      </div>
    </div>
  );
}

/** Graph/table context (if any) + KaTeX-rendered question text. */
export function QuestionBody({ question }: { question: QuizQuestion }) {
  return (
    <>
      {question.graph && <Graph key={question.id} graph={question.graph} />}
      {question.table && <Table key={question.id + '-table'} table={question.table} />}
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
 * Reorderable list for `answerFormat: 'order'` — a custom pointer-events-based
 * drag (works identically on mouse and touch, unlike native HTML5 drag-and-drop,
 * which can't do a floating "held" card or live reorder previews and doesn't
 * work on touch screens at all). The dragged item leaves a dashed placeholder
 * in its slot and floats as a clone that tracks the pointer; crossing another
 * item's midpoint live-shifts the rest of the list (insert-style, not a swap).
 * Drag is the primary interaction, but each row also carries Up/Down buttons
 * (`.order-move-btn`, styled to match the drag handle) as a keyboard- and
 * screen-reader-reachable fallback — a move commits immediately via
 * `onReorder`, unlike a drag which only commits on pointer-up. The caller
 * owns the committed order (`items`) and persistence via `onReorder`; this
 * component owns only the drag's own transient, uncommitted preview state.
 */
export function OrderList({ items, onReorder, disabled, getClassName }: OrderListProps) {
  const [liveItems, setLiveItems] = useState(items);
  const [dragId, setDragId] = useState<string | null>(null);
  const [pointerY, setPointerY] = useState(0);
  const grabOffsetRef = useRef(0);
  const containerRectRef = useRef<{ left: number; top: number; width: number } | null>(null);
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  // Kept in sync so the document-level pointerup handler (added once per drag,
  // not re-added on every liveItems change) can always read the latest order.
  const liveItemsRef = useRef(items);
  useEffect(() => {
    liveItemsRef.current = liveItems;
  }, [liveItems]);

  // Reset to the caller's order whenever it changes from outside (e.g. a new
  // question) — but never mid-drag, that would fight the live preview.
  useEffect(() => {
    if (dragId === null) setLiveItems(items);
  }, [items, dragId]);

  // Drag lifecycle lives on `document`, not on the row/handle elements: the
  // dragged row gets swapped out for a placeholder mid-drag (see render below),
  // and an element-scoped listener (or setPointerCapture) would be silently
  // dropped the instant its DOM node unmounts, ending the drag prematurely.
  useEffect(() => {
    if (dragId === null) return;

    function onMove(e: PointerEvent) {
      setPointerY(e.clientY);
      const overEntry = [...itemRefs.current.entries()].find(([, el]) => {
        const rect = el.getBoundingClientRect();
        return e.clientY >= rect.top && e.clientY <= rect.bottom;
      });
      if (!overEntry) return;
      const [overId] = overEntry;
      if (overId === dragId) return;

      setLiveItems((prev) => {
        const from = prev.findIndex((it) => it.id === dragId);
        const to = prev.findIndex((it) => it.id === overId);
        if (from === -1 || to === -1) return prev;
        const next = [...prev];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        return next;
      });
    }

    function onUp() {
      setDragId(null);
      onReorder(liveItemsRef.current);
    }

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragId]);

  function handlePointerDown(e: React.PointerEvent, id: string) {
    if (disabled) return;
    e.preventDefault();
    const rect = itemRefs.current.get(id)?.getBoundingClientRect();
    const listRect = containerRef.current?.getBoundingClientRect();
    if (!rect || !listRect) return;
    grabOffsetRef.current = e.clientY - rect.top;
    containerRectRef.current = { left: listRect.left, top: listRect.top, width: listRect.width };
    setPointerY(e.clientY);
    setDragId(id);
  }

  /** Keyboard/screen-reader fallback for drag: moves and commits in one step. */
  function moveItem(index: number, direction: -1 | 1) {
    if (disabled) return;
    const to = index + direction;
    if (to < 0 || to >= liveItems.length) return;
    const next = [...liveItems];
    const [moved] = next.splice(index, 1);
    next.splice(to, 0, moved);
    setLiveItems(next);
    onReorder(next);
  }

  const draggedItem = liveItems.find((it) => it.id === dragId) ?? null;
  const cloneStyle = containerRectRef.current
    ? {
        position: 'fixed' as const,
        left: containerRectRef.current.left,
        width: containerRectRef.current.width,
        top: pointerY - grabOffsetRef.current,
      }
    : undefined;

  return (
    <div className="order-list" ref={containerRef}>
      {liveItems.map((item, i) => {
        if (item.id === dragId) {
          // Same markup as a real row (hidden via CSS), not an empty div — an
          // empty placeholder collapses to padding-only height, which pulls
          // the next item's top edge up close enough that even a tiny move
          // crosses into it. Matching real-row height keeps hit-testing stable.
          return (
            <div key={item.id} className="order-item order-item-placeholder" aria-hidden="true">
              <span className="order-handle">⠿</span>
              <span className="order-index">{i + 1}</span>
              <Katex className="order-text" text={item.text} />
            </div>
          );
        }
        return (
          <div
            key={item.id}
            ref={(el) => {
              if (el) itemRefs.current.set(item.id, el);
              else itemRefs.current.delete(item.id);
            }}
            className={'order-item' + (getClassName ? ' ' + getClassName(i) : '')}
          >
            <span
              className="order-handle"
              aria-hidden="true"
              onPointerDown={(e) => handlePointerDown(e, item.id)}
            >
              ⠿
            </span>
            <span className="order-index">{i + 1}</span>
            <Katex className="order-text" text={item.text} />
            <span className="order-move-buttons">
              <button
                type="button"
                className="order-move-btn"
                aria-label={`Move item ${i + 1} up`}
                disabled={disabled || i === 0}
                onClick={() => moveItem(i, -1)}
              >
                ▲
              </button>
              <button
                type="button"
                className="order-move-btn"
                aria-label={`Move item ${i + 1} down`}
                disabled={disabled || i === liveItems.length - 1}
                onClick={() => moveItem(i, 1)}
              >
                ▼
              </button>
            </span>
          </div>
        );
      })}

      {draggedItem && (
        <div className="order-item order-item-floating" style={cloneStyle}>
          <span className="order-handle" aria-hidden="true">
            ⠿
          </span>
          <span className="order-index">{liveItems.findIndex((it) => it.id === dragId) + 1}</span>
          <Katex className="order-text" text={draggedItem.text} />
        </div>
      )}
    </div>
  );
}

interface NumericInputProps {
  /** Raw text/slider value, always a string — parsing happens at grading time. */
  value: string;
  onChange: (value: string) => void;
  /** Fired on Enter in the text variant, so it can submit instead of the global
   * keydown handler treating Enter as "advance to next question". */
  onEnter: () => void;
  disabled: boolean;
  inputWidget: 'text' | 'slider';
  sliderMin?: number;
  sliderMax?: number;
  sliderStep?: number;
  /** e.g. correct-answer/wrong-answer highlight after a Practice submit. */
  className?: string;
}

/**
 * Free-response numeric answer for `answerFormat: 'numeric'` — a text field or
 * a slider, chosen per-question via `inputWidget`. Same shell/state split as
 * the other answer components: this owns only markup, the caller owns the
 * value and grading (via answerMatching.matchNumeric).
 */
export function NumericInput({
  value,
  onChange,
  onEnter,
  disabled,
  inputWidget,
  sliderMin,
  sliderMax,
  sliderStep,
  className,
}: NumericInputProps) {
  if (inputWidget === 'slider') {
    const min = sliderMin ?? 0;
    const max = sliderMax ?? 100;
    const step = sliderStep ?? 1;
    const current = value === '' ? min : Number(value);
    const pct = max > min ? ((current - min) / (max - min)) * 100 : 0;
    return (
      <div className={'numeric-slider-wrap' + (className ? ' ' + className : '')}>
        <div className="numeric-slider-value">{current}</div>
        <input
          type="range"
          className="numeric-slider"
          min={min}
          max={max}
          step={step}
          value={current}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          style={{ '--fill-pct': `${pct}%` } as React.CSSProperties}
        />
      </div>
    );
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      className={'numeric-text-input' + (className ? ' ' + className : '')}
      value={value}
      disabled={disabled}
      placeholder="Type your answer"
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onEnter();
      }}
    />
  );
}

/**
 * Pass/fail readout for `answerFormat: 'code'` after a Practice "Run Tests"
 * click — syntax error (if any), structure check, then one row per test case.
 * Caller owns running the check itself (see lib/codeRunners); this only renders
 * the result. `running` shows a lightweight placeholder while a Worker/lazy
 * runtime executes, since that can take a perceptible moment.
 */
export function CodeResultsPanel({
  result,
  running,
  runningLabel = 'Running…',
}: {
  result: CodeCheckResult | null;
  running: boolean;
  runningLabel?: string;
}) {
  if (running) {
    return (
      <div className="code-results code-results-running">
        <span className="code-results-spinner" aria-hidden="true" />
        {runningLabel}
      </div>
    );
  }
  if (!result) return null;

  return (
    <div className={'code-results' + (result.overallPass ? ' correct-answer' : ' wrong-answer')}>
      {!result.syntaxOk && (
        <div className="code-result-row code-result-fail">Syntax error: {result.syntaxError}</div>
      )}
      {result.syntaxOk && result.structureOk !== null && (
        <div className={'code-result-row ' + (result.structureOk ? 'code-result-pass' : 'code-result-fail')}>
          {result.structureOk
            ? 'Structure check passed'
            : `Missing required name(s): ${result.missingNames?.join(', ')}`}
        </div>
      )}
      {result.syntaxOk &&
        result.tests.map((t, i) => (
          <div key={i} className={'code-result-row ' + (t.pass ? 'code-result-pass' : 'code-result-fail')}>
            <code>{t.call}</code> → {t.pass ? 'passed' : t.error ? `error: ${t.error}` : `expected ${t.expect}, got ${t.actual}`}
          </div>
        ))}
    </div>
  );
}