// pyWorker — loads Pyodide (a real CPython build compiled to WASM) inside a
// dedicated Worker and runs a Python `answerFormat: 'code'` question's checks.
// Two things this buys by running off the main thread, same as jsWorker.ts:
// (1) the ~13MB runtime download/bootstrap never blocks the quiz screen, and
// (2) a genuine infinite loop in student code only hangs this worker, which
// the caller (see python.ts) terminates after a timeout.
//
// `indexURL: '/pyodide/'` points at the runtime files copied into public/
// (pyodide.asm.wasm, python_stdlib.zip, pyodide-lock.json) — same-origin,
// no CDN, matching the app's existing bundle-everything-locally posture.
// The pyodide *package* import itself is dynamic so the ~1MB JS loader also
// only downloads when a Python code question is actually run.
//
// The worker persists across multiple "Run Tests" clicks (loading Pyodide
// once, reusing it) for responsive retries — python.ts destroys and recreates
// it if a run times out, so a hang never poisons later runs.

interface IncomingMessage {
  code: string;
  requiredNames: string[];
  tests: { call: string; expect: string }[];
}

interface TestOutcome {
  call: string;
  expect: string;
  pass: boolean;
  actual?: string;
  error?: string;
}

interface CheckOutcome {
  syntaxOk: boolean;
  syntaxError?: string;
  structureOk: boolean | null;
  missingNames?: string[];
  tests: TestOutcome[];
}

// Minimal shape of what we actually call on the loaded Pyodide instance.
interface PyodideLike {
  runPython(code: string): unknown;
}

// Pyodide's PythonError.toString() is the full CPython traceback, including
// internal file paths (/lib/python3xx.zip/_pyodide/_base.py, ...) that mean
// nothing to a student. The bottom line is always the actual exception
// (SyntaxError/NameError/etc. + message) — same thing a real Python REPL
// prints last — so surface just that instead of the whole stack.
function cleanPyError(err: unknown): string {
  const lines = String(err).trim().split('\n').filter(Boolean);
  return lines[lines.length - 1] ?? String(err);
}

let pyodidePromise: Promise<PyodideLike> | null = null;

function getPyodide(): Promise<PyodideLike> {
  if (!pyodidePromise) {
    self.postMessage({ status: 'loading' });
    pyodidePromise = (async () => {
      const pyodideModule = (await import('pyodide')) as {
        loadPyodide: (opts: { indexURL: string }) => Promise<PyodideLike>;
      };
      return pyodideModule.loadPyodide({ indexURL: '/pyodide/' });
    })();
  }
  return pyodidePromise;
}

self.onmessage = async (e: MessageEvent<IncomingMessage>) => {
  const { code, requiredNames, tests } = e.data;

  let pyodide: PyodideLike;
  try {
    pyodide = await getPyodide();
    self.postMessage({ status: 'ready' });
  } catch (err) {
    self.postMessage({
      status: 'done',
      result: {
        syntaxOk: false,
        syntaxError: `Python runtime failed to load: ${(err as Error).message}`,
        structureOk: null,
        tests: [],
      } satisfies CheckOutcome,
    });
    return;
  }

  const result: CheckOutcome = { syntaxOk: true, structureOk: null, tests: [] };

  try {
    pyodide.runPython(`import ast\nast.parse(${JSON.stringify(code)})`);
  } catch (err) {
    self.postMessage({
      status: 'done',
      result: { syntaxOk: false, syntaxError: cleanPyError(err), structureOk: null, tests: [] } satisfies CheckOutcome,
    });
    return;
  }

  if (requiredNames.length > 0) {
    try {
      const missingJson = pyodide.runPython(`
import ast, json
__sd_tree = ast.parse(${JSON.stringify(code)})
__sd_names = set()
for __sd_node in ast.walk(__sd_tree):
    if isinstance(__sd_node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
        __sd_names.add(__sd_node.name)
    elif isinstance(__sd_node, ast.Assign):
        for __sd_t in __sd_node.targets:
            if isinstance(__sd_t, ast.Name):
                __sd_names.add(__sd_t.id)
__sd_required = ${JSON.stringify(requiredNames)}
json.dumps([__sd_n for __sd_n in __sd_required if __sd_n not in __sd_names])
`) as string;
      const missingNames = JSON.parse(missingJson) as string[];
      result.structureOk = missingNames.length === 0;
      result.missingNames = missingNames;
    } catch (err) {
      result.structureOk = false;
      result.missingNames = requiredNames;
      void err;
    }
  }

  if (tests.length > 0) {
    let execError: string | null = null;
    try {
      pyodide.runPython(code);
    } catch (err) {
      execError = cleanPyError(err);
    }

    for (const t of tests) {
      if (execError) {
        result.tests.push({ call: t.call, expect: t.expect, pass: false, error: execError });
        continue;
      }
      try {
        const out = pyodide.runPython(`
import json
def __sd_stringify(v):
    try:
        return json.dumps(v)
    except Exception:
        return repr(v)
__sd_actual = (${t.call})
__sd_expected = (${t.expect})
json.dumps({"pass": __sd_actual == __sd_expected, "actual": __sd_stringify(__sd_actual)})
`) as string;
        const parsed = JSON.parse(out) as { pass: boolean; actual: string };
        result.tests.push({ call: t.call, expect: t.expect, pass: parsed.pass, actual: parsed.actual });
      } catch (err) {
        result.tests.push({ call: t.call, expect: t.expect, pass: false, error: cleanPyError(err) });
      }
    }
  }

  self.postMessage({ status: 'done', result });
};
