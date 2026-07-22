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

  // Flashcard-only, deck-level (not per-card). Omitted = 'flip', today's behavior.
  if (data.inputMode !== undefined && data.inputMode !== 'flip' && data.inputMode !== 'type') {
    errors.push(`Top-level 'inputMode' must be "flip" or "type", found "${String(data.inputMode)}".`);
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

    // answerFormat discriminator. Omitted = 'mcq', today's exact-4/single-correct behavior.
    const validFormats = ['mcq', 'numeric', 'multiSelect', 'order', 'graphClick', 'code', 'command'];
    const answerFormat = q.answerFormat === undefined ? 'mcq' : (q.answerFormat as string);
    if (!validFormats.includes(answerFormat)) {
      errors.push(
        `Question ${n}: 'answerFormat' must be one of ${validFormats.join(', ')}, found "${String(q.answerFormat)}".`
      );
    }

    if (answerFormat === 'mcq') {
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
    } else if (answerFormat === 'multiSelect') {
      let answerCount = 0;
      if (!Array.isArray(q.answers) || q.answers.length === 0) {
        errors.push(`Question ${n}: 'multiSelect' questions require a non-empty 'answers' array.`);
      } else {
        answerCount = q.answers.length;
      }
      if (!Array.isArray(q.correctIndices) || q.correctIndices.length === 0) {
        errors.push(`Question ${n}: 'multiSelect' questions require a non-empty 'correctIndices' array.`);
      } else {
        const indices = q.correctIndices as number[];
        const outOfRange = indices.some((idx) => !Number.isInteger(idx) || idx < 0 || idx >= answerCount);
        const hasDuplicates = new Set(indices).size !== indices.length;
        if (answerCount > 0 && outOfRange) {
          errors.push(`Question ${n}: 'correctIndices' has an index out of range for the given 'answers'.`);
        }
        if (hasDuplicates) {
          errors.push(`Question ${n}: 'correctIndices' contains duplicate indices.`);
        }
      }
    } else if (answerFormat === 'numeric') {
      if (typeof q.correctValue !== 'number') {
        errors.push(`Question ${n}: 'numeric' questions require a numeric 'correctValue'.`);
      }
      if (typeof q.tolerance !== 'number') {
        errors.push(`Question ${n}: 'numeric' questions require a numeric 'tolerance'.`);
      }
      if (q.inputWidget !== undefined && q.inputWidget !== 'text' && q.inputWidget !== 'slider') {
        errors.push(`Question ${n}: 'inputWidget' must be "text" or "slider", found "${String(q.inputWidget)}".`);
      }
      if (q.inputWidget === 'slider') {
        if (typeof q.sliderMin !== 'number' || typeof q.sliderMax !== 'number' || typeof q.sliderStep !== 'number') {
          errors.push(`Question ${n}: slider 'inputWidget' requires numeric 'sliderMin', 'sliderMax', and 'sliderStep'.`);
        } else if (q.sliderMin >= q.sliderMax) {
          errors.push(`Question ${n}: 'sliderMin' must be less than 'sliderMax'.`);
        }
      }
    } else if (answerFormat === 'order') {
      if (!Array.isArray(q.items) || q.items.length < 2) {
        errors.push(`Question ${n}: 'order' questions require an 'items' array with at least 2 entries.`);
      }
      if (!Array.isArray(q.correctOrder) || q.correctOrder.length === 0) {
        errors.push(`Question ${n}: 'order' questions require a non-empty 'correctOrder' array.`);
      } else if (Array.isArray(q.items)) {
        const itemIds = (q.items as Raw[]).map((item) => item.id).filter((id) => id !== undefined);
        const orderIds = q.correctOrder as unknown[];
        const sameSet =
          itemIds.length === orderIds.length &&
          new Set(itemIds).size === itemIds.length &&
          itemIds.every((id) => orderIds.includes(id));
        if (!sameSet) {
          errors.push(`Question ${n}: 'correctOrder' must contain exactly the same ids as 'items', each once.`);
        }
      }
    } else if (answerFormat === 'graphClick') {
      if (q.graph === undefined || q.graph === null) {
        errors.push(`Question ${n}: 'graphClick' questions require a 'graph' object.`);
      } else {
        const g = q.graph as Raw;
        if (g.answerMode !== 'click') {
          errors.push(`Question ${n}: 'graphClick' questions require graph.answerMode to be "click".`);
        }
        const target = g.target as Raw | undefined;
        if (!target || typeof target.x !== 'number' || typeof target.y !== 'number') {
          errors.push(`Question ${n}: 'graphClick' questions require graph.target as { x, y } numbers.`);
        }
        if (typeof g.tolerance !== 'number') {
          errors.push(`Question ${n}: 'graphClick' questions require a numeric graph.tolerance.`);
        }
      }
    } else if (answerFormat === 'code') {
      const validLanguages = ['javascript', 'python', 'java'];
      if (!validLanguages.includes(q.language as string)) {
        errors.push(`Question ${n}: 'code' questions require 'language' to be one of ${validLanguages.join(', ')}.`);
      }
      const checks = q.checks as Raw | undefined;
      if (!checks || (checks.syntax === undefined && checks.structure === undefined && checks.tests === undefined)) {
        errors.push(`Question ${n}: 'code' questions require a 'checks' object with at least one of syntax/structure/tests.`);
      } else if (Array.isArray(checks.tests)) {
        (checks.tests as Raw[]).forEach((t, ti) => {
          if (typeof t.call !== 'string' || typeof t.expect !== 'string') {
            errors.push(`Question ${n}: checks.tests[${ti}] requires string 'call' and 'expect' fields.`);
          }
        });
      }
    } else if (answerFormat === 'command') {
      if (!Array.isArray(q.acceptedAnswers) || q.acceptedAnswers.length === 0) {
        errors.push(`Question ${n}: 'command' questions require a non-empty 'acceptedAnswers' array.`);
      }
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

    // table is optional context, independent of answerFormat.
    if (q.table !== undefined && q.table !== null) {
      const t = q.table as Raw;
      if (!t.title) errors.push(`Question ${n}: Table object is missing 'title'.`);
      if (!Array.isArray(t.headers) || t.headers.length === 0) {
        errors.push(`Question ${n}: Table object requires a non-empty 'headers' array.`);
      }
      if (!Array.isArray(t.rows) || t.rows.length === 0) {
        errors.push(`Question ${n}: Table object requires a non-empty 'rows' array.`);
      } else if (Array.isArray(t.headers)) {
        (t.rows as unknown[]).forEach((row, ri) => {
          if (!Array.isArray(row) || row.length !== (t.headers as unknown[]).length) {
            errors.push(`Question ${n}: Table row ${ri + 1} length doesn't match 'headers' length.`);
          }
        });
      }
    }
  });

  return errors;
}
