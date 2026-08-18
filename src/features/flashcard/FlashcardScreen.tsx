// Flashcard screen — Quizlet-style flip + Know It / Still Learning piles.
// Wraps the mutable flashEngine in a ref and forces re-renders after
// mutations, matching the legacy flow while staying inside React.

import { useEffect, useReducer, useRef, useState } from 'react';
import type { FlashCard, HistoryEntry, MasteryGaps } from '../../types';
import { Katex } from '../../components/Math/Katex';
import { Graph } from '../../components/Graph/Graph';
import { Storage } from '../../lib/Storage';
import { createFlashEngine, type FlashEngine } from './flashEngine';
import {
  DEFAULT_GAPS,
  GAP_MAX,
  GAP_MIN,
  MASTERY_STREAK,
  gapsAreDefault,
  sanitizeGaps,
} from './schedule';
import { FlashAmbience, type FlashAmbienceHandle } from './FlashAmbience';

interface FlashcardScreenProps {
  file: HistoryEntry;
  onBack: () => void;
}

// The two ways a round can run, as one exclusive choice. Standard just walks
// the deck; Mastery runs the streak drill.
type StudyMode = 'standard' | 'mastery';

const MODE_LABEL: Record<StudyMode, string> = {
  standard: 'Standard',
  mastery: 'Mastery',
};

function modeOf(eng: FlashEngine): StudyMode {
  return eng.masteryMode ? 'mastery' : 'standard';
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

function GearIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="2.4" />
      <path d="M8 1.6v1.7M8 12.7v1.7M14.4 8h-1.7M3.3 8H1.6M12.5 3.5l-1.2 1.2M4.7 11.3l-1.2 1.2M12.5 12.5l-1.2-1.2M4.7 4.7L3.5 3.5" />
    </svg>
  );
}

// The card's standing toward mastery, as three segments it fills left to right.
// Always present in Mastery (never conditional on having started the card), so
// the card never shifts vertically when a streak begins — and so a 0/3 card is
// visibly at zero rather than merely unannotated.
function StreakBar({ streak }: { streak: number }) {
  const mastered = streak >= MASTERY_STREAK;
  return (
    <div
      className="flash-streak"
      data-mastered={mastered ? 'yes' : 'no'}
      role="img"
      aria-label={mastered ? 'Mastered' : `Streak ${streak} of ${MASTERY_STREAK}`}
    >
      <div className="flash-streak-track" aria-hidden="true">
        {Array.from({ length: MASTERY_STREAK }, (_, i) => (
          <span key={i} className="flash-streak-seg" data-on={i < streak ? 'yes' : 'no'} />
        ))}
      </div>
      <span className="flash-streak-label" aria-hidden="true">
        {mastered ? 'Mastered' : `${streak} / ${MASTERY_STREAK}`}
      </span>
    </div>
  );
}

// The four spacing numbers, as a popover off the gear. Drafts are held as
// strings so a field can be empty mid-edit without the value snapping back to a
// default on every keystroke; sanitizeGaps runs on blur, which is also the point
// the change reaches the engine and Storage.
function GapSettings({
  gaps,
  onCommit,
  onClose,
}: {
  gaps: MasteryGaps;
  onCommit: (next: MasteryGaps) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<string[]>(() => [
    ...gaps.rungs.map(String),
    String(gaps.miss),
  ]);

  function commit(values: string[]) {
    const next = sanitizeGaps({
      rungs: [Number(values[0]), Number(values[1]), Number(values[2])],
      miss: Number(values[3]),
    });
    setDraft([...next.rungs.map(String), String(next.miss)]);
    onCommit(next);
  }

  function field(index: number, label: string, hint: string) {
    return (
      <label className="flash-settings-row" key={label}>
        <span className="flash-settings-name">
          {label}
          <em>{hint}</em>
        </span>
        <input
          type="number"
          min={GAP_MIN}
          max={GAP_MAX}
          value={draft[index]}
          onChange={(e) => {
            const next = draft.slice();
            next[index] = e.target.value;
            setDraft(next);
          }}
          onBlur={() => commit(draft)}
        />
      </label>
    );
  }

  return (
    <div className="flash-settings-panel" role="group" aria-label="Mastery spacing">
      <p className="flash-settings-intro">
        How many cards go by before a card comes back. On a deck too small to hold
        these gaps they scale down together, keeping their shape.
      </p>
      {field(0, 'After the 1st hit', 'streak 1 / 3')}
      {field(1, 'After the 2nd hit', 'streak 2 / 3')}
      {field(2, 'After the 3rd hit', 'mastered')}
      {field(3, 'After a miss', 'streak resets to 0')}
      <div className="flash-settings-actions">
        <button
          type="button"
          className="btn-ghost"
          disabled={gapsAreDefault(gaps)}
          onClick={() => commit([...DEFAULT_GAPS.rungs.map(String), String(DEFAULT_GAPS.miss)])}
        >
          Reset to 5 / 10 / 15
        </button>
        <button type="button" className="btn-ghost" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
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
    // Keyed by the entry's stable id, never the title: mastery progress is real
    // work, and a title is a string the deck's author can change.
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
  const [gaps, setGaps] = useState<MasteryGaps>(() => sanitizeGaps(Storage.getMasteryGaps()));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sortAnim, setSortAnim] = useState<'known' | 'learning' | null>(null);
  const sortingRef = useRef(false);
  const ambienceRef = useRef<FlashAmbienceHandle | null>(null);

  // R7/R18: changing any option restarts the session from the top — an explicit
  // restart, so it never resumes the saved session. Each handler passes the
  // other options through from the engine, so changing one never silently
  // clears the others.
  function onModeSelect(next: StudyMode) {
    setMode(next);
    setSettingsOpen(false);
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

  // Spacing takes effect from the next verdict rather than restarting the round:
  // every card keeps the streak it has earned, and only where cards land from
  // here on changes. Nothing about a round in progress needs to be thrown away
  // to answer "these gaps are too long".
  function commitGaps(next: MasteryGaps) {
    setGaps(next);
    Storage.setMasteryGaps(next);
    eng.applyGaps(next);
    force();
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

  // Restarts the same mode over its working set from the top.
  function restartAll() {
    eng.start({
      randomOrder: eng.randomOrder,
      masteryMode: eng.masteryMode,
      forceRestart: true,
    });
    force();
  }

  // Wipes every streak in the deck. The only way back into a deck that's already
  // fully mastered, which is why it's offered exactly there and nowhere else —
  // it is not a "restart", and putting it beside one would guarantee the misclick.
  function resetProgress() {
    eng.resetProgress();
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
      // Typing in the spacing fields must not also flip cards and mark them
      // known: Space, Enter and the arrows all mean something inside a number
      // input, and this screen claims all four at the window.
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.isContentEditable)) {
        if (e.key === 'Escape') setSettingsOpen(false);
        return;
      }
      if (e.key === 'Escape') {
        setSettingsOpen(false);
        return;
      }
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

  // Re-read this deck's state after a login-time hydration/migration
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
  // Mastery opened on a deck with nothing left to drill — every card was
  // mastered in an earlier session. A finished state, but a different one from
  // having just finished a round.
  const caughtUp = !emptyFromStart && eng.nothingDue();
  const complete = !emptyFromStart && !caughtUp && eng.isComplete(); // R9
  const showComplete = emptyFromStart || caughtUp || complete;

  const card = eng.currentCard();
  const progress = eng.progress();
  const mastery = eng.progressMastery();
  const onMastered = !showComplete && eng.currentIsMastered();
  const onFresh = !showComplete && eng.currentIsFresh();

  const total = eng.order.length;

  const cardClass =
    (eng.flipped ? 'flipped ' : '') +
    (sortAnim === 'known' ? 'sort-known' : sortAnim === 'learning' ? 'sort-learning' : '');

  // A card carries at most one graph, on whichever face it names. Omitted side
  // means the front, which is where a "what is this curve?" card wants it.
  const graphSide = card?.graph ? card.graphSide ?? 'front' : null;

  // Drives how brightly Mastery's core burns — the round starts on a dim ember
  // and ends on a lit one. Denominator guarded for the empty working set.
  const masteryIntensity = mastery.total > 0 ? mastery.mastered / mastery.total : 1;

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
              ? `${mastery.mastered} / ${mastery.total} mastered`
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
        {/* Only in Mastery: the numbers behind it are the only thing they
            configure, and a gear on a mode that spaces nothing would be a
            control with no effect. */}
        {mode === 'mastery' && (
          <div className="flash-settings-wrap">
            <button
              type="button"
              className="btn-ghost flash-settings-btn"
              onClick={() => setSettingsOpen((open) => !open)}
              aria-expanded={settingsOpen}
              aria-label="Spacing settings"
              title="How far apart repeats are spaced"
            >
              <GearIcon />
              {gaps.rungs.join(' / ')}
            </button>
            {settingsOpen && (
              <GapSettings
                gaps={gaps}
                onCommit={commitGaps}
                onClose={() => setSettingsOpen(false)}
              />
            )}
          </div>
        )}
        {/* A button rather than a third toggle: the controls to its left are
            study options that change what the round IS, and this one only
            changes how the screen looks. Its label names the action it will
            take, so the current state never has to be inferred from a switch. */}
        <button
          type="button"
          className="btn-ghost flash-motion-btn"
          onClick={toggleMotion}
          title={motionOn ? 'Hold the background field still' : 'Let the background field move'}
        >
          <MotionIcon playing={motionOn} />
          {motionOn ? 'Pause motion' : 'Play motion'}
        </button>
      </div>

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
          {eng.masteryMode && (
            <>
              {/* Two cards can carry the same 0/3 for opposite reasons, and one
                  of them is worth double — so the bar's zero state gets a line
                  saying which. A mastered card in the rotation gets one too: a
                  miss there is the one verdict that can take mastery away. */}
              {(onMastered || onFresh) && (
                <p className="flash-phase-tag" data-phase={onMastered ? 'mastered' : 'fresh'}>
                  {onMastered
                    ? 'Mastered — still circulating. A miss here starts it over.'
                    : 'First look — get it right now and it jumps straight to 2 / 3.'}
                </p>
              )}
              <StreakBar streak={eng.currentStreak()} />
            </>
          )}

          <div id="flash-card-wrap">
            <div id="flash-card" key={card.id} className={cardClass} onClick={flip}>
              <div className="card-inner">
                <div className={'card-front' + (graphSide === 'front' ? ' has-graph' : '')}>
                  {graphSide === 'front' && card.graph && (
                    <Graph key={card.id + '-fg'} graph={card.graph} />
                  )}
                  <div className="card-text">
                    <Katex text={card.front} />
                  </div>
                </div>
                <div className={'card-back' + (graphSide === 'back' ? ' has-graph' : '')}>
                  {graphSide === 'back' && card.graph && (
                    <Graph key={card.id + '-bg'} graph={card.graph} />
                  )}
                  <div className="card-text">
                    <Katex text={card.back} />
                  </div>
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
              // Opened Mastery on a deck with nothing left to drill. The honest
              // thing is to say so rather than re-offer finished work, and to
              // name the one action that would give the mode something to do.
              <>
                <h3>Deck Mastered</h3>
                <p>
                  All {eng.allQuestions.length} card(s) are mastered, so there's nothing left to
                  drill. Browse them any time — or reset and earn them again from scratch.
                </p>
              </>
            ) : eng.isBrowseMode() ? (
              // Standard marks nothing, so a tally here would report zeros for a
              // round that had no verdicts in it.
              <>
                <h3>End of Deck</h3>
                <p>You've been through all {total} card(s).</p>
              </>
            ) : (
              // Mastery's round end. Every card in the working set reached three
              // in a row, which is the whole bar — so this says so plainly.
              <>
                <h3>Round Complete</h3>
                <p>
                  {total} card(s) mastered — three in a row each, spaced out. The deck stays
                  mastered, so Mastery has nothing more to ask until you reset it.
                </p>
              </>
            )}
            <div className="stats-actions" style={{ justifyContent: 'center' }}>
              {/* A finished mastery round and a deck that was already finished
                  land on the same two choices: look at the cards, or clear the
                  slate. "Restart" is offered only where there's a round left to
                  restart — in Mastery there isn't, since restarting a mastered
                  deck lands straight back on this screen. */}
              {eng.isBrowseMode() ? (
                <button className="btn-ghost" onClick={restartAll}>
                  Restart All
                </button>
              ) : (
                <>
                  <button className="btn-ghost" onClick={() => onModeSelect('standard')}>
                    Browse the Deck
                  </button>
                  <button className="btn-ghost" onClick={resetProgress}>
                    Reset Progress
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
