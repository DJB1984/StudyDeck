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

// The three ways a round can run, as one exclusive choice. Standard just walks
// the deck; Piles narrows the working set and sorts; Mastery sorts and requeues.
type StudyMode = 'standard' | 'piles' | 'mastery';

const MODE_LABEL: Record<StudyMode, string> = {
  standard: 'Standard',
  piles: 'Piles',
  mastery: 'Mastery',
};

const MODE_HINT: Record<StudyMode, string> = {
  standard: 'Flip through the whole deck at your own pace — arrows move between cards, and nothing is marked.',
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

  // Standard mode's card navigation. Nothing animates on a browse step (there's
  // no pile for the card to fly into), so these don't take the sorting lock —
  // but they do respect it, so an arrow pressed mid-animation in another mode
  // can't step the cursor out from under the slide.
  // Both stop at the round-complete screen the way undoSort() does, so the
  // arrow keys can't quietly walk back onto a card the screen isn't showing.
  function browsePrev() {
    if (sortingRef.current || eng.isComplete()) return;
    if (eng.stepBack()) force();
  }
  function browseNext() {
    if (sortingRef.current || eng.isComplete()) return;
    if (eng.stepForward()) force();
  }

  // R17: undo the last sort. Shares flip/sort's `sortingRef` lock so it can't
  // race an in-flight sort animation (which would undo a sort the engine hasn't
  // applied yet, or step back off a card mid-slide).
  function undoSort() {
    if (sortingRef.current || eng.isComplete() || !eng.canGoBack()) return;
    eng.goBack();
    force();
  }

  // Restarts over the whole deck, so it drops out of Piles (whose whole
  // definition is "the Still Learning subset") while leaving Mastery alone — it
  // describes how the round walks, which still applies to the full deck.
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

  // No setMode here: this button only appears when the round marked cards Still
  // Learning, which only Piles and Mastery can do, and the continued round stays
  // in whichever of those it came from.
  function continueLearning() {
    eng.continueWithRoundLearning();
    force();
  }

  // Keyboard: the arrows split by axis, which is what makes the scheme learnable
  // across the three modes. Vertical is always the card itself — ↑/↓ flip it,
  // same as Space and Enter (R1), in every mode. Horizontal is always the round
  // moving on: Standard steps between cards, Piles and Mastery undo the last
  // sort (R17) and mark Know It. Still Learning has no key as a result; it's the
  // one action whose direction the axis rule doesn't have a slot for, so it
  // stays button-only rather than getting an arbitrary binding.
  //
  // Every branch funnels through the same handler as its button, so they share
  // the debounce lock, the end guards and the complete-screen guard.
  //
  // Reads the mode off the engine, not the `mode` state: this effect runs once,
  // so a state read here would be pinned to the mode the screen opened in.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const browsing = eng.isBrowseMode();
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        flip();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (browsing) browsePrev();
        else undoSort();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (browsing) browseNext();
        else sort('known');
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

          {/* The keys are named here because a flip has no visible control to
              discover them from — the card is the button. */}
          <p className="flash-hint">Click card to flip, or press ↑ / ↓</p>

          {/* Standard mode has no verdict to give, only a direction to move, so
              its controls are the two arrows and nothing else — a labelled
              button pair would be naming the same thing twice. Piles and Mastery
              keep words, because there the two choices mean different things and
              a bare arrow couldn't say which. */}
          {mode === 'standard' ? (
            <div className="flash-actions">
              <button
                className="flash-nav-btn"
                onClick={browsePrev}
                disabled={eng.currentIdx === 0}
                aria-label="Previous card"
                title="Previous card (←)"
              >
                <span aria-hidden="true">←</span>
              </button>
              <button
                className="flash-nav-btn"
                onClick={browseNext}
                aria-label="Next card"
                title="Next card (→)"
              >
                <span aria-hidden="true">→</span>
              </button>
            </div>
          ) : (
            <div className="flash-actions">
              {/* Labeled "Undo" rather than "Back": the screen header already
                  owns a "← Back" that exits to Home, and two Backs a few hundred
                  pixels apart doing opposite things is exactly the misclick this
                  adds. */}
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
          )}
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
            ) : eng.isBrowseMode() ? (
              // Standard marks nothing, so the known/learning tallies below
              // would report zeros for a round that had no verdicts in it.
              <>
                <h3>End of Deck</h3>
                <p>You've been through all {total} card(s).</p>
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
