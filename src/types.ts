// Shared domain types for StudyDeck. Mirrors the JSON schema in
// docs/core/design-doc.md and prompts/studydeck-quiz-spec.md +
// prompts/studydeck-flashcard-spec.md.

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
  /**
   * Stable per-deck identifier, generated on first save. Mastery state is keyed
   * off this rather than the title, so the scheduling data isn't tied to a
   * mutable display string. Optional on the TYPE only because entries persisted
   * before this existed have no id — `Storage.getHistory()` back-fills one on
   * read, so anything that came out of Storage always has it.
   */
  id?: string;
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
  /** numeric only — the raw text/slider value submitted, undefined if left blank. */
  numericInput?: string;
  /** code only — the submitted source text, undefined if left at/before starterCode-empty. */
  codeInput?: string;
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

/**
 * The in-progress flashcard round, persisted so a reload resumes where the
 * student left off instead of restarting. Local-only: the cloud `flash_state`
 * table stores just the piles, so a hydration simply drops this and the next
 * entry starts fresh.
 */
export interface FlashSession {
  /** Card ids in this round's order (Standard mode). */
  order: string[];
  /** Mastery-mode working queue; unused in Standard mode. */
  queue?: string[];
  /**
   * Mastery-mode runtime that can't be re-derived from the card records,
   * because the records only say where a card SITS, not how it got there.
   * All unused in Standard mode.
   */
  /** Cards in this session's cold-check phase — one hit retires them. */
  coldCheck?: string[];
  /** Mastered cards pulled in for a refresher this round. */
  refresh?: string[];
  /** Cards awaiting a relearn touch, whose next Know It doesn't advance the ladder. */
  relearning?: string[];
  /** Cards already pulled in as rotation filler — each is eligible only once. */
  fillerUsed?: string[];
  /** Cards that reached provisional (or retired) during THIS round, for the tally. */
  learned?: string[];
  /**
   * Local calendar day (YYYY-MM-DD) the mastery round was started on. A round is
   * a day's work: resuming yesterday's unfinished queue would silently skip
   * every cold check that came due overnight, which is the one thing the
   * student came back for.
   */
  startedOn?: string;
  /** Position within `order`; unused in mastery mode. */
  currentIdx: number;
  /**
   * Legacy, never written any more: the removed Piles mode saved `'learning'`
   * here to mean "this round runs over the Still Learning subset". Read only so
   * restoreSession can reject such a session instead of resuming it.
   */
  drillMode?: 'all' | 'learning';
  randomOrder: boolean;
  masteryMode: boolean;
}

/**
 * Where one card sits on the mastery ladder. Keyed by question id (never index).
 *
 * The lifecycle is deliberately finite: three in-session successes make a card
 * *provisional*, one cold hit on a later day masters it. After that it only ever
 * returns as a refresher on a widening interval, a few per session at most —
 * "mastered" still has to be something a student can reach and be done with, so
 * the refresher is a spot-check on that claim, never a fourth rung to climb.
 */
export interface CardProgress {
  /**
   * Ladder rung. 0 = not passed yet, 1-2 = mid-ladder, 3 = provisional: three
   * in a row within one session, now waiting on its next-day cold check.
   */
  step: 0 | 1 | 2 | 3;
  /**
   * Lapses within the CURRENT session only — reset when a session starts. The
   * first costs one rung; the second in the same session resets to 0, because a
   * card missed twice in one sitting genuinely isn't learned.
   */
  lapses: number;
  /** ISO time this provisional card becomes eligible for its cold check; null unless step is 3. */
  dueAt: string | null;
  /** ISO time of the last verdict given on this card. */
  lastSeen: string | null;
  /** Passed its cold check — off the ladder for good, bar the odd refresher. */
  mastered: boolean;
  /**
   * Refreshers this mastered card has passed, which picks its interval out of
   * `REFRESH_DAYS`. The refresher's own due time is derived from `lastSeen`
   * rather than stored, so cards mastered before refreshers existed schedule
   * themselves with no migration — which is also why this is optional: absent
   * reads as 0.
   */
  refreshes?: number;
}

/**
 * Persisted flashcard state for one deck, keyed by DECK ID (see HistoryEntry.id).
 *
 * `cards` is the real state. `known`/`learning` are derived mirrors kept in sync
 * on every write purely for back-compat: the cloud `flash_state` table has only
 * those two columns, and Home's tally reads them. Don't write to them directly —
 * `derivePiles()` in features/flashcard/schedule.ts owns their contents.
 */
export interface FlashState {
  known: string[];
  learning: string[];
  session?: FlashSession;
  /** Absent on state written before the mastery ladder — back-filled on read. */
  cards?: Record<string, CardProgress>;
}
