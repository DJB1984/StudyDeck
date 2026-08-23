// Flashcard screen — Quizlet-style flip + Know It / Still Learning piles.
// Wraps the mutable flashEngine in a ref and forces re-renders after
// mutations, matching the legacy flow while staying inside React.

import { useEffect, useReducer, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { FlashCard, HistoryEntry } from '../../types';
import { Katex } from '../../components/Math/Katex';
import { Graph } from '../../components/Graph/Graph';
import { Storage } from '../../lib/Storage';
import { createFlashEngine, type FlashEngine } from './flashEngine';
import { MASTERY_STREAK } from './schedule';
import { FlashAmbience, type FlashAmbienceHandle } from './FlashAmbience';
import { ConfirmModal } from '../../components/ConfirmModal';
import { useCardSwipe, type SwipeDir } from './useCardSwipe';
import { useMediaQuery, TOUCH_QUERY } from '../../lib/useMediaQuery';

interface FlashcardScreenProps {
  file: HistoryEntry;
  onBack: () => void;
}

// The two ways a round can run, as one exclusive choice. Standard just walks
// the deck; Mastery runs the streak drill.
type StudyMode = 'standard' | 'mastery';

// How long the outgoing card is given to leave, in every mode and by every
// input. Matches the CSS animations below it; one number so a swipe, a button
// and an arrow key all hand over at the same moment.
const EXIT_MS = 350;

// How much the card tips per pixel dragged. Shared with the exit keyframes'
// starting angle, so a thrown card leaves at the angle it was held at. Kept
// low: the card is up to 760x500, so its corners swing far more than the angle
// suggests — at the old 0.035 a committed drag put the top corner into the
// streak bar and the bottom corner onto the hint line.
const DRAG_TILT = 0.02;
// The ceiling that tip is allowed to reach, however far the card is hauled. A
// tilt is a swing: at 760px wide the corners drop half the card's width times
// the sine of the angle, so an uncapped haul dips them far enough below the card
// to lengthen the page — and a page that grows mid-gesture puts a scrollbar
// under the hand doing the dragging. Six degrees is past anything a committed
// throw needs to look thrown.
const MAX_TILT_DEG = 6;

/** The card's tip for a given horizontal offset, capped in both directions. */
function tiltFor(dx: number): number {
  return Math.max(-MAX_TILT_DEG, Math.min(dx * DRAG_TILT, MAX_TILT_DEG));
}

// Touch as the primary input — a finger rather than a mouse or trackpad, and
// the only question this screen asks about its hands. It decides the hint's
// wording and whether the action buttons are there at all: a finger has the
// gesture instead, and anything that points keeps the buttons at every width.
// The query itself lives in lib/useMediaQuery — auth asks the same question.

const MODE_LABEL: Record<StudyMode, string> = {
  standard: 'Standard',
  mastery: 'Mastery',
};

function modeOf(eng: FlashEngine): StudyMode {
  return eng.masteryMode ? 'mastery' : 'standard';
}

// Sliders, not a cogwheel: a 15px gear's teeth collapse into eight spokes
// around a dot, which renders as a sun. Two rails and two knobs survive the
// size, and they say "adjust these" as plainly as a cog does.
function SettingsIcon() {
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
      <line x1="2.2" y1="5.5" x2="13.8" y2="5.5" />
      <line x1="2.2" y1="10.5" x2="13.8" y2="10.5" />
      <circle cx="6" cy="5.5" r="1.9" fill="var(--surface)" />
      <circle cx="10.5" cy="10.5" r="1.9" fill="var(--surface)" />
    </svg>
  );
}

// A counter-clockwise arrow, no label. The two verdicts beside it are the row's
// decision and now own the arrow keys; undo is the correction you reach for by
// hand, and a word here would have given it the same weight as a verdict.
function UndoIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 4.5h5.2a3.9 3.9 0 0 1 0 7.8H4.6" />
      <polyline points="5.9,1.7 3,4.5 5.9,7.3" />
    </svg>
  );
}

// The card's standing toward mastery, as four segments it fills left to right —
// one per Know It needed, the last of which is the hit that masters the card and
// sends it to the back. Always present in Mastery (never conditional on having
// started the card), so the card never shifts vertically when a streak begins —
// and so a 0/4 card is visibly at zero rather than merely unannotated.
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

// Everything the round takes that isn't the mode, as one popover off the gear.
// Both of these are things a student sets once and then leaves alone, so neither
// earns permanent space on the options row beside the mode pill — the choice
// that IS the round.
//
// Card order only appears in Standard. Mastery decides where every card sits by
// how well it's known, so shuffling underneath it would be undoing the mode's
// own work — it isn't offered and then ignored, it simply isn't there.
function FlashSettings({
  showOrder,
  randomOn,
  onRandomToggle,
  showButtonsOption,
  buttonsOn,
  onButtonsToggle,
  motionOn,
  onMotionToggle,
  showReset,
  onReset,
}: {
  showOrder: boolean;
  randomOn: boolean;
  onRandomToggle: (checked: boolean) => void;
  showButtonsOption: boolean;
  buttonsOn: boolean;
  onButtonsToggle: () => void;
  motionOn: boolean;
  onMotionToggle: () => void;
  showReset: boolean;
  onReset: () => void;
}) {
  return (
    <div className="flash-settings-panel" role="group" aria-label="Study settings">
      {showOrder && (
        <label className="toggle-label flash-settings-toggle">
          <input
            type="checkbox"
            checked={randomOn}
            onChange={(e) => onRandomToggle(e.target.checked)}
          />
          <span className="toggle-track"></span>
          <span className="flash-settings-name">Random order</span>
        </label>
      )}
      {/* Only on touch, which is the only place the buttons are hidden and so
          the only place a switch for them means anything. It's the way back for
          a tablet that would rather tap than swipe; anything with a pointer
          keeps its buttons at every width and never needs it. */}
      {showButtonsOption && (
        <label className="toggle-label flash-settings-toggle">
          <input type="checkbox" checked={buttonsOn} onChange={onButtonsToggle} />
          <span className="toggle-track"></span>
          <span className="flash-settings-name">Card buttons</span>
        </label>
      )}
      {/* A switch rather than the action-named button it used to be: in a list
          of settings a lone button reads as a different kind of thing than it
          is. The only control the panel always has — in Mastery it's the whole
          panel. */}
      <label className="toggle-label flash-settings-toggle">
        <input type="checkbox" checked={motionOn} onChange={onMotionToggle} />
        <span className="toggle-track"></span>
        <span className="flash-settings-name">Background motion</span>
      </label>
      {/* Mastery only, and last: it's the one control here that destroys work
          rather than shaping the round, so it sits under a rule apart from the
          switches and asks before it does anything. */}
      {showReset && (
        <button type="button" className="flash-settings-reset" onClick={onReset}>
          Reset mastery
        </button>
      )}
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  // The reset confirmation. Mirrored into a ref because the window keydown
  // handler below is bound once and would otherwise read the opening render's
  // value forever — it needs the live one to keep its hands off the card while
  // the dialog is up.
  const [confirmReset, setConfirmReset] = useState(false);
  const confirmResetRef = useRef(false);
  const settingsWrapRef = useRef<HTMLDivElement | null>(null);
  // How the outgoing card leaves — the same two arcs for every input. A swipe
  // finishes the throw the finger drew; a button starts that identical throw
  // from rest. Still Learning used to shudder in place here instead, which made
  // the button and the gesture two different vocabularies for one verdict; it
  // now leaves left, the direction its own swipe already meant.
  const [exitAnim, setExitAnim] = useState<'left' | 'right' | null>(null);
  const sortingRef = useRef(false);
  const ambienceRef = useRef<FlashAmbienceHandle | null>(null);

  // Touch-as-primary, and the only input question this screen asks. Width used
  // to stand in for it, which cost a desktop window dragged narrow its buttons —
  // the layout there is a phone's, but the hands aren't. Live, so an iPad that
  // gains a trackpad mid-round gains its buttons with it.
  const touch = useMediaQuery(TOUCH_QUERY);
  const [buttonsOn, setButtonsOn] = useState(() => Storage.getCardButtons());
  // The gesture's caption, retired once the gesture has been used on this
  // device. It exists to teach one thing, and a hint that outlives what it
  // taught is just a line of type standing between the card and the screen.
  const [hintSeen, setHintSeen] = useState(() => Storage.getSwipeHintSeen());
  const lastCueRef = useRef<SwipeDir>('right');
  // Where the finger let go, handed to the exit keyframes so the throw carries
  // on from there rather than restarting at centre. Zero for a button press.
  const exitFromRef = useRef(0);
  // The verdict a BUTTON gave, held for the length of the flight. A thrown card
  // leaves already wearing its rim and its word, because the finger built both
  // up on the way out — so a pressed one blooms the same pair as it goes rather
  // than leaving as a blank card. Never set in Standard, which has no verdict.
  const [buttonCue, setButtonCue] = useState<SwipeDir | null>(null);

  // R7/R18: changing any option restarts the session from the top — an explicit
  // restart, so it never resumes the saved session. Each handler passes the
  // other options through from the engine, so changing one never silently
  // clears the others.
  // `randomOn` is the student's Standard-mode preference, not the engine's live
  // setting: Mastery forces the shuffle off, so passing it through here is what
  // gives them their shuffle back when they come out the other side.
  function onModeSelect(next: StudyMode) {
    setMode(next);
    setSettingsOpen(false);
    eng.start({
      randomOrder: randomOn,
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

  function toggleButtons() {
    setButtonsOn((on) => {
      Storage.setCardButtons(!on);
      return !on;
    });
  }

  function toggleMotion() {
    setMotionOn((on) => {
      Storage.setAmbientMotion(!on);
      return !on;
    });
  }

  // R2: debounce sorting for the animation window so cards aren't skipped.
  // `dir` is passed only by the swipe, and only to say where the throw was
  // already pointing. A button has no offset to carry, so it flies the same arc
  // from centre — the verdict decides the direction either way.
  function sort(pile: 'known' | 'learning', dir?: SwipeDir, fromDx = 0) {
    if (sortingRef.current || eng.isComplete() || !eng.currentCard()) return;
    sortingRef.current = true;
    exitFromRef.current = fromDx;
    const away: SwipeDir = dir ?? (pile === 'known' ? 'right' : 'left');
    setExitAnim(away);
    if (!dir && eng.masteryMode) setButtonCue(away);
    // Fired with the card animation, not after it: the ripple has to leave the
    // core while the card is still moving, or the two read as two separate
    // events instead of one.
    ambienceRef.current?.pulse();
    window.setTimeout(() => {
      eng.sortCard(pile);
      setExitAnim(null);
      setButtonCue(null);
      sortingRef.current = false;
      force();
    }, EXIT_MS);
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

  // The same two steps, taken by a throw. A browse step has no verdict behind
  // it, so it animates only because the finger already moved the card: letting
  // it snap home and swapping the text underneath would undo the gesture in
  // front of the person who made it.
  function browseSwipe(dir: SwipeDir, fromDx = 0) {
    if (sortingRef.current || eng.isComplete()) return;
    if (dir === 'left' && eng.currentIdx === 0) return;
    sortingRef.current = true;
    exitFromRef.current = fromDx;
    setExitAnim(dir);
    window.setTimeout(() => {
      if (dir === 'right') eng.stepForward();
      else eng.stepBack();
      setExitAnim(null);
      sortingRef.current = false;
      force();
    }, EXIT_MS);
  }

  // R17: undo the last sort. Shares flip/sort's `sortingRef` lock so it can't
  // race an in-flight sort animation (which would undo a sort the engine hasn't
  // applied yet, or step back off a card mid-slide).
  // Deliberately NOT gated on isComplete(), unlike the browse steps: the verdict
  // that masters the last card is the one most worth taking back, and gating it
  // made that the single unreachable undo in the mode — with nothing to fall back
  // on but Reset Progress, which wipes the whole deck. goBack() restores the
  // card's record along with the queue, so the round simply stops being complete.
  // Standard mode can't reach this anyway: it records no verdicts, so its undo
  // stack is always empty.
  function undoSort() {
    if (sortingRef.current || !eng.canGoBack()) return;
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

  // Wipes every streak in the deck. Reachable from the caught-up screen (where
  // it's the only thing left to do) and from Mastery's settings panel mid-round
  // — both go through the same confirmation, since either way it throws away
  // every card's earned standing and nothing else on the screen undoes it.
  function askReset(open: boolean) {
    confirmResetRef.current = open;
    setConfirmReset(open);
    if (open) setSettingsOpen(false);
  }
  function resetProgress() {
    askReset(false);
    eng.resetProgress();
    force();
  }

  // Keyboard: the arrows split by axis, which is what makes the scheme learnable
  // across both modes. Vertical is always the card itself — ↑/↓ flip it, same as
  // Space and Enter (R1), in either mode. Horizontal is always the round moving
  // on: Standard steps between cards, Mastery gives the verdict — ← Still
  // Learning, → Know It, the two buttons in the order they sit in. Undo (R17)
  // keeps no key of its own: it's a correction, and binding it to the same axis
  // as the verdicts is how a slip becomes two slips.
  //
  // Every branch funnels through the same handler as its button, so they share
  // the debounce lock, the end guards and the complete-screen guard.
  //
  // Reads the mode off the engine, not the `mode` state: this effect runs once,
  // so a state read here would be pinned to the mode the screen opened in.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // The confirm dialog owns the keyboard while it's up, Escape included —
      // otherwise a Space meant for its buttons flips the card behind it.
      if (confirmResetRef.current) return;
      // A focused control in the settings panel keeps its own keys: Space on a
      // checkbox toggles the setting, and this screen claims Space at the window
      // to flip the card. Bailing on inputs is what stops one press doing both.
      //
      // The mode pill is the exception. Its radios are inputs too and they hold
      // focus after a click, so bailing on every input meant that switching mode
      // and then pressing an arrow moved the pill's own selection — a
      // radiogroup's built-in arrow behaviour — instead of touching the card.
      // Radios fall through to the card bindings, and the preventDefault below
      // is what stops the pill from moving underneath them.
      const target = e.target as HTMLElement | null;
      const onModePill = target instanceof HTMLInputElement && target.type === 'radio';
      if (!onModePill && target && (target.tagName === 'INPUT' || target.isContentEditable)) {
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
        else sort('learning');
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

  // Click away to dismiss — the panel has no Done button because it has nothing
  // to confirm: every control in it takes effect as it's touched. Bound only
  // while open, and scoped to the wrapper so the button's own click still
  // toggles rather than being closed here and reopened in the same gesture.
  useEffect(() => {
    if (!settingsOpen) return;
    function onDown(e: PointerEvent) {
      const wrap = settingsWrapRef.current;
      if (wrap && !wrap.contains(e.target as Node)) setSettingsOpen(false);
    }
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [settingsOpen]);

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

  const total = eng.order.length;

  // Direction availability, not gesture availability — whether the gesture runs
  // at all is `enabled` below. Mastery always takes both verdicts; Standard has
  // nothing to the left of its first card.
  function canSwipe(dir: SwipeDir): boolean {
    if (!eng.isBrowseMode()) return true;
    return dir === 'right' || eng.currentIdx > 0;
  }

  // Right is forward in both modes — the next card in Standard, the card you
  // know in Mastery — so the hand learns one axis and the mode decides what it
  // means. Same split the arrow keys already use.
  function commitSwipe(dir: SwipeDir, dx: number) {
    if (touch && !hintSeen) {
      setHintSeen(true);
      Storage.setSwipeHintSeen(true);
    }
    if (eng.isBrowseMode()) browseSwipe(dir, dx);
    else sort(dir === 'right' ? 'known' : 'learning', dir, dx);
  }

  const { swipe, consumeDrag, handlers: swipeHandlers } = useCardSwipe({
    enabled: !showComplete && !!card && exitAnim === null && !confirmReset,
    canSwipe,
    onCommit: commitSwipe,
  });

  // The click that follows every pointer release, drag or not. A gesture that
  // moved the card has already said what it came to say — letting the same
  // release also flip would land every sort on a card showing its other face.
  function onCardClick() {
    if (consumeDrag()) return;
    flip();
  }

  const cardClass =
    (eng.flipped ? 'flipped ' : '') +
    (exitAnim === 'right' ? 'flash-exit-right' : exitAnim === 'left' ? 'flash-exit-left' : '');

  // Standard records nothing, so it gets no verdict cue: a card that turns red
  // on the way to the previous card would be promising a consequence the mode
  // doesn't have. There the card simply follows the finger.
  const cueDir = eng.masteryMode ? swipe.dir ?? buttonCue : null;
  // The cue outlives the drag by the length of its own fade, so it has to keep
  // the hue it was wearing — dropping back to a default mid-fade would flash the
  // other verdict's colour on the way out.
  if (cueDir) lastCueRef.current = cueDir;
  const cueShown = cueDir ?? lastCueRef.current;
  const dragging = swipe.dir !== null || swipe.dx !== 0;
  const cardStyle = {
    // A drag writes its own travel; a button jumps straight to full, which is
    // exactly where a released swipe leaves it. The cue's own 200ms transitions
    // then turn that jump into a bloom over the flight.
    '--swipe-p': String(cueDir ? (swipe.dir ? swipe.progress : 1) : 0),
    ...(exitAnim
      ? {
          '--exit-from': `${exitFromRef.current}px`,
          '--exit-rot': `${tiltFor(exitFromRef.current)}deg`,
        }
      : null),
    ...(swipe.dx !== 0
      ? {
          transform: `translate3d(${swipe.dx}px, 0, 0) rotate(${tiltFor(swipe.dx)}deg)`,
        }
      : null),
  } as CSSProperties;

  // Hidden only where the gesture already does their job — a finger — and only
  // until asked for. Kept in the accessibility tree either way (see the
  // stylesheet): "no buttons" is a statement about the screen, not about what a
  // screen reader can reach.
  const actionsHidden = touch && !buttonsOn;

  const hintText = touch
    ? eng.masteryMode
      ? 'Tap to flip · swipe to sort'
      : 'Tap to flip · swipe to browse'
    : 'Click card to flip, or press ↑ / ↓';

  // A card carries at most one graph, on whichever face it names. Omitted side
  // means the front, which is where a "what is this curve?" card wants it.
  const graphSide = card?.graph ? card.graphSide ?? 'front' : null;

  // Drives how brightly Mastery's core burns — how much of the DECK is mastered,
  // the same fraction the header counts, so the core reads as an ember on a deck
  // barely started and a lit one the moment the last card lands. A deck part-way
  // through opens part-way lit, which is the honest picture of it. Denominator
  // guarded for the empty deck.
  const masteryIntensity = mastery.total > 0 ? mastery.mastered / mastery.total : 1;

  return (
    <section
      id="flashcard-screen"
      className="screen"
      data-mode={mode}
      data-motion={motionOn ? 'on' : 'off'}
      data-actions={actionsHidden ? 'hidden' : 'shown'}
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
        {/* Undo lives with the round's chrome, not with the verdicts. It's a
            correction, and sitting it between Still Learning and Know It gave a
            slip and its repair the same weight and the same neighbourhood — the
            row where every button is one thumb-width from the last. Up here it
            is the one control a phone keeps, because it's the one that can't be
            replaced by a gesture: undo has no direction to be thrown in.
            It sits after the mode pill so the row reads mode first, then the
            one action that mode affords — and so that appearing and vanishing
            with Mastery moves nothing: the pill is anchored left and Settings
            is pushed right, so undo comes and goes in the slack between. */}
        {mode === 'mastery' && (
          <button
            type="button"
            className="flash-undo-btn"
            onClick={undoSort}
            disabled={!eng.canGoBack() || exitAnim !== null}
            aria-label="Undo the last sort"
            title="Undo the last sort"
          >
            <UndoIcon />
          </button>
        )}
        {/* One popover in the far corner for everything that isn't the mode —
            card order and the background field. Neither is a choice a student
            revisits often, so neither competes with the pill that is. */}
        <div className="flash-settings-wrap" ref={settingsWrapRef}>
          <button
            type="button"
            className="btn-ghost flash-settings-btn"
            onClick={() => setSettingsOpen((open) => !open)}
            aria-expanded={settingsOpen}
            aria-label="Settings"
            title="Round settings"
          >
            <span className="flash-settings-word">Settings</span>
            <SettingsIcon />
          </button>
          {settingsOpen && (
            <FlashSettings
              showOrder={mode === 'standard'}
              randomOn={randomOn}
              onRandomToggle={onRandomToggle}
              showButtonsOption={touch}
              buttonsOn={buttonsOn}
              onButtonsToggle={toggleButtons}
              motionOn={motionOn}
              onMotionToggle={toggleMotion}
              showReset={mode === 'mastery'}
              onReset={() => askReset(true)}
            />
          )}
        </div>
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
          {/* Keyed by card: the bar belongs to the card under it, and without a
              key React keeps one element across the change and CSS-transitions
              between two different cards' values — a Know It on a 2/4 card
              followed by a 0/4 card animates two segments going dark, which
              reads as the hit having taken progress away. */}
          {eng.masteryMode && <StreakBar key={card.id} streak={eng.currentStreak()} />}

          <div id="flash-card-wrap">
            <div
              id="flash-card"
              key={card.id}
              className={cardClass}
              style={cardStyle}
              data-dragging={dragging ? 'yes' : 'no'}
              data-swipe={eng.masteryMode ? cueShown : undefined}
              onClick={onCardClick}
              {...swipeHandlers}
            >
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
              {/* The verdict the drag is currently pointed at, crossfading with
                  the card's own words as the card travels: what's written on it
                  gives way to what you're about to do with it, and the rim takes
                  the same colour so the answer is legible from the edge of the
                  eye. Rendered whole in Mastery rather than only mid-drag, so
                  releasing fades it out instead of cutting it. */}
              {eng.masteryMode && (
                <div className="flash-swipe-cue" aria-hidden="true">
                  <span>{cueShown === 'right' ? 'Know It' : 'Still Learning'}</span>
                </div>
              )}
            </div>
          </div>

          {/* The card is the button, so its own affordances have nowhere else to
              be named. On touch that's the gesture, and the line retires itself
              the first time the gesture lands — it was teaching one thing, and
              it gives the height back to the card once that's done. */}
          <p className={'flash-hint' + (touch && hintSeen ? ' is-gone' : '')}>{hintText}</p>

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
              <button className="btn-ghost" onClick={() => sort('learning')} title="Still Learning (←)">
                Still Learning
              </button>
              <button className="btn" onClick={() => sort('known')} title="Know It (→)">
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
              // Mastery's round end. Every card in the working set reached four
              // in a row, which is the whole bar — so this says so plainly.
              <>
                <h3>Round Complete</h3>
                <p>
                  {total} card(s) mastered — four in a row each, spaced out. The deck stays
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
                  {/* Only where a sort actually happened — the already-mastered
                      deck arrives here with an empty undo stack, and a dead
                      button beside two live ones is worse than no button. */}
                  {eng.canGoBack() && (
                    <button className="btn-ghost" onClick={undoSort}>
                      Undo Last Card
                    </button>
                  )}
                  <button className="btn-ghost" onClick={() => onModeSelect('standard')}>
                    Browse the Deck
                  </button>
                  <button className="btn-ghost" onClick={() => askReset(true)}>
                    Reset Progress
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {confirmReset && (
        <ConfirmModal
          title="Reset mastery?"
          message="Every card in this deck goes back to zero."
          confirmLabel="Reset"
          danger
          onConfirm={resetProgress}
          onCancel={() => askReset(false)}
        />
      )}
    </section>
  );
}
