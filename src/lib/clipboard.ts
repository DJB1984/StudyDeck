// Clipboard — builds the "copy to AI" explanation prompt for a question and the
// student's chosen answer. A pasted prompt has no access to the rendered chart,
// so a graph is described in text (an LLM reasons over coordinates/equations
// fine, and it keeps the prompt copy-paste-able).

import type { QuizQuestion, GraphSpec } from '../types';

const LETTERS = ['A', 'B', 'C', 'D'];

function buildGraphDescription(graph: GraphSpec): string {
  const lines = [`[Graph: "${graph.title}"]`, `X-axis: ${graph.x_label}`, `Y-axis: ${graph.y_label}`];
  if (graph.type === 'points' && Array.isArray(graph.data)) {
    lines.push('Data points: ' + graph.data.map(([x, y]) => `(${x}, ${y})`).join(', '));
  } else if (graph.type === 'equation') {
    lines.push(`Equation: y = ${graph.data}`);
    if (graph.x_range) lines.push(`X range: [${graph.x_range[0]}, ${graph.x_range[1]}]`);
  }
  if (graph.y_range) lines.push(`Y range: [${graph.y_range[0]}, ${graph.y_range[1]}]`);
  return lines.join('\n');
}

export function buildPrompt(question: QuizQuestion, chosenIndex: number): string {
  const lines: string[] = [
    `Explain why "${question.answers[question.correct]}" is the correct answer for this question:`,
    '',
    question.question,
  ];
  if (question.graph) {
    lines.push('', buildGraphDescription(question.graph));
  }
  lines.push(
    '',
    'The options were:',
    ...question.answers.map((a, i) => `${LETTERS[i]}) ${a}`),
    '',
    `I chose: ${question.answers[chosenIndex]}`,
  );
  return lines.join('\n');
}

/**
 * Writes text to the clipboard and briefly flips a button's label to "Copied!".
 * Shared by every copy-to-AI button so the feedback behavior stays consistent.
 */
export function copyWithFeedback(
  text: string,
  setLabel: (label: string) => void,
  original: string,
  copiedLabel = 'Copied!',
): void {
  navigator.clipboard
    .writeText(text)
    .then(() => {
      setLabel(copiedLabel);
      setTimeout(() => setLabel(original), 1500);
    })
    .catch((err) => console.warn('Clipboard write failed:', err));
}
