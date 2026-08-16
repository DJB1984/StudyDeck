// Flashcard screen — Quizlet-style flip + Know It / Still Learning piles.
// Wraps the mutable flashEngine in a ref and forces re-renders after
// mutations, matching the legacy flow while staying inside React.

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
    // R12: entered directly from opening a flashcard deck — resumes a saved
    // unfinished session (same card, same toggles), else a fresh full-deck
    // session with drill off and random off.
    engineRef.current = createFlashEngine(deck.title, deck.questions as FlashCard[]);
    engineRef.current.start({ drillMode: 'all', randomOrder: false, masteryMode: false });
  }
  const eng = engineRef.current;

  const [, force] = useReducer((x: number) => x + 1, 0);
  // Seeded from the engine so a resumed session shows the toggles it was started with.
  const [drillOn, setDrillOn] = useState(() => eng.drillMode === 'learning');
  const [randomOn, setRandomOn] = useState(() => eng.randomOrder);
  const [masteryOn, setMasteryOn] = useState(() => eng.masteryMode);
  const [sortAnim, setSortAnim] = useState<'known' | 'learning' | null>(null);
  const sortingRef = useRef(false);

  // R7/R18: toggling any option restarts the session from the top — an explicit
  // restart, so it never resumes the saved session. Each handler passes the other
  // two options through from the engine, so flipping one never silently clears
  // the others.
  function onDrillToggle(checked: boolean) {
    setDrillOn(checked);
    eng.start({
      drillMode: checked ? 'learning' : 'all',
      randomOrder: eng.randomOrder,
      masteryMode: eng.masteryMode,
      forceRestart: true,
    });
    force();
  }
  function onRandomToggle(checked: boolean) {
    setRandomOn(checked);
    eng.start({
      drillMode: eng.drillMode,
      randomOrder: checked,
      masteryMode: eng.masteryMode,
      forceRestart: true,
    });
    force();
  }
  function onMasteryToggle(checked: boolean) {
    setMasteryOn(checked);
    eng.start({
      drillMode: eng.drillMode,
      randomOrder: eng.randomOrder,
      masteryMode: checked,
      forceRestart: true,
    });
    force();
  }

  // R2: debounce sorting for the animation window so cards aren't skipped.
  function sort(pile: 'known' | 'learning') {
    if (sortingRef.current || eng.isComplete() || !eng.currentCard()) return;
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

  // R17: undo the last sort. Shares flip/sort's `sortingRef` lock so it can't
  // race an in-flight sort animation (which would undo a sort the engine hasn't
  // applied yet, or step back off a card mid-slide).
  function undoSort() {
    if (sortingRef.current || eng.isComplete() || !eng.canGoBack()) return;
    eng.goBack();
    force();
  }

  function restartAll() {
    setDrillOn(false);
    eng.start({
      drillMode: 'all',
      randomOrder: eng.randomOrder,
      masteryMode: eng.masteryMode,
      forceRestart: true,
    });
    force();
  }

  function continueLearning() {
    setDrillOn(false);
    eng.continueWithRoundLearning();
    force();
  }

  // R1 (keyboard): space/Enter flips the card. R17: Left Arrow undoes the last
  // sort, under the same guards as the button (both funnel through undoSort()).
  // R19: Right Arrow / Down Arrow sort, funnelling through sort() so they share
  // the same debounce lock and complete-screen guard as the buttons.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        flip();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        undoSort();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        sort('known');
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        sort('learning');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-read this deck's pile state after a login-time hydration/migration
  // bulk-overwrites the local cache.
  useEffect(() => {
    return Storage.subscribe(() => {
      eng.start({
        drillMode: eng.drillMode,
        randomOrder: eng.randomOrder,
        masteryMode: eng.masteryMode,
      });
      force();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emptyFromStart = eng.deck.length === 0; // R11
  const complete = !emptyFromStart && eng.isComplete(); // R9
  const showComplete = emptyFromStart || complete;

  const card = eng.currentCard();
  const progress = eng.progress();
  const mastery = eng.progressMastery();

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
          {showComplete
            ? ''
            : eng.masteryMode
              ? `${mastery.mastered} mastered · ${mastery.remaining} left`
              : `Card ${progress.current} of ${progress.total}`}
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
        <label className="toggle-label">
          <input
            type="checkbox"
            checked={masteryOn}
            onChange={(e) => onMasteryToggle(e.target.checked)}
          />
          <span className="toggle-track"></span>
          Study until mastered
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
            {/* Labeled "Undo" rather than "Back": the screen header already owns
                a "← Back" that exits to Home, and two Backs a few hundred pixels
                apart doing opposite things is exactly the misclick this adds. */}
            <button
              className="btn-ghost flash-undo-btn"
              onClick={undoSort}
              disabled={!eng.canGoBack() || sortAnim !== null}
              title="Undo the last sort (←)"
            >
              ← Undo
            </button>
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
            ) : eng.masteryMode ? (
              // Mastery mode only ends when the queue empties, i.e. every card
              // was marked Know It — so the generic "nailed every card this
              // round" line would read as praise for a round that may have taken
              // several passes.
              <>
                <h3>Deck Mastered</h3>
                <p>All {total} card(s) marked Know It — nothing left in the rotation.</p>
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
