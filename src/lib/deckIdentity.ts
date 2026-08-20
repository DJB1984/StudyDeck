// deckIdentity — answers "are these the same deck?" without depending on
// titles, ids, or where a deck came from.
//
// Two callers need that answer for different reasons: login migration
// (features/auth/migration.ts) tells "the account's copy of this deck" from
// "a different deck that reused the name", and sharing (features/share/)
// recognizes a deck the student already has so a link opens it instead of
// adding a second copy. Both must agree, so the canonical form lives here once.

import type { Deck, HistoryEntry } from '../types';

/**
 * Stable string form of a deck's CONTENT, independent of key order.
 *
 * Key order matters because `data` round trips through a Postgres `jsonb`
 * column, which does not preserve it. A plain JSON.stringify comparison would
 * report every deck as different and spawn a "(2)" duplicate of the student's
 * whole library on every login.
 */
export function canonicalDeck(deck: Deck): string {
  return JSON.stringify(sortKeys(deck));
}

/**
 * Short hex digest of `canonicalDeck`. Used as the share table's dedupe key
 * (re-sharing a deck returns its existing token) and as sharing's fallback
 * match, so a deck someone already imported as a file is recognized when the
 * same deck arrives by link.
 *
 * Two 32-bit lanes with different seeds, concatenated — cheap, synchronous,
 * and dependency-free. Deliberately NOT crypto.subtle.digest, whose only API
 * is async: every caller here runs inside a synchronous Storage read. This is
 * a collision check between decks a single student holds, not a security
 * boundary — nothing is authorized on the strength of a hash match.
 */
export function deckHash(deck: Deck): string {
  const text = canonicalDeck(deck);
  return lane(text, 0x9e3779b1) + lane(text, 0x85ebca6b);
}

function lane(text: string, seed: number): string {
  let h = seed >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    // FNV-1a's 32-bit prime, via shifts (Math.imul keeps it exact past 2^31).
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) out[key] = sortKeys(source[key]);
    return out;
  }
  return value;
}

/** The first "Title (n)" that nothing in `taken` is using. */
export function freeTitle(base: string, taken: Set<string>): string {
  let n = 2;
  while (taken.has(`${base} (${n})`)) n++;
  return `${base} (${n})`;
}

/**
 * Rename every place the title is load-bearing, not just the history entry —
 * the inner `data.title` is what the cloud upload keys on and what every screen
 * displays, so leaving it alone would give the renamed copy the original's name
 * everywhere except the history list.
 *
 * The id is dropped, not carried: a renamed copy exists precisely BECAUSE it's
 * different content from the deck already holding that name. Keeping the id
 * would file both decks' mastery progress under one key and let one deck's
 * answers mark the other's cards learned. Storage assigns a fresh one on save.
 */
export function retitle(entry: HistoryEntry, title: string): HistoryEntry {
  return {
    ...entry,
    id: undefined,
    name: `${title}.json`,
    title,
    data: { ...entry.data, title },
  };
}
