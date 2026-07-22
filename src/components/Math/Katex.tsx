// Katex — renders LaTeX embedded in deck text (spec: src/components/Math/Katex.spec.md).
// $$...$$ → display math, $...$ → inline. Runs with throwOnError:false so malformed
// LaTeX degrades to its raw source string instead of crashing the host component.

import { createElement, useLayoutEffect, useRef } from 'react';
import type { ElementType, MouseEvent } from 'react';
import renderMathInElement from 'katex/contrib/auto-render';

// R1: $$ (display) must be matched before $ (inline) so a block isn't parsed as
// two empty inline spans. R2: throwOnError:false is the non-negotiable safety net.
export function renderMath(el: HTMLElement): void {
  try {
    renderMathInElement(el, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false },
      ],
      throwOnError: false,
    });
  } catch {
    // R4: never let an unexpected KaTeX error crash the host — leave plain text.
  }
}

interface KatexProps {
  text: string;
  /** Element tag to render into (default span). */
  as?: ElementType;
  className?: string;
  /** Passthrough hover handlers (e.g. a custom tooltip keyed off the rendered element). */
  onMouseEnter?: (e: MouseEvent<HTMLElement>) => void;
  onMouseLeave?: (e: MouseEvent<HTMLElement>) => void;
}

/**
 * Sets the raw text imperatively then runs KaTeX auto-render over it — the same
 * approach as the legacy app, which keeps KaTeX's DOM mutations from fighting
 * React reconciliation.
 */
export function Katex({ text, as = 'span', className, onMouseEnter, onMouseLeave }: KatexProps) {
  const ref = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.textContent = text;
    renderMath(el);
  }, [text]);

  return createElement(as, { ref, className, onMouseEnter, onMouseLeave });
}
