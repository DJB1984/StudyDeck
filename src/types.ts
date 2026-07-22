// Shared domain types for StudyDeck. Mirrors the JSON schema in
// docs/core/design-doc.md and studydeck-format-spec.md.

export type DeckType = 'quiz' | 'flashcard';
export type QuizMode = 'practice' | 'test';

/**
 * Discriminates which shape a quiz question's answer takes. Omitted = 'mcq',
 * today's exact-4-answers/single-`correct`-index behavior — every field added
 * below is optional and additive, so existing decks are unaffected.
 */
export type AnswerFormat = 'mcq' | 'numeric' | 'multiSelect' | 'order' | 'graphClick' | 'code' | 'command';

export interface GraphSpec {
  type: 'points' | 'equation';
  /** Array of [x, y] pairs for `points`; a JavaScript expression string for `equation`. */
  data: Array<[number, number]> | string;
  x_range?: [number, number];
  y_range?: [number, number];
  x_label: string;
  y_label: string;
  title: string;
  /** Omitted = today's context-only graph. 'click' opts into graph-click-to-answer. */
  answerMode?: 'click';
  /** Correct point in data-space (not pixels) — required when `answerMode: 'click'`. */
  target?: { x: number; y: number };
  /** Click-acceptance radius in data units — required when `answerMode: 'click'`. */
  tolerance?: number;
}

/** A single row's real content for a `table` context object. */
export type TableRow = string[];

export interface TableSpec {
  title: string;
  headers: string[];
  rows: TableRow[];
}

/** One item in a drag-to-order question, before shuffling for display. */
export interface OrderItem {
  id: string;
  text: string;
}

export interface CodeCheckTest {
  call: string;
  expect: string;
}

export interface CodeChecks {
  /** Hard gate — code must parse/compile before other checks run. */
  syntax?: boolean;
  /** Static checks independent of execution, e.g. "write a class" prompts. */
  structure?: { requiredNames?: string[] };
  /** Input/output pairs; omit for a pure syntax/structure question. */
  tests?: CodeCheckTest[];
}

export interface QuizQuestion {
  id: string;
  question: string;
  answers: string[];
  correct: number;
  graph?: GraphSpec;
  table?: TableSpec;

  /** Which answer shape this question uses. Omitted = 'mcq' (today's behavior). */
  answerFormat?: AnswerFormat;

  // --- answerFormat: 'multiSelect' ---
  /** Indices of ALL correct answers (not just one) — graded all-or-nothing. */
  correctIndices?: number[];

  // --- answerFormat: 'numeric' ---
  correctValue?: number;
  /** Required alongside correctValue — "close enough" varies per problem. */
  tolerance?: number;
  inputWidget?: 'text' | 'slider';
  sliderMin?: number;
  sliderMax?: number;
  sliderStep?: number;

  // --- answerFormat: 'order' ---
  /** Shuffled for display; grading compares the submitted order to correctOrder. */
  items?: OrderItem[];
  correctOrder?: string[];

  // --- answerFormat: 'code' ---
  language?: 'javascript' | 'python' | 'java';
  starterCode?: string;
  checks?: CodeChecks;

  // --- answerFormat: 'command' ---
  /** Any one of these normalized forms counts as correct — see answerMatching.ts. */
  acceptedAnswers?: string[];
}

export interface FlashCard {
  id: string;
  front: string;
  back: string;
}

export type DeckQuestion = QuizQuestion | FlashCard;

export interface Deck {
  version: number;
  type?: DeckType;
  title: string;
  questions: DeckQuestion[];
  /** Flashcard decks only. Omitted = 'flip' (today's behavior). Deck-level, not per-card. */
  inputMode?: 'flip' | 'type';
}

/** A deck as persisted in history, with its metadata. */
export interface HistoryEntry {
  name: string;
  title: string;
  count: number;
  lastOpened: string;
  data: Deck;
}

/**
 * Per-question result. `timeSpent` is populated in test mode only (seconds).
 * `chosenIndex` is -1 for a question left unanswered (skipped via Back/Next) —
 * it counts as wrong (`firstAttemptCorrect: false`) rather than being omitted.
 * In test mode `firstAttemptCorrect` reflects the FINAL chosen answer, not
 * literally the first pick — the Back button lets you change it any time
 * before finishing, since no feedback is shown to "spend" an attempt on.
 */
export interface AnswerRecord {
  id: string;
  firstAttemptCorrect: boolean;
  /** -1 when unanswered OR when the question's answerFormat doesn't use a single index. */
  chosenIndex: number;
  /** -1 when the question's answerFormat doesn't use a single index (see chosenIndices/chosenOrder instead). */
  correctIndex: number;
  timeSpent: number | null;
  /** multiSelect only. */
  chosenIndices?: number[];
  correctIndices?: number[];
  /** order only — item ids in the order submitted/left at. */
  chosenOrder?: string[];
  correctOrder?: string[];
}

/** The aggregated session, built by Stats after a quiz ends. */
export interface SessionRecord {
  mode: QuizMode;
  totalDuration: number;
  total: number;
  correct: number;
  score: number;
  questions: AnswerRecord[];
}

/** Everything needed to run (and re-run) one quiz session. */
export interface QuizSession {
  deck: Deck;
  questions: QuizQuestion[];
  mode: QuizMode;
  order: number[];
}

/** Persisted flashcard pile state, keyed by question id (never index). */
export interface FlashState {
  known: string[];
  learning: string[];
}
