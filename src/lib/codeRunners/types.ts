// Shared result shapes for every language runner in src/lib/codeRunners/.
// One shape so QuizScreen/ReviewScreen render pass/fail UI identically
// regardless of which language actually produced the result.

export interface CodeTestResult {
  call: string;
  expect: string;
  pass: boolean;
  /** Stringified actual value, when execution completed without error. */
  actual?: string;
  /** Set when the call/expect expression itself threw (never a thrown crash to the caller). */
  error?: string;
}

export interface CodeCheckResult {
  syntaxOk: boolean;
  syntaxError?: string;
  /** null = checks.structure.requiredNames wasn't configured, so not applicable. */
  structureOk: boolean | null;
  missingNames?: string[];
  tests: CodeTestResult[];
  overallPass: boolean;
}
