// codeRunners — dispatches an `answerFormat: 'code'` question to its
// language's runner. Every runner (present or future) must resolve, never
// throw/reject — an unsupported or crashing language degrades to a failed
// result the UI can render, the same never-throw posture as Graph.tsx.

import type { CodeChecks } from '../../types';
import type { CodeCheckResult } from './types';
import { runJavaScriptChecks } from './javascript';
import { runPythonChecks } from './python';

export type { CodeCheckResult, CodeTestResult } from './types';

/** Only Python currently has a loading phase worth surfacing (Pyodide's WASM bootstrap). */
export type CodeRunProgress = (label: string) => void;

export async function runCodeChecks(
  language: string | undefined,
  code: string,
  checks: CodeChecks,
  onProgress?: CodeRunProgress,
): Promise<CodeCheckResult> {
  switch (language) {
    case 'javascript':
      return runJavaScriptChecks(code, checks);
    case 'python':
      return runPythonChecks(code, checks, onProgress);
    default:
      return {
        syntaxOk: false,
        syntaxError: `The "${language ?? 'unknown'}" runner isn't available in this build yet.`,
        structureOk: null,
        tests: [],
        overallPass: false,
      };
  }
}
