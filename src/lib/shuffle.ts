// Order helpers for quiz/flashcard sessions.

/** Natural index order 0..n-1. */
export function naturalOrder(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

/**
 * A shuffled permutation of 0..n-1. Mirrors the legacy `sort(() => Math.random() - 0.5)`
 * approach — order only needs to feel random for study, not be cryptographically uniform.
 */
export function shuffledOrder(n: number): number[] {
  return naturalOrder(n).sort(() => Math.random() - 0.5);
}
