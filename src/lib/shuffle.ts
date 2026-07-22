// Order helpers for quiz/flashcard sessions.

/** Natural index order 0..n-1. */
export function naturalOrder(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

/** Fisher-Yates shuffle — returns a new array, never mutates the input. */
export function shuffleArray<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
