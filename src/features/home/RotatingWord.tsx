// RotatingWord — one slot of the animated tagline (Home spec R14–R17).
// Cycles through `words` on its own timer with a short vertical roll; two
// instances run staggered intervals so both slots never flip at once.
// prefers-reduced-motion swaps words with no roll (handled in CSS).

import { useEffect, useState } from 'react';

interface RotatingWordProps {
  words: string[];
  /** Cycle length in ms. */
  intervalMs: number;
  /**
   * Phase offset before the schedule starts. Two slots stay collision-free
   * forever when the offset is not a multiple of gcd(intervalA, intervalB) —
   * pick intervals with a large gcd and offset by half of it (see call site).
   */
  initialDelayMs?: number;
}

export function RotatingWord({ words, intervalMs, initialDelayMs = 0 }: RotatingWordProps) {
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    let cycle: number | undefined;
    const flip = () => {
      setLeaving(true); // roll the current word out...
      setTimeout(() => {
        setIndex((i) => (i + 1) % words.length);
        setLeaving(false); // ...then roll the next one in
      }, 250);
    };
    // First flip at initialDelayMs + intervalMs, then every intervalMs.
    const starter = window.setTimeout(() => {
      flip();
      cycle = window.setInterval(flip, intervalMs);
    }, initialDelayMs + intervalMs);
    return () => {
      clearTimeout(starter);
      if (cycle !== undefined) clearInterval(cycle);
    };
  }, [words, intervalMs, initialDelayMs]);

  return (
    <span className="rotating-word-slot" aria-live="polite">
      <span key={index} className={'rotating-word' + (leaving ? ' leaving' : ' entering')}>
        {words[index]}
      </span>
    </span>
  );
}
