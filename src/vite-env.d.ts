/// <reference types="vite/client" />

// Raw markdown imports (e.g. the format spec embedded for the Copy button).
declare module '*.md?raw' {
  const content: string;
  export default content;
}

// KaTeX's auto-render contrib module ships without bundled type declarations.
declare module 'katex/contrib/auto-render' {
  interface RenderMathInElementOptions {
    delimiters?: Array<{ left: string; right: string; display: boolean }>;
    ignoredTags?: string[];
    ignoredClasses?: string[];
    throwOnError?: boolean;
    errorCallback?: (msg: string, err: Error) => void;
    macros?: Record<string, string>;
  }
  export default function renderMathInElement(
    elem: HTMLElement,
    options?: RenderMathInElementOptions,
  ): void;
}
