// javascript — the JavaScript language runner for `answerFormat: 'code'`
// questions. Syntax/structure checks are static (Acorn parse, no execution),
// so they run synchronously on the main thread. `checks.tests` actually runs
// student code, so it goes through jsWorker.ts on a dedicated Worker with a
// timeout — see runJavaScriptTests below for the never-hang contract.

import { parse } from 'acorn';
import type { CodeChecks } from '../../types';
import type { CodeCheckResult, CodeTestResult } from './types';

const TEST_TIMEOUT_MS = 3000;

function parseOrNull(code: string): { ok: true } | { ok: false; error: string } {
  try {
    parse(code, { ecmaVersion: 'latest', sourceType: 'script' });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** Acorn nodes are plain objects keyed by `type`; this walks all of them looking
 * for the handful of node shapes that introduce a name into scope, ignoring
 * position bookkeeping fields to avoid wasted recursion. */
function collectDeclaredNames(node: unknown, names: Set<string>): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) collectDeclaredNames(item, names);
    return;
  }
  const n = node as Record<string, unknown>;
  if (typeof n.type === 'string') {
    if (n.type === 'FunctionDeclaration' || n.type === 'ClassDeclaration') {
      const id = n.id as { name?: string } | null;
      if (id?.name) names.add(id.name);
    }
    if (n.type === 'VariableDeclarator') {
      const id = n.id as { name?: string } | null;
      if (id?.name) names.add(id.name);
    }
  }
  for (const key of Object.keys(n)) {
    if (key === 'loc' || key === 'range' || key === 'start' || key === 'end') continue;
    const value = n[key];
    if (value && typeof value === 'object') collectDeclaredNames(value, names);
  }
}

function checkStructure(code: string, requiredNames: string[]): { ok: boolean; missing: string[] } {
  let ast: unknown;
  try {
    ast = parse(code, { ecmaVersion: 'latest', sourceType: 'script' });
  } catch {
    return { ok: false, missing: requiredNames };
  }
  const names = new Set<string>();
  collectDeclaredNames(ast, names);
  const missing = requiredNames.filter((n) => !names.has(n));
  return { ok: missing.length === 0, missing };
}

/** Runs `checks.tests` in a fresh dedicated Worker so a student's infinite
 * loop can only hang that worker — terminated after TEST_TIMEOUT_MS, never
 * the quiz screen. Always resolves, never throws/rejects. */
function runTestsInWorker(code: string, tests: { call: string; expect: string }[]): Promise<CodeTestResult[]> {
  if (tests.length === 0) return Promise.resolve([]);

  return new Promise((resolve) => {
    let settled = false;
    const worker = new Worker(new URL('./jsWorker.ts', import.meta.url), { type: 'module' });

    function finish(results: CodeTestResult[]) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.terminate();
      resolve(results);
    }

    const timer = setTimeout(() => {
      finish(tests.map((t) => ({ call: t.call, expect: t.expect, pass: false, error: 'Timed out — possible infinite loop' })));
    }, TEST_TIMEOUT_MS);

    worker.onmessage = (e: MessageEvent<{ results: CodeTestResult[] }>) => finish(e.data.results);
    worker.onerror = (e) => {
      e.preventDefault();
      finish(tests.map((t) => ({ call: t.call, expect: t.expect, pass: false, error: 'Worker crashed while running tests' })));
    };

    worker.postMessage({ code, tests });
  });
}

export async function runJavaScriptChecks(code: string, checks: CodeChecks): Promise<CodeCheckResult> {
  const syntax = parseOrNull(code);

  // A genuine parse failure makes structure/tests meaningless (nothing to
  // introspect, nothing that can run) — hard-gate regardless of whether
  // `checks.syntax` was explicitly requested.
  if (!syntax.ok) {
    return { syntaxOk: false, syntaxError: syntax.error, structureOk: null, tests: [], overallPass: false };
  }

  let structureOk: boolean | null = null;
  let missingNames: string[] | undefined;
  if (checks.structure?.requiredNames?.length) {
    const structure = checkStructure(code, checks.structure.requiredNames);
    structureOk = structure.ok;
    missingNames = structure.missing;
  }

  const tests = checks.tests?.length ? await runTestsInWorker(code, checks.tests) : [];

  const overallPass = (structureOk === null || structureOk) && tests.every((t) => t.pass);

  return { syntaxOk: true, structureOk, missingNames, tests, overallPass };
}
