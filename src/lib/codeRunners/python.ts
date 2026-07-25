// python — the Python language runner for `answerFormat: 'code'` questions,
// backed by Pyodide (a real CPython-on-WASM build) running inside pyWorker.ts.
// Unlike the JavaScript runner, loading the runtime itself can take a few
// seconds on first use — `onProgress` lets the UI show "Loading Python
// runtime…" during that window rather than a silent hang (see the PRD's
// lazy-load requirement). The worker is a lazily-created singleton reused
// across retries so it isn't re-bootstrapped on every "Run Tests" click;
// a timeout destroys it so a hang never poisons later runs.

import type { CodeChecks } from '../../types';
import type { CodeCheckResult, CodeTestResult } from './types';

const RUN_TIMEOUT_MS = 20000; // generous — first call includes the Pyodide bootstrap

let worker: Worker | null = null;

function getWorker(): Worker {
  if (!worker) worker = new Worker(new URL('./pyWorker.ts', import.meta.url), { type: 'module' });
  return worker;
}

function destroyWorker() {
  worker?.terminate();
  worker = null;
}

interface WorkerResult {
  syntaxOk: boolean;
  syntaxError?: string;
  structureOk: boolean | null;
  missingNames?: string[];
  tests: CodeTestResult[];
}

export function runPythonChecks(
  code: string,
  checks: CodeChecks,
  onProgress?: (label: string) => void,
): Promise<CodeCheckResult> {
  const tests = checks.tests ?? [];
  const requiredNames = checks.structure?.requiredNames ?? [];

  return new Promise((resolve) => {
    let settled = false;
    const w = getWorker();

    function finish(result: WorkerResult) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
      const overallPass =
        result.syntaxOk && (result.structureOk === null || result.structureOk) && result.tests.every((t) => t.pass);
      resolve({ ...result, overallPass });
    }

    const timer = setTimeout(() => {
      destroyWorker(); // hung — kill it; the next run starts a fresh worker
      finish({
        syntaxOk: false,
        syntaxError: 'Timed out — possible infinite loop, or the Python runtime failed to load',
        structureOk: null,
        tests: tests.map((t) => ({ call: t.call, expect: t.expect, pass: false, error: 'Timed out' })),
      });
    }, RUN_TIMEOUT_MS);

    function onMessage(e: MessageEvent<{ status: 'loading' | 'ready' | 'done'; result?: WorkerResult }>) {
      if (e.data.status === 'loading') {
        onProgress?.('Loading Python runtime…');
        return;
      }
      if (e.data.status === 'ready') {
        onProgress?.('Running…');
        return;
      }
      finish(e.data.result!);
    }

    function onError() {
      destroyWorker();
      finish({ syntaxOk: false, syntaxError: 'Python worker crashed', structureOk: null, tests: [] });
    }

    w.addEventListener('message', onMessage);
    w.addEventListener('error', onError);
    w.postMessage({ code, requiredNames, tests });
  });
}
