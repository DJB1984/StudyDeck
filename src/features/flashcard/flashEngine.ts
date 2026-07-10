// Flashcard engine — pile logic + persistence (spec: src/features/flashcard/Flashcard.spec.md).
// A mutable object (reused across renders via a ref) that mirrors the legacy
// FlashEngine. Piles are keyed by question `id`, never index, so progress
// survives deck reordering. sortCard() is the ONLY method that decides pile
// membership, isolated so a future spaced-repetition scheduler can replace it.

import type { FlashCard } from '../../types';
import { Storage } from '../../lib/Storage';

export interface FlashStartOptions {
  drillMode?: 'all' | 'learning';
  randomOrder?: boolean;
  customDeck?: FlashCard[];
}

export function createFlashEngine(title: string, allQuestions: FlashCard[]) {
  return {
    title,
    allQuestions,
    deck: [] as FlashCard[],
    order: [] as string[],
    currentIdx: 0,
    known: new Set<string>(),
    learning: new Set<string>(),
    roundKnown: new Set<string>(),
    roundLearning: new Set<string>(),
    flipped: false,
    drillMode: 'all' as 'all' | 'learning',
    randomOrder: false,

    // A "round" is one pass through `order`; Know It and Still Learning both just
    // advance currentIdx. The round-complete screen then offers a new round
    // limited to whatever got marked Still Learning this time.
    start(options: FlashStartOptions = {}) {
      const state = Storage.getFlashState(this.title);
      this.known = new Set(state.known);
      this.learning = new Set(state.learning);

      this.drillMode = options.drillMode ?? 'all';
      this.randomOrder = !!options.randomOrder;

      if (options.customDeck) {
        this.deck = options.customDeck;
      } else if (this.drillMode === 'learning') {
        // "Still Learning" = not yet marked Know It — includes never-seen cards.
        this.deck = this.allQuestions.filter((q) => !this.known.has(q.id));
      } else {
        this.deck = this.allQuestions;
      }

      let ids = this.deck.map((q) => q.id);
      if (this.randomOrder) ids = ids.sort(() => Math.random() - 0.5);

      this.order = ids;
      this.currentIdx = 0;
      this.roundKnown = new Set();
      this.roundLearning = new Set();
      this.flipped = false;
    },

    currentCard(): FlashCard | null {
      if (this.currentIdx >= this.order.length) return null;
      return this.allQuestions.find((q) => q.id === this.order[this.currentIdx]) ?? null;
    },

    isComplete(): boolean {
      return this.order.length > 0 && this.currentIdx >= this.order.length;
    },

    progress(): { current: number; total: number } {
      const total = this.order.length;
      const current = Math.min(this.currentIdx + 1, total);
      return { current, total };
    },

    flip() {
      this.flipped = !this.flipped;
    },

    // The only method that decides pile assignment (keep it that way).
    sortCard(pile: 'known' | 'learning') {
      const id = this.order[this.currentIdx];
      if (pile === 'known') {
        this.known.add(id);
        this.learning.delete(id);
        this.roundKnown.add(id);
      } else {
        this.learning.add(id);
        this.known.delete(id);
        this.roundLearning.add(id);
      }
      this.persist();
      this.currentIdx++;
      this.flipped = false;
    },

    // Fresh round using only the cards marked Still Learning in the round that
    // just finished — the "continue with what I missed" step.
    continueWithRoundLearning() {
      const cards = this.allQuestions.filter((q) => this.roundLearning.has(q.id));
      this.start({ customDeck: cards, randomOrder: this.randomOrder });
    },

    persist() {
      Storage.setFlashState(this.title, {
        known: Array.from(this.known),
        learning: Array.from(this.learning),
      });
    },
  };
}

export type FlashEngine = ReturnType<typeof createFlashEngine>;
