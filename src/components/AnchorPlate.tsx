// AnchorPlate — a ruled plate set down beneath the control that opened it.
//
// The header's grammar: every control up there answers a click by dropping a
// plate, never by covering the viewport. Copy Prompt and Log in used to open
// full-screen modals, which meant the pointer travelled from a corner to the
// centre of the screen and back to make a two-item choice or type an email.
// The account menu already did this the right way; this is that mechanism
// generalised, so the three controls stop behaving like three unrelated
// widgets.
//
// The plate is ALWAYS MOUNTED and driven by the `open` class alone. Rendering
// it conditionally would unmount it the instant `open` flipped false, skipping
// the close transition; `visibility: hidden` is what keeps a closed plate out
// of the tab order.

import { useCallback, useEffect, useRef, useState } from 'react';

// Matches the plate's close transition in styles.css. Deferred children are
// dropped once the plate has finished animating away, never during.
const PLATE_EXIT_MS = 160;

export interface PlateTriggerProps {
  ref: React.Ref<HTMLButtonElement>;
  onClick: (e: React.MouseEvent) => void;
  'aria-expanded': boolean;
  'aria-haspopup': 'menu' | 'dialog';
}

export function AnchorPlate({
  open,
  onOpenChange,
  // Header plates anchor right — they sit in the page's far corner, so a plate
  // hung off the left edge would run off a narrow viewport. A plate opened from
  // mid-card anchors left instead, under the control rather than beside it.
  align = 'right',
  haspopup = 'menu',
  role,
  label,
  // Hold the children out of the DOM until the plate opens, and drop them one
  // transition after it closes. A plate carrying a form wants this: `autoFocus`
  // fires on mount, so a permanently-mounted field would grab focus while
  // invisible, and reopening should offer a clean slate rather than whatever
  // half-typed state was abandoned. The delay is what keeps the closing plate
  // from emptying out mid-animation.
  deferChildren = false,
  wrapClassName = '',
  plateClassName = '',
  trigger,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  align?: 'left' | 'right';
  haspopup?: 'menu' | 'dialog';
  role?: string;
  label?: string;
  deferChildren?: boolean;
  wrapClassName?: string;
  plateClassName?: string;
  trigger: (props: PlateTriggerProps) => React.ReactNode;
  children: React.ReactNode;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const plateRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(open);
  const [mounted, setMounted] = useState(open);

  // Held in a ref so the listener effect below depends on `open` alone.
  // Consumers pass inline arrows; without this every render of the host would
  // tear down and re-arm the document listeners, restarting the one-tick
  // deferral that keeps the opening click from closing the plate again.
  const changeRef = useRef(onOpenChange);
  changeRef.current = onOpenChange;
  const close = useCallback(() => changeRef.current(false), []);

  const isMenu = role === 'menu';

  useEffect(() => {
    if (!deferChildren) return;
    if (open) {
      setMounted(true);
      return;
    }
    const id = window.setTimeout(() => setMounted(false), PLATE_EXIT_MS);
    return () => window.clearTimeout(id);
  }, [open, deferChildren]);

  useEffect(() => {
    if (!open) return;
    // A click anywhere outside the trigger or its plate closes it; one inside
    // (selecting the email text, say) leaves it open. Deferred one tick so the
    // trigger's own click — the one that set open=true — doesn't immediately
    // close it again through this same listener.
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    // A plate is not a modal and does not trap focus: tabbing past its last
    // control leaves, and leaving closes. (Click-outside doesn't cover this —
    // a keyboard exit fires no click.)
    const onFocusIn = (e: FocusEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) close();
    };
    const id = window.setTimeout(() => document.addEventListener('click', onClick), 0);
    document.addEventListener('keydown', onKey);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('focusin', onFocusIn);
    };
  }, [open, close]);

  useEffect(() => {
    // Closing while focus is still inside the plate would strand it on an
    // element `visibility: hidden` has just dropped from the tab order, which
    // sends focus to <body> and loses the keyboard's place on the page. Hand it
    // back to the control that opened the plate — after an Escape, and after a
    // row inside the plate closes it by acting.
    if (wasOpen.current && !open && plateRef.current?.contains(document.activeElement)) {
      triggerRef.current?.focus();
    }
    wasOpen.current = open;
  }, [open]);

  function items(): HTMLElement[] {
    return Array.from(plateRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
  }

  // A plate declaring role="menu" has to behave like one: arrow keys walk the
  // rows, Home/End jump to the ends. Declaring the role without wiring the keys
  // would promise a screen-reader user an interaction that isn't there.
  function onPlateKeyDown(e: React.KeyboardEvent) {
    if (!isMenu) return;
    const rows = items();
    if (rows.length === 0) return;
    const at = rows.indexOf(document.activeElement as HTMLElement);
    let next = -1;
    if (e.key === 'ArrowDown') next = at < 0 ? 0 : (at + 1) % rows.length;
    else if (e.key === 'ArrowUp') next = at <= 0 ? rows.length - 1 : at - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = rows.length - 1;
    if (next < 0) return;
    e.preventDefault();
    rows[next]?.focus();
  }

  return (
    <div className={'anchor-plate-wrap ' + wrapClassName} ref={wrapRef}>
      {trigger({
        ref: triggerRef,
        onClick: (e: React.MouseEvent) => {
          const next = !open;
          onOpenChange(next);
          // A menu opened from the keyboard lands on its first row, the way any
          // menu does. Opened by pointer it does not, so the plate appears
          // without a focus ring the mouse user never asked for. `detail === 0`
          // is the click synthesised by Enter/Space on a button.
          if (next && isMenu && e.detail === 0) {
            window.setTimeout(() => items()[0]?.focus(), 0);
          }
        },
        'aria-expanded': open,
        'aria-haspopup': haspopup,
      })}
      <div
        ref={plateRef}
        className={
          'anchor-plate anchor-plate-' + align + ' ' + plateClassName + (open ? ' open' : '')
        }
        role={role}
        aria-label={label}
        onKeyDown={onPlateKeyDown}
      >
        {!deferChildren || mounted ? children : null}
      </div>
    </div>
  );
}
