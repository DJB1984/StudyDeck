// answerMatching — shared grading primitives for free-response-shaped answer
// formats (numeric free-response, sliders, fill-in-the-blank sentences,
// type-the-answer flashcards, command-line matching). One matcher per kind of
// comparison, reused everywhere rather than each feature reimplementing
// comparison logic. See docs/question-types/design-doc.md.

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

/**
 * True if `input` matches any of `accepted` as a free-text blank answer.
 *
 * Normalization, in order: straighten curly quotes and apostrophes (a phone
 * keyboard inserts `’` where the deck author typed `'`), collapse internal
 * whitespace, trim, drop trailing sentence punctuation, and lowercase — the
 * last only when `caseSensitive` is false (the default). An empty input never
 * matches, even against an empty accepted string.
 *
 * Deliberately NOT fuzzy: no edit-distance tolerance. One character is often
 * the entire distinction being tested (affect/effect, `Aa`/`aa`, `-r`/`-R`),
 * so a typo is a miss. Real alternates belong in `accepted`.
 */
export function matchBlankText(input: string, accepted: string[], caseSensitive = false): boolean {
  const normalized = normalizeBlank(input, caseSensitive);
  if (normalized === '') return false;
  return accepted.some((candidate) => normalizeBlank(candidate, caseSensitive) === normalized);
}

function normalizeBlank(raw: string, caseSensitive: boolean): string {
  const cleaned = raw
    .replace(/[\u2018\u2019\u02BC]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.,;:!?]+$/, '')
    .trim();
  return caseSensitive ? cleaned : cleaned.toLowerCase();
}
