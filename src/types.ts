// Shared domain types for StudyDeck. Mirrors the JSON schema in
// docs/design-doc.md and studydeck-format-spec.md.

export type DeckType = 'quiz' | 'flashcard';
export type QuizMode = 'practice' | 'test';

export interface GraphSpec {
  type: 'points' | 'equation';
  /** Array of [x, y] pairs for `points`; a JavaScript expression string for `equation`. */
  data: Array<[number, number]> | string;
  x_range?: [number, number];
  y_range?: [number, number];
  x_label: string;
  y_label: string;
  title: string;
}

export interface QuizQuestion {
  id: string;
  question: string;
  answers: string[];
  correct: number;
  graph?: GraphSpec;
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
}

/** A deck as persisted in history, with its metadata. */
export interface HistoryEntry {
  name: string;
  title: string;
  count: number;
  lastOpened: string;
  data: Deck;
}

/** Per-question result. `timeSpent` is populated in test mode only (seconds). */
export interface AnswerRecord {
  id: string;
  firstAttemptCorrect: boolean;
  chosenIndex: number;
  correctIndex: number;
  timeSpent: number | null;
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
  wasRandom: boolean;
}

/** Persisted flashcard pile state, keyed by question id (never index). */
export interface FlashState {
  known: string[];
  learning: string[];
}
