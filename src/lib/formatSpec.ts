// The AI-facing format spec, imported verbatim from the canonical markdown file
// at build time (?raw). This guarantees the "Copy Format Spec" button always
// matches studydeck-format-spec.md — no hand-maintained copy to drift out of
// sync (Home spec R12) — and needs no runtime fetch, so it works offline.
import formatSpec from '../../studydeck-format-spec.md?raw';

export const FORMAT_SPEC_MD: string = formatSpec;
