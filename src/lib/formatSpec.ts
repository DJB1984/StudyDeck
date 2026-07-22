// The AI-facing prompts, composed at build time (?raw) from one shared schema
// contract plus a per-variant "how to respond" intro. This guarantees the
// schema (and the question-quality bar) can never drift between Quick and
// Guided — there's exactly one copy, referenced by both — and needs no
// runtime fetch, so it works offline.
import schemaContract from '../../studydeck-format-spec.md?raw';
import quickIntro from '../../studydeck-quick-intro.md?raw';
import guidedIntro from '../../studydeck-guided-intro.md?raw';

export const QUICK_PROMPT_MD: string = quickIntro + '\n\n---\n\n' + schemaContract;
export const GUIDED_PROMPT_MD: string = guidedIntro + '\n\n---\n\n' + schemaContract;
