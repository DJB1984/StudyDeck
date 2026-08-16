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

// The three ways a round can run, as one exclusive choice. Standard and Piles
// differ only in the working set; Mastery changes how the round walks it.
type StudyMode = 'standard' | 'piles' | 'mastery';

const MODE_LABEL: Record<StudyMode, string> = {
  standard: 'Standard',
  piles: 'Piles',
  mastery: 'Mastery',
};

const MODE_HINT: Record<StudyMode, string> = {
  standard: 'One pass through the whole deck — each card is shown once.',
  piles: 'One pass through your Still Learning pile only — cards already marked Know It sit it out.',
  mastery: 'The whole deck, and missed cards come back later in the round until every one is marked Know It.',
};

// Projects the engine's two independent fields onto the pill. Mastery wins when
// a session somehow carries both (a session saved by the older two-checkbox UI
// could): the pill reads Mastery while that round finishes over the narrower
// working set, and the next explicit mode pick resolves it.
function modeOf(eng: FlashEngine): StudyMode {
  if (eng.masteryMode) return 'mastery';
  return eng.drillMode === 'learning' ? 'piles' : 'standard';
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
  // Seeded from the engine so a resumed session shows the mode it was started
  // with. The engine still stores drill and mastery as two independent fields
  // (they're separate concerns down there — which cards are in the working set
  // vs. how the round walks it); the pill is the UI's three-way projection of
  // the two combinations that are actually worth studying in.
  const [mode, setMode] = useState<StudyMode>(() => modeOf(eng));
  const [randomOn, setRandomOn] = useState(() => eng.randomOrder);
  const [sortAnim, setSortAnim] = useState<'known' | 'learning' | null>(null);
  const sortingRef = useRef(false);

  // R7/R18: changing any option restarts the session from the top — an explicit
  // restart, so it never resumes the saved session. Each handler passes the
  // other options through from the engine, so changing one never silently
  // clears the others.
  function onModeSelect(next: StudyMode) {
    setMode(next);
    eng.start({
      drillMode: next === 'piles' ? 'learning' : 'all',
      randomOrder: eng.randomOrder,
      masteryMode: next === 'mastery',
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

  // Both of these restart over a working set they choose themselves, so they
  // drop out of Piles (whose whole definition is "the Still Learning subset")
  // while leaving Mastery alone — it describes how the round walks, which still
  // applies to whatever set is being restarted.
  function restartAll() {
    setMode((m) => (m === 'piles' ? 'standard' : m));
    eng.start({
      drillMode: 'all',
      randomOrder: eng.randomOrder,
      masteryMode: eng.masteryMode,
      forceRestart: true,
    });
    force();
  }

  function continueLearning() {
    setMode((m) => (m === 'piles' ? 'standard' : m));
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
        {/* These are three whole ways a round runs, not add-ons to a default —
            a sliding pill states all three names at once, where the old
            checkboxes left the unchecked modes unnamed. Radios (not buttons) so
            arrow keys move between them and the group announces as one control. */}
        <div className="mode-pill" role="radiogroup" aria-label="Study mode">
          <span className="mode-pill-thumb" data-mode={mode} aria-hidden="true" />
          {(['standard', 'piles', 'mastery'] as const).map((m) => (
            <label className="mode-pill-option" key={m}>
              <input
                type="radio"
                name="flash-study-mode"
                checked={mode === m}
                onChange={() => onModeSelect(m)}
              />
              <span>{MODE_LABEL[m]}</span>
            </label>
          ))}
        </div>
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

      {/* One word per segment can't carry what a mode actually does, and those
          differences (which cards am I seeing, and do missed ones come back?)
          are the whole reason to pick one — so a line of copy tracks the
          selection. */}
      <p className="flash-mode-hint">{MODE_HINT[mode]}</p>

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
