// Text helpers for pasted deck content (Home spec R19).

/**
 * Strips a surrounding markdown code fence from pasted AI output.
 * AIs love wrapping JSON replies in ```json ... ``` — this removes a leading
 * ``` (with an optional language tag like `json`) and a trailing ```.
 * Anything without a fence is returned unchanged (aside from trimming).
 */
export function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```[^\n]*\n?([\s\S]*?)\n?```$/);
  return match ? match[1].trim() : trimmed;
}
