// The flashcard's drag gesture, and the two media queries the screen reads.
//
// One Pointer Events path covers finger, pen and mouse, so a desktop click-drag
// gets exactly the feedback a phone swipe does. That isn't symmetry for its own
// sake: the card visibly moves under any pointer, and a card that moves under a
// mouse has to be a card you can actually throw with one.
//
// The hook owns motion and commitment only. What a direction *means* — sort,
// browse, or nothing — stays in FlashcardScreen, because it differs by mode and
// this file has no business knowing there are modes.

import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

export type SwipeDir = 'left' | 'right';

// Travel before the gesture commits to an axis. Under it the drag is still
// undecided and the page keeps its vertical scroll; past it the card takes the
// pointer for good and `touch-action: pan-y` stops the browser panning sideways.
const AXIS_LOCK_PX = 10;
// Commit distance, as a share of the card's own width — floored so a narrow
// phone card can't be sorted by a twitch, capped so a 760px desktop card
// doesn't ask for a forearm.
const COMMIT_FRACTION = 0.28;
const COMMIT_MIN_PX = 72;
const COMMIT_MAX_PX = 150;
// A flick: short but fast commits too, the way a thrown card does. Both
// conditions are required, and the throw has to still be travelling the way it
// travelled — otherwise a drag hauled out and yanked back would commit on the
// yank.
const FLICK_SPEED = 0.55; // px per ms
const FLICK_MIN_PX = 44;
// How far a direction with nothing behind it is allowed to give. Not zero: a
// card that refuses to move at all reads as broken rather than as bounded.
const BLOCKED_RESISTANCE = 0.22;
const BLOCKED_MAX_PX = 44;

export interface SwipeState {
  /** The direction currently being dragged, or null when idle or blocked. */
  dir: SwipeDir | null;
  /** Pixels the card should be offset by right now. */
  dx: number;
  /** 0–1 toward commitment. Drives the crossfade, so it is the whole cue. */
  progress: number;
}

const IDLE: SwipeState = { dir: null, dx: 0, progress: 0 };

interface Options {
  /** False while a card is flying out, on the complete screen, or under a dialog. */
  enabled: boolean;
  /** Whether this direction has anything to commit to right now. */
  canSwipe: (dir: SwipeDir) => boolean;
  /** `dx` is where the finger let go, so the exit can start from there. */
  onCommit: (dir: SwipeDir, dx: number) => void;
}

export function useCardSwipe({ enabled, canSwipe, onCommit }: Options) {
  const [swipe, setSwipe] = useState<SwipeState>(IDLE);
  const startRef = useRef<{ x: number; y: number; id: number; threshold: number } | null>(null);
  const lockedRef = useRef(false);
  const lastRef = useRef({ x: 0, t: 0 });
  const velocityRef = useRef(0);
  // Set the moment an axis locks and read by the card's click handler, which
  // fires right after the pointer is released: without this, every completed
  // drag would also flip the card it just sorted.
  const draggedRef = useRef(false);

  function reset() {
    startRef.current = null;
    lockedRef.current = false;
    velocityRef.current = 0;
    setSwipe(IDLE);
  }

  // A card that becomes undraggable mid-drag (the round ended, a dialog opened)
  // must not keep its offset — the next card would mount already pushed aside.
  useEffect(() => {
    if (!enabled) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  function onPointerDown(e: ReactPointerEvent<HTMLElement>) {
    if (!enabled) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    draggedRef.current = false;
    const width = e.currentTarget.clientWidth || COMMIT_MAX_PX;
    startRef.current = {
      x: e.clientX,
      y: e.clientY,
      id: e.pointerId,
      threshold: Math.max(COMMIT_MIN_PX, Math.min(width * COMMIT_FRACTION, COMMIT_MAX_PX)),
    };
    lastRef.current = { x: e.clientX, t: e.timeStamp };
    velocityRef.current = 0;
  }

  function onPointerMove(e: ReactPointerEvent<HTMLElement>) {
    const start = startRef.current;
    if (!start || start.id !== e.pointerId) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;

    if (!lockedRef.current) {
      if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return;
      // Vertical wins ties, and a vertical drag abandons the gesture outright
      // rather than waiting to see if it turns — the page's own scroll is the
      // more valuable of the two, and it has to start on the same pixel a
      // scroll anywhere else would.
      if (Math.abs(dx) <= Math.abs(dy)) {
        startRef.current = null;
        return;
      }
      lockedRef.current = true;
      draggedRef.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }

    const dt = e.timeStamp - lastRef.current.t;
    if (dt > 0) velocityRef.current = (e.clientX - lastRef.current.x) / dt;
    lastRef.current = { x: e.clientX, t: e.timeStamp };

    const dir: SwipeDir = dx < 0 ? 'left' : 'right';
    if (canSwipe(dir)) {
      setSwipe({ dir, dx, progress: Math.min(Math.abs(dx) / start.threshold, 1) });
    } else {
      // Moves, but heavily damped and with no cue: the card is saying "not this
      // way" in the only vocabulary a drag has.
      const held = Math.min(Math.abs(dx) * BLOCKED_RESISTANCE, BLOCKED_MAX_PX);
      setSwipe({ dir: null, dx: Math.sign(dx) * held, progress: 0 });
    }
  }

  function onPointerUp(e: ReactPointerEvent<HTMLElement>) {
    const start = startRef.current;
    const locked = lockedRef.current;
    const velocity = velocityRef.current;
    if (!start || start.id !== e.pointerId) {
      reset();
      return;
    }
    const dx = e.clientX - start.x;
    reset();
    if (!locked) return;

    const dir: SwipeDir = dx < 0 ? 'left' : 'right';
    if (!canSwipe(dir)) return;
    const flicked =
      Math.abs(velocity) >= FLICK_SPEED &&
      Math.abs(dx) >= FLICK_MIN_PX &&
      Math.sign(velocity) === Math.sign(dx);
    if (Math.abs(dx) >= start.threshold || flicked) onCommit(dir, dx);
  }

  return {
    swipe,
    /** True once per gesture that actually dragged; reading it clears it. */
    consumeDrag(): boolean {
      const dragged = draggedRef.current;
      draggedRef.current = false;
      return dragged;
    },
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: reset,
    },
  };
}

