// answerMatching — shared grading primitives for free-response-shaped answer
// formats (numeric free-response, sliders, type-the-answer flashcards,
// command-line matching). One matcher, reused everywhere rather than each
// feature reimplementing comparison logic. See docs/question-types/design-doc.md.

/** True if `input` parses as a number within `tolerance` of `correctValue`. */
export function matchNumeric(input: string, correctValue: number, tolerance: number): boolean {
  const parsed = Number(input.trim());
  if (Number.isNaN(parsed) || input.trim() === '') return false;
  return Math.abs(parsed - correctValue) <= tolerance;
}

/**
 * True if `input`, normalized, matches any of `accepted` similarly normalized.
 * Normalization: collapse whitespace, and decompose combined POSIX short-flag
 * clusters (`-la`) into an order-independent set of single-char flags, so
 * `-la`, `-al`, and `-l -a` all compare equal. Everything else (the base
 * command, positional args, long `--flag` forms) compares literally — genuine
 * syntax differences (`grep -r` vs `grep --recursive`) are NOT unified
 * automatically and must be listed explicitly in `accepted`.
 */
export function matchNormalizedString(input: string, accepted: string[]): boolean {
  const normalized = normalizeCommand(input);
  return accepted.some((candidate) => normalizeCommand(candidate) === normalized);
}

function normalizeCommand(raw: string): string {
  const tokens = raw.trim().split(/\s+/).filter(Boolean);
  const rest: string[] = [];
  const flags: string[] = [];

  for (const token of tokens) {
    if (/^-[a-zA-Z]+$/.test(token)) {
      flags.push(...token.slice(1).split(''));
    } else {
      rest.push(token);
    }
  }

  return [...rest, ...flags.sort()].join(' ');
}
