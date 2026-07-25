import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // pyWorker.ts dynamically import()s 'pyodide' so the ~1MB loader stays out of
  // the main bundle — that needs code-splitting, which Vite's default "iife"
  // worker format doesn't support (single-chunk only). "es" workers do.
  worker: {
    format: 'es',
  },
});
