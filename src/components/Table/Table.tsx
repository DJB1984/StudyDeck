// Table — renders a question's optional data table (design-doc.md "Feature: Data tables").
// v1 is context-only, the same role Graph plays: shown above the question text, never itself
// an answer surface. Data reaching here is already shape-validated by DeckValidation (non-empty
// headers, every row matching header length), so unlike Graph there's no parse/execute step that
// can throw — this only maps already-valid arrays into DOM, so no failure/fallback state is needed.

import { useLayoutEffect, useRef, useState } from 'react';
import type { TableSpec } from '../../types';
import { Katex } from '../Math/Katex';

// A column right-aligns — header included — only if EVERY data cell in it looks numeric once
// currency/percent/whitespace/accounting-parens formatting is stripped; a mixed-content column
// stays left-aligned rather than guessing. The header matches its column's data alignment
// (rather than staying left-aligned always) so the two visually sit in the same band — a header
// and its numbers drifting to opposite edges of the column is what actually reads as unclear.
function looksNumeric(cell: string): boolean {
  const stripped = cell.trim().replace(/^\((.*)\)$/, '-$1').replace(/[$,%\s]/g, '');
  return stripped !== '' && !isNaN(Number(stripped));
}

function numericColumns(rows: string[][], columnCount: number): boolean[] {
  return Array.from(
    { length: columnCount },
    (_, col) => rows.length > 0 && rows.every((row) => looksNumeric(row[col] ?? '')),
  );
}

export function Table({ table }: { table: TableSpec }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  function updateFades() {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 1);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }

  // Re-checks whenever the scroll container's own box size changes (e.g. a window
  // resize) — content size is otherwise static per question, and a fresh mount
  // (key={question.id} from the caller) already re-runs this on question change.
  useLayoutEffect(() => {
    updateFades();
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(updateFades);
    observer.observe(el);
    return () => observer.disconnect();
  }, [table]);

  const numericCols = numericColumns(table.rows, table.headers.length);

  return (
    <div className="table-area glass-card">
      <div className="table-scroll" ref={scrollRef} onScroll={updateFades}>
        <table>
          <caption>
            <Katex text={table.title} />
          </caption>
          <thead>
            <tr>
              {table.headers.map((h, i) => (
                <th key={i} className={numericCols[i] ? 'table-cell-numeric' : undefined}>
                  <Katex text={h} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={ci} className={numericCols[ci] ? 'table-cell-numeric' : undefined}>
                    <Katex text={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={'table-fade table-fade-left' + (canScrollLeft ? ' visible' : '')} />
      <div className={'table-fade table-fade-right' + (canScrollRight ? ' visible' : '')} />
    </div>
  );
}
