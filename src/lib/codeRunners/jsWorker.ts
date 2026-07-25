// jsWorker — runs a JavaScript code question's `checks.tests` off the main
// thread. Student code can contain a genuine infinite loop; running it here
// means a hang only blocks this dedicated worker, which the caller (see
// runJavaScriptTests in javascript.ts) terminates after a timeout — the quiz
// screen itself never freezes. `postMessage`/`onmessage`/`MessageEvent` are
// typed via the DOM lib (already in tsconfig.app.json) since Window declares
// the same shapes as a Worker's global scope for these particular APIs —
// no separate "webworker" lib/tsconfig needed for this one file.

interface IncomingTest {
  call: string;
  expect: string;
}

interface OutgoingResult {
  call: string;
  expect: string;
  pass: boolean;
  actual?: string;
  error?: string;
}

function stringify(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value);
  try {
    const s = JSON.stringify(value);
    return s === undefined ? String(value) : s;
  } catch {
    return String(value);
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

self.onmessage = (e: MessageEvent<{ code: string; tests: IncomingTest[] }>) => {
  const { code, tests } = e.data;

  const results: OutgoingResult[] = tests.map((t) => {
    let expected: unknown;
    try {
      expected = new Function(`"use strict";\nreturn (${t.expect});`)();
    } catch (err) {
      return { call: t.call, expect: t.expect, pass: false, error: `bad 'expect' expression: ${(err as Error).message}` };
    }
    try {
      const actual = new Function(`"use strict";\n${code}\nreturn (${t.call});`)();
      return { call: t.call, expect: t.expect, pass: deepEqual(actual, expected), actual: stringify(actual) };
    } catch (err) {
      return { call: t.call, expect: t.expect, pass: false, error: (err as Error).message };
    }
  });

  self.postMessage({ results });
};
