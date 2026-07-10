// DeckValidation — field-level, actionable validation of an already-parsed deck
// object (spec: src/lib/DeckValidation.spec.md). Returns an array of error
// strings; empty means valid. The deck is rejected as a WHOLE on any error —
// never silently skip bad questions.

// Input is untrusted JSON, so we validate against `unknown` / loose shapes.
type Raw = Record<string, unknown>;

export function validateDeck(data: Raw): string[] {
  const errors: string[] = [];

  // R2/R3: absent version errors; a present non-1 version only warns.
  if (data.version === undefined || data.version === null) {
    errors.push("Missing top-level 'version' field.");
  } else if (data.version !== 1) {
    console.warn('StudyDeck: unknown version', data.version, '— proceeding anyway');
  }

  // R4
  if (!data.title || typeof data.title !== 'string') {
    errors.push("Missing or invalid top-level 'title' field.");
  }

  // R5: type optional, defaults to quiz; anything else is a typo, not coerced.
  const deckType = data.type === undefined ? 'quiz' : data.type;
  if (deckType !== 'quiz' && deckType !== 'flashcard') {
    errors.push(`Top-level 'type' must be "quiz" or "flashcard", found "${String(data.type)}".`);
  }

  // R6/R7: questions must be a non-empty array; bail early otherwise.
  if (!Array.isArray(data.questions)) {
    errors.push("Missing top-level 'questions' array.");
    return errors;
  }
  if (data.questions.length === 0) {
    errors.push("'questions' array is empty.");
    return errors;
  }

  (data.questions as Raw[]).forEach((q, i) => {
    const n = i + 1; // R8: 1-based numbering to match a human counting questions.
    if (!q.id) errors.push(`Question ${n}: Missing 'id' field.`);

    if (deckType === 'flashcard') {
      // R9
      if (!q.front) errors.push(`Question ${n}: Missing 'front' field.`);
      if (!q.back) errors.push(`Question ${n}: Missing 'back' field.`);
      return;
    }

    // R10
    if (!q.question) errors.push(`Question ${n}: Missing 'question' field.`);

    // R11
    if (!Array.isArray(q.answers)) {
      errors.push(`Question ${n}: Missing 'answers' array.`);
    } else if (q.answers.length !== 4) {
      errors.push(`Question ${n}: Expected exactly 4 answer choices, found ${q.answers.length}.`);
    }

    // R12
    if (q.correct === undefined || q.correct === null) {
      errors.push(`Question ${n}: Missing 'correct' field.`);
    } else if (!Number.isInteger(q.correct) || (q.correct as number) < 0 || (q.correct as number) > 3) {
      errors.push(`Question ${n}: 'correct' index ${q.correct} is out of range (0–3).`);
    }

    // R13/R14/R15: graph is optional; only checked when present.
    if (q.graph !== undefined && q.graph !== null) {
      const g = q.graph as Raw;
      if (!g.type) errors.push(`Question ${n}: Graph object is missing 'type'.`);
      if (!g.x_label) errors.push(`Question ${n}: Graph object is missing 'x_label'.`);
      if (!g.y_label) errors.push(`Question ${n}: Graph object is missing 'y_label'.`);
      if (!g.title) errors.push(`Question ${n}: Graph object is missing 'title'.`);
      if (g.type === 'equation' && !g.x_range) {
        errors.push(`Question ${n}: Equation graph requires 'x_range'.`);
      }
      if (g.x_range !== undefined && (!Array.isArray(g.x_range) || g.x_range.length !== 2)) {
        errors.push(`Question ${n}: Graph 'x_range' must be a [min, max] array.`);
      }
      if (g.y_range !== undefined && (!Array.isArray(g.y_range) || g.y_range.length !== 2)) {
        errors.push(`Question ${n}: Graph 'y_range' must be a [min, max] array.`);
      }
    }
  });

  return errors;
}
