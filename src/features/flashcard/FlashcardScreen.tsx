// Flashcard screen — Quizlet-style flip + Know It / Still Learning piles
// (spec: src/features/flashcard/Flashcard.spec.md). Wraps the mutable flashEngine
// in a ref and forces re-renders after mutations, matching the legacy flow while
// staying inside React.

import { useEffect, useReducer, useRef, useState } from 'react';
import type { Deck, FlashCard } from '../../types';
import { Katex } from '../../components/Math/Katex';
import { Storage } from '../../lib/Storage';
import { createFlashEngine, type FlashEngine } from './flashEngine';

interface FlashcardScreenProps {
  deck: Deck;
  onBack: () => void;
}

export function FlashcardScreen({ deck, onBack }: FlashcardScreenProps) {
  const engineRef = useRef<FlashEngine | null>(null);
  if (!engineRef.current) {
    // R12: entered directly from opening a flashcard deck — fresh full-deck
    // session, drill off, random off; the screen's own toggles take over.
    engineRef.current = createFlashEngine(deck.title, deck.questions as FlashCard[]);
    engineRef.current.start({ drillMode: 'all', randomOrder: false });
  }
  const eng = engineRef.current;

  const [, force] = useReducer((x: number) => x + 1, 0);
  const [drillOn, setDrillOn] = useState(false);
  const [randomOn, setRandomOn] = useState(false);
  const [sortAnim, setSortAnim] = useState<'known' | 'learning' | null>(null);
  const sortingRef = useRef(false);

  // R7: toggling either option restarts the session from the top.
  function onDrillToggle(checked: boolean) {
    setDrillOn(checked);
    eng.start({ drillMode: checked ? 'learning' : 'all', randomOrder: eng.randomOrder });
    force();
  }
  function onRandomToggle(checked: boolean) {
    setRandomOn(checked);
    eng.start({ drillMode: eng.drillMode, randomOrder: checked });
    force();
  }

  // R2: debounce sorting for the animation window so cards aren't skipped.
  function sort(pile: 'known' | 'learning') {
    if (sortingRef.current) return;
    sortingRef.current = true;
    setSortAnim(pile);
    window.setTimeout(() => {
      eng.sortCard(pile);
      setSortAnim(null);
      sortingRef.current = false;
      force();
    }, 350);
  }

  function flip() {
    if (eng.isComplete() || sortingRef.current) return; // R1
    eng.flip();
    force();
  }

  function restartAll() {
    setDrillOn(false);
    eng.start({ drillMode: 'all', randomOrder: eng.randomOrder });
    force();
  }

  function continueLearning() {
    setDrillOn(false);
    eng.continueWithRoundLearning();
    force();
  }

  // R1 (keyboard): space/Enter flips the card.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        flip();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auth.spec.md R15: re-read this deck's pile state after a login-time
  // hydration/migration bulk-overwrites the local cache.
  useEffect(() => {
    return Storage.subscribe(() => {
      eng.start({ drillMode: eng.drillMode, randomOrder: eng.randomOrder });
      force();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emptyFromStart = eng.deck.length === 0; // R11
  const complete = !emptyFromStart && eng.isComplete(); // R9
  const showComplete = emptyFromStart || complete;

  const card = eng.currentCard();
  const progress = eng.progress();

  const total = eng.order.length;
  const knownCount = eng.roundKnown.size;
  const learningCount = eng.roundLearning.size;

  const cardClass =
    (eng.flipped ? 'flipped ' : '') +
    (sortAnim === 'known' ? 'sort-known' : sortAnim === 'learning' ? 'sort-learning' : '');

  return (
    <section id="flashcard-screen" className="screen">
      <div className="screen-header">
        <button className="btn-ghost" onClick={onBack}>
          ← Back
        </button>
        <h2>Flashcards</h2>
        <span className="review-progress-text">
          {showComplete ? '' : `Card ${progress.current} of ${progress.total}`}
        </span>
      </div>

      <div className="flash-options">
        <label className="toggle-label">
          <input
            type="checkbox"
            checked={drillOn}
            onChange={(e) => onDrillToggle(e.target.checked)}
          />
          <span className="toggle-track"></span>
          Drill Still Learning only
        </label>
        <label className="toggle-label">
          <input
            type="checkbox"
            checked={randomOn}
            onChange={(e) => onRandomToggle(e.target.checked)}
          />
          <span className="toggle-track"></span>
          Random order
        </label>
      </div>

      {!showComplete && card && (
        <div id="flash-active-area">
          <div id="flash-card-wrap">
            <div id="flash-card" key={card.id} className={cardClass} onClick={flip}>
              <div className="card-inner">
                <div className="card-front">
                  <Katex text={card.front} />
                </div>
                <div className="card-back">
                  <Katex text={card.back} />
                </div>
              </div>
            </div>
          </div>

          <p className="flash-hint">Click card to flip</p>

          <div className="flash-actions">
            <button className="btn-ghost" onClick={() => sort('learning')}>
              Still Learning
            </button>
            <button className="btn" onClick={() => sort('known')}>
              Know It
            </button>
          </div>
        </div>
      )}

      {showComplete && (
        <div id="flash-complete-area">
          <div className="glass-card flash-complete-card">
            {emptyFromStart ? (
              <>
                <h3>All Caught Up!</h3>
                <p>Every card in this deck is already marked Know It — nothing left to drill.</p>
              </>
            ) : (
              <>
                <h3>Round Complete</h3>
                <p>
                  {learningCount > 0
                    ? `${knownCount} / ${total} known. ${learningCount} card(s) marked Still Learning this round.`
                    : `${knownCount} / ${total} known — nailed every card this round!`}
                </p>
              </>
            )}
            <div className="stats-actions" style={{ justifyContent: 'center' }}>
              <button className="btn-ghost" onClick={restartAll}>
                Restart All
              </button>
              {!emptyFromStart && learningCount > 0 && (
                <button className="btn" onClick={continueLearning}>
                  Continue with Still Learning
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
