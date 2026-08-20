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
  /** Optional context graph, same shape quiz questions use. Context-only —
      `answerMode`/`target`/`tolerance` stay quiz-side. */
  graph?: GraphSpec;
  /** Which face the graph sits on. Omitted = 'front'. */
  graphSide?: 'front' | 'back';
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
  /**
   * The share this deck is linked to, if any — set both on the deck the owner
   * published and on every copy added from that link. It is the dedupe key:
   * clicking a link a second time finds the deck by this rather than by title,
   * so a renamed copy is still recognized as the same study set.
   *
   * When present, the cloud row for this deck stores a POINTER to the shared
   * snapshot (decks.share_token) and no payload of its own — see
   * SupabaseClient.saveDeck.
   */
  shareToken?: string;
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
  /** Card ids in this round's working set. Mastery drops cards mastered in an
   *  earlier session; Standard browses everything. */
  order: string[];
  /**
   * Mastery-mode live rotation; unused in Standard mode. Holds exactly the same
   * ids as `order` for the whole round — every verdict removes a card from the
   * front and puts it back further down, mastered or not — so a round ends on
   * every card being mastered rather than on this emptying.
   */
  queue?: string[];
  /** Position within `order`; unused in mastery mode. */
  currentIdx: number;
  /**
   * Legacy, never written any more: the removed Piles mode saved `'learning'`
   * here to mean "this round runs over the Still Learning subset". Read only so
   * restoreSession can reject such a session instead of resuming it.
   */
  drillMode?: 'all' | 'learning';
  /** Standard only — Mastery always runs the deck's own order. */
  randomOrder: boolean;
  masteryMode: boolean;
}

/**
 * Where one card stands in Mastery mode. Keyed by question id (never index), and
 * persisted per deck, so mastery carries across sessions while the streak toward
 * it is earned inside a single round.
 */
export interface CardProgress {
  /**
   * Consecutive Know Its. 4 means mastered; a Still Learning resets it to 0. A
   * card's first-ever Know It jumps straight to 3 — see `hit()` in
   * features/flashcard/schedule.ts.
   */
  streak: 0 | 1 | 2 | 3 | 4;
  /**
   * ISO time of the last verdict given on this card, in any session. Null means
   * never seen, which is what earns the first-attempt jump to 3.
   */
  lastSeen: string | null;
}

/**
 * Persisted flashcard state for one deck, keyed by DECK ID (see HistoryEntry.id).
 *
 * `cards` is the real state. `known`/`learning` are derived mirrors kept in sync
 * on every write purely for back-compat: the cloud `flash_state` table has only
 * those two columns. Don't write to them directly — `derivePiles()` in
 * features/flashcard/schedule.ts owns their contents.
 */
export interface FlashState {
  known: string[];
  learning: string[];
  session?: FlashSession;
  /** Absent (or in an older shape) on state written before the streak model —
   *  back-filled by `normalize()` on read. */
  cards?: Record<string, CardProgress>;
}
