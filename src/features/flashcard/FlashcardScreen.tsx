// Flashcard screen — Quizlet-style flip + Know It / Still Learning piles.
// Wraps the mutable flashEngine in a ref and forces re-renders after
// mutations, matching the legacy flow while staying inside React.

import { useEffect, useReducer, useRef, useState } from 'react';
import type { FlashCard, HistoryEntry } from '../../types';
import { Katex } from '../../components/Math/Katex';
import { Storage } from '../../lib/Storage';
import { createFlashEngine, type FlashEngine } from './flashEngine';
import { describeDue } from './schedule';
import { FlashAmbience, type FlashAmbienceHandle } from './FlashAmbience';

interface FlashcardScreenProps {
  file: HistoryEntry;
  onBack: () => void;
}

// The two ways a round can run, as one exclusive choice. Standard just walks
// the deck; Mastery runs the ladder.
type StudyMode = 'standard' | 'mastery';

const MODE_LABEL: Record<StudyMode, string> = {
  standard: 'Standard',
  mastery: 'Mastery',
};

// Mastery's hint states the part students get wrong about it: three in a row
// isn't the finish line, and the mode is meant to be returned to. Saying so
// up front is the difference between "I finished the deck" and "I'm learning
// this deck", which is the entire behaviour change the mode exists to cause.
const MODE_HINT: Record<StudyMode, string> = {
  standard:
    'Flip through the whole deck at your own pace — arrows move between cards, and nothing is marked.',
  mastery:
    'Get a card right three times, spaced further apart each time, and it’s set aside for a final check tomorrow. Passing that check masters it — after which it only drops in now and then to prove it stuck.',
};

function modeOf(eng: FlashEngine): StudyMode {
  return eng.masteryMode ? 'mastery' : 'standard';
}

// Mastery's end-of-round copy, assembled rather than templated: a round can end
// with new cards learned, refreshers held, both, or — on a quiet day where the
// only thing due was a mastered card or two — refreshers alone. "0 of 3 learned"
// is a poor way to describe a round that went perfectly well.
function roundSummary(
  learned: number,
  refreshed: number,
  total: number,
  nextDue: string | null,
): string {
  const parts = [
    learned > 0
      ? `${learned} of ${total} card(s) learned this session.`
      : 'No new cards were learned this round.',
  ];
  if (refreshed > 0) parts.push(`${refreshed} mastered card(s) came back for a refresher and held.`);
  if (learned > 0) {
    parts.push(
      `Come back ${nextDue ? describeDue(nextDue) : 'tomorrow'} for the final check that locks them in.`,
    );
  } else if (nextDue) {
    parts.push(`Come back ${describeDue(nextDue)}.`);
  }
  return parts.join(' ');
}

// Drawn rather than typed: DESIGN.md's icon rule is authored SVG at a single
// stroke weight, and the ▶/⏸ characters render as color emoji on some
// platforms. 1.6 stroke matches the mode-select icons.
function MotionIcon({ playing }: { playing: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {playing ? (
        <>
          <line x1="6" y1="3.5" x2="6" y2="12.5" />
          <line x1="10" y1="3.5" x2="10" y2="12.5" />
        </>
      ) : (
        <path d="M5 3.4 L12.6 8 L5 12.6 Z" />
      )}
    </svg>
  );
}

export function FlashcardScreen({ file, onBack }: FlashcardScreenProps) {
  const deck = file.data;
  const engineRef = useRef<FlashEngine | null>(null);
  if (!engineRef.current) {
    // R12: entered directly from opening a flashcard deck — resumes a saved
    // unfinished session (same card, same toggles), else a fresh full-deck
    // session with mastery off and random off.
    //
    // Keyed by the entry's stable id, never the title: mastery scheduling is
    // days of work, and a title is a string the deck's author can change.
    // Storage guarantees an id on anything that came out of getHistory().
    engineRef.current = createFlashEngine(file.id!, deck.questions as FlashCard[]);
    engineRef.current.start({ randomOrder: false, masteryMode: false });
  }
  const eng = engineRef.current;

  const [, force] = useReducer((x: number) => x + 1, 0);
  // Seeded from the engine so a resumed session shows the mode it was started with.
  const [mode, setMode] = useState<StudyMode>(() => modeOf(eng));
  const [randomOn, setRandomOn] = useState(() => eng.randomOrder);
  // Off unless the student turned it on, and remembered per device. The
  // atmosphere still reads while frozen — colour, rim and a composed still
  // frame all survive — so the default costs the mode nothing.
  const [motionOn, setMotionOn] = useState(() => Storage.getAmbientMotion());
  const [sortAnim, setSortAnim] = useState<'known' | 'learning' | null>(null);
  const sortingRef = useRef(false);
  const ambienceRef = useRef<FlashAmbienceHandle | null>(null);

  // R7/R18: changing any option restarts the session from the top — an explicit
  // restart, so it never resumes the saved session. Each handler passes the
  // other options through from the engine, so changing one never silently
  // clears the others.
  function onModeSelect(next: StudyMode) {
    setMode(next);
    eng.start({
      randomOrder: eng.randomOrder,
      masteryMode: next === 'mastery',
      forceRestart: true,
    });
    force();
  }
  function onRandomToggle(checked: boolean) {
    setRandomOn(checked);
    eng.start({
      randomOrder: checked,
      masteryMode: eng.masteryMode,
      forceRestart: true,
    });
    force();
  }

  function toggleMotion() {
    setMotionOn((on) => {
      Storage.setAmbientMotion(!on);
      return !on;
    });
  }

  // R2: debounce sorting for the animation window so cards aren't skipped.
  function sort(pile: 'known' | 'learning') {
    if (sortingRef.current || eng.isComplete() || !eng.currentCard()) return;
    sortingRef.current = true;
    setSortAnim(pile);
    // Fired with the card animation, not after it: the ripple has to leave the
    // core while the card is still moving, or the two read as two separate
    // events instead of one.
    ambienceRef.current?.pulse();
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

  // Restarts the same mode over the whole deck from the top.
  function restartAll() {
    eng.start({
      randomOrder: eng.randomOrder,
      masteryMode: eng.masteryMode,
      forceRestart: true,
    });
    force();
  }

  // Keyboard: the arrows split by axis, which is what makes the scheme learnable
  // across both modes. Vertical is always the card itself — ↑/↓ flip it, same as
  // Space and Enter (R1), in either mode. Horizontal is always the round moving
  // on: Standard steps between cards, Mastery undoes the last sort (R17) and
  // marks Know It. Still Learning has no key as a result; it's the one action
  // whose direction the axis rule doesn't have a slot for, so it stays
  // button-only rather than getting an arbitrary binding.
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
        randomOrder: eng.randomOrder,
        masteryMode: eng.masteryMode,
      });
      force();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emptyFromStart = eng.deck.length === 0; // R11
  // Mastery with every card either retired or not yet due — a finished state,
  // but a different one from "you got through the round".
  const caughtUp = !emptyFromStart && eng.nothingDue();
  const complete = !emptyFromStart && !caughtUp && eng.isComplete(); // R9
  const showComplete = emptyFromStart || caughtUp || complete;

  const card = eng.currentCard();
  const progress = eng.progress();
  const mastery = eng.progressMastery();
  const nextDue = eng.nextDue();
  const coldCheck = !showComplete && eng.currentIsColdCheck();
  const refreshing = !showComplete && eng.currentIsRefresh();

  const total = eng.order.length;

  const cardClass =
    (eng.flipped ? 'flipped ' : '') +
    (sortAnim === 'known' ? 'sort-known' : sortAnim === 'learning' ? 'sort-learning' : '');

  // Drives how brightly Mastery's core burns — the round starts on a dim ember
  // and ends on a lit one. Denominator guarded: a learned card leaves the
  // queue, so both terms are zero on the completion frame.
  const masteryTotal = mastery.learned + mastery.remaining;
  const masteryIntensity = masteryTotal > 0 ? mastery.learned / masteryTotal : 1;

  return (
    <section
      id="flashcard-screen"
      className="screen"
      data-mode={mode}
      data-motion={motionOn ? 'on' : 'off'}
    >
      <div className="screen-header">
        <button className="btn-ghost" onClick={onBack}>
          ← Back
        </button>
        <h2>Flashcards</h2>
        <span className="review-progress-text flash-progress-text">
          {showComplete
            ? ''
            : eng.masteryMode
              ? `${mastery.learned} learned · ${mastery.remaining} left`
              : `Card ${progress.current} of ${progress.total}`}
        </span>
      </div>

      <div className="flash-options">
        {/* These are two whole ways a round runs, not an add-on to a default —
            a sliding pill states both names at once, where the old checkbox
            left the unchecked mode unnamed. Radios (not buttons) so arrow keys
            move between them and the group announces as one control. */}
        <div className="mode-pill" role="radiogroup" aria-label="Study mode">
          <span className="mode-pill-thumb" data-mode={mode} aria-hidden="true" />
          {(['standard', 'mastery'] as const).map((m) => (
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
        {/* A button rather than a third toggle: the two controls to its left
            are study options that change what the round IS, and this one only
            changes how the screen looks. Its label names the action it will
            take, so the current state never has to be inferred from a switch. */}
        <button
          type="button"
          className="btn-ghost flash-motion-btn"
          onClick={toggleMotion}
          title={
            motionOn
              ? 'Hold the background field still'
              : 'Let the background field move'
          }
        >
          <MotionIcon playing={motionOn} />
          {motionOn ? 'Pause motion' : 'Play motion'}
        </button>
      </div>

      {/* One word per segment can't carry what a mode actually does, and those
          differences (which cards am I seeing, and do missed ones come back?)
          are the whole reason to pick one — so a line of copy tracks the
          selection. */}
      <p className="flash-mode-hint">{MODE_HINT[mode]}</p>

      {!showComplete && card && (
        <div id="flash-active-area">
          {/* Sits behind the card, the hint and the buttons — Mastery's core and
              its sort ripples are centred on the whole active area, so the
              canvas has to span it rather than just the card. */}
          <FlashAmbience
            ref={ambienceRef}
            mode={mode}
            intensity={masteryIntensity}
            paused={!motionOn}
          />
          {/* A cold check and a mid-ladder repeat look identical on the card,
              but they mean opposite things — one is a real test of yesterday's
              learning, the other is a step toward it. Saying which is what
              keeps "Know It" from being answered on autopilot. */}
          {eng.masteryMode && (coldCheck || refreshing || eng.currentIsFiller()) && (
            <p
              className="flash-phase-tag"
              data-phase={coldCheck ? 'cold' : refreshing ? 'refresh' : 'filler'}
            >
              {coldCheck
                ? 'Final check — you learned this on an earlier day.'
                : refreshing
                  ? 'Refresher — you mastered this a while back. Still got it?'
                  : 'Already learned — just keeping the spacing honest.'}
            </p>
          )}

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
              button pair would be naming the same thing twice. Mastery keeps
              words, because there the two choices mean different things and a
              bare arrow couldn't say which. */}
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
              // Validation rejects a deck with no questions, so this is a guard
              // rather than a state the app can normally reach.
              <>
                <h3>Nothing to Study</h3>
                <p>This deck has no cards in it.</p>
              </>
            ) : caughtUp ? (
              // Mastery's most important screen: there is genuinely nothing
              // useful to do right now, and the honest thing is to say so and
              // name the day rather than invent busywork to fill the session.
              // Split on the deck's actual standing rather than on whether a
              // date exists: refreshers mean a finished deck always has a next
              // date now, and "All Caught Up" would quietly replace the one
              // screen that tells a student they're done.
              eng.allMastered() ? (
                <>
                  <h3>Deck Mastered</h3>
                  <p>
                    Every card passed its final check on a later day. Nothing left to do here —
                    they'll drop back in for the odd refresher
                    {nextDue ? `, starting ${describeDue(nextDue)}` : ''}.
                  </p>
                </>
              ) : (
                <>
                  <h3>All Caught Up</h3>
                  <p>
                    Every card here is either mastered or waiting on its final check.
                    {nextDue ? ` The next one comes due ${describeDue(nextDue)}.` : ''}
                  </p>
                </>
              )
            ) : eng.isBrowseMode() ? (
              // Standard marks nothing, so a tally here would report zeros for a
              // round that had no verdicts in it.
              <>
                <h3>End of Deck</h3>
                <p>You've been through all {total} card(s).</p>
              </>
            ) : (
              // Mastery's round end. Deliberately NOT "Deck Mastered": what the
              // student just did was learn cards, and the claim that they've
              // stuck is one only tomorrow can make. Overstating it here is the
              // exact illusion of competence the mode is built to prevent.
              <>
                <h3>Round Complete</h3>
                <p>{roundSummary(mastery.learned, mastery.refreshed, total, nextDue)}</p>
              </>
            )}
            <div className="stats-actions" style={{ justifyContent: 'center' }}>
              {/* Restarting a caught-up round just lands back on this same
                  screen, so that state offers the one thing still worth doing. */}
              {caughtUp ? (
                <button className="btn-ghost" onClick={() => onModeSelect('standard')}>
                  Browse the Deck
                </button>
              ) : (
                <button className="btn-ghost" onClick={restartAll}>
                  Restart All
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
