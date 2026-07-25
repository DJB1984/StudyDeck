// CodeEditor — CodeMirror 6 wrapper for `answerFormat: 'code'` questions.
//
// Editor choice: CodeMirror 6 over Monaco. Monaco needs a web-worker build step
// (vite-plugin-monaco-editor or manual worker config) and ships as a multi-MB
// single blob; CodeMirror 6 is modular (separate @codemirror/lang-* packages),
// has official language packages for all three target languages (javascript,
// python, java), and its per-language grammar packages are small enough to
// import statically here — unlike the actual Pyodide/CheerpJ WASM *runtimes*
// (tens of MB), which stay dynamically imported (see lib/codeRunners).
//
// Same never-throw posture as Graph.tsx: mounting a CodeMirror instance is
// normally safe (the parser tolerates malformed source, producing error nodes
// rather than throwing), but a bad extension config is still guarded so a
// broken code question degrades to a plain textarea instead of crashing.

import { useEffect, useRef, useState } from 'react';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';
import { basicSetup } from 'codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { java } from '@codemirror/lang-java';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import type { QuizQuestion } from '../../types';

// Palette restricted to existing tokens (no new colors, no Nebula — that
// gradient is reserved for the brand mark/hero only per DESIGN.md's
// Nebula-Is-Rare Rule and must never be used as chart/decoration color).
const starfieldHighlight = HighlightStyle.define([
  { tag: tags.keyword, color: 'var(--accent-light)' },
  { tag: tags.comment, color: 'var(--text-secondary)', fontStyle: 'italic' },
  { tag: [tags.string, tags.special(tags.string)], color: 'var(--correct)' },
  { tag: [tags.number, tags.bool, tags.atom], color: 'var(--accent)' },
  { tag: [tags.definition(tags.variableName), tags.function(tags.variableName)], color: 'var(--text-primary)' },
  { tag: tags.propertyName, color: 'var(--text-primary)' },
  { tag: tags.operator, color: 'var(--text-secondary)' },
  { tag: [tags.typeName, tags.className], color: 'var(--accent)' },
]);

const starfieldTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: 'var(--surface)',
      color: 'var(--text-primary)',
      fontSize: '0.9rem',
    },
    '.cm-content': { fontFamily: 'var(--font-mono)', padding: '12px 0', caretColor: 'var(--accent-light)' },
    '.cm-gutters': {
      backgroundColor: 'var(--surface)',
      color: 'var(--text-secondary)',
      border: 'none',
      borderRight: '1px solid var(--border)',
    },
    '.cm-activeLine': { backgroundColor: 'var(--surface-hover)' },
    '.cm-activeLineGutter': { backgroundColor: 'var(--surface-hover)' },
    '&.cm-focused': { outline: 'none' },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
      backgroundColor: 'rgba(48,147,236,0.25) !important',
    },
    '.cm-scroller': { overflow: 'auto' },
  },
  { dark: true },
);

export type CodeLanguage = NonNullable<QuizQuestion['language']>;

function languageExtension(language: CodeLanguage) {
  switch (language) {
    case 'python':
      return python();
    case 'java':
      return java();
    default:
      return javascript();
  }
}

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language: CodeLanguage;
  readOnly?: boolean;
}

export function CodeEditor({ value, onChange, language, readOnly = false }: CodeEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [failed, setFailed] = useState(false);

  // Recreated whenever language/readOnly changes. Callers key this component
  // by question id, so a fresh instance per question is simpler than
  // reconfiguring an existing one via Compartments.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    try {
      const state = EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          keymap.of([indentWithTab]),
          languageExtension(language),
          syntaxHighlighting(starfieldHighlight),
          starfieldTheme,
          EditorView.editable.of(!readOnly),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString());
          }),
        ],
      });
      const view = new EditorView({ state, parent: host });
      viewRef.current = view;
      setFailed(false);
    } catch (err) {
      console.warn('CodeEditor failed to mount:', (err as Error).message);
      setFailed(true);
    }

    return () => {
      viewRef.current?.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, readOnly]);

  // Sync external value changes (e.g. switching questions without remounting,
  // or a future "reset to starter code" action) without fighting the user's
  // own typing — only dispatch when the doc actually differs.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }
  }, [value]);

  if (failed) {
    return (
      <textarea
        className="code-editor code-editor-fallback"
        value={value}
        readOnly={readOnly}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
      />
    );
  }

  return <div className="code-editor" ref={hostRef} />;
}
