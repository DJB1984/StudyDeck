// fillBlank — splits a question sentence into text runs and blank slots.
// Shared by DeckValidation (counting markers), QuizUI (rendering the inline
// inputs) and nothing else: the marker syntax is defined here, once.
//
// A blank is a run of THREE OR MORE underscores (`___`) in `question`. Runs of
// one or two are left alone, so `snake_case` and `some__name` pass through as
// ordinary text. Markers inside `$...$` / `$$...$$` are ignored entirely — a
// subscript chain or a LaTeX rule must never be mistaken for a blank, and
// splitting mid-formula would hand KaTeX half a math span.

export type BlankSegment =
  | { kind: 'text'; text: string }
  | { kind: 'blank'; index: number };

/**
 * Character ranges covered by math delimiters, which the marker scan skips.
 * `$$…$$` is matched before `$…$` for the same reason Katex.tsx orders its
 * delimiters that way — otherwise a display block reads as two empty inline
 * spans. An unbalanced lone `$` simply doesn't match, leaving later markers
 * findable rather than swallowing the rest of the sentence.
 */
function mathRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const re = /\$\$[\s\S]*?\$\$|\$[^$\n]*\$/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    ranges.push([m.index, m.index + m[0].length]);
  }
  return ranges;
}

export function parseBlanks(text: string): BlankSegment[] {
  const skip = mathRanges(text);
  const inMath = (i: number) => skip.some(([start, end]) => i >= start && i < end);

  const segments: BlankSegment[] = [];
  let buffer = '';
  let blankIndex = 0;
  let i = 0;

  const flush = () => {
    if (buffer !== '') {
      segments.push({ kind: 'text', text: buffer });
      buffer = '';
    }
  };

  while (i < text.length) {
    if (text[i] === '_' && !inMath(i)) {
      let j = i;
      while (j < text.length && text[j] === '_') j++;
      if (j - i >= 3) {
        flush();
        segments.push({ kind: 'blank', index: blankIndex++ });
      } else {
        buffer += text.slice(i, j);
      }
      i = j;
      continue;
    }
    buffer += text[i];
    i++;
  }
  flush();

  return segments;
}

/** How many blanks the sentence declares — the number `blanks[]` must match. */
export function countBlanks(text: string): number {
  return parseBlanks(text).reduce((n, seg) => (seg.kind === 'blank' ? n + 1 : n), 0);
}
