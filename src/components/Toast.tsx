// Toast — the app-level error surface (spec: src/components/Toast.spec.md).
// Registers itself with the toast bus so any module (React or not) can call
// showError() and have it appear here. Auto-dismisses after a reading-time
// delay that scales with message length; the × still dismisses immediately.

import { useEffect, useRef, useState } from 'react';
import { setToastListener } from '../lib/toast';

// R6: single-line errors get ~5s; multi-line validation errors get longer
// (they can be ten-plus lines), capped so nothing lingers past ~12s.
function dismissDelay(msg: string): number {
  const extraLines = msg.split('\n').length - 1;
  return Math.min(12000, 5000 + extraLines * 1500);
}

export function Toast() {
  const [msg, setMsg] = useState('');
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    setToastListener((m) => {
      setMsg(m);
      setVisible(true);
      // R7: a new message replaces the old one AND restarts the clock —
      // always cancel the pending timer before scheduling, or a stale short
      // timer will kill a fresh long message early.
      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setVisible(false), dismissDelay(m));
    });
    return () => {
      setToastListener(null);
      window.clearTimeout(timerRef.current); // R9: no setState after unmount
    };
  }, []);

  // R5/R8: manual dismiss stays, and cancels the pending timer.
  function dismiss() {
    window.clearTimeout(timerRef.current);
    setVisible(false);
  }

  return (
    <div id="error-toast" className={visible ? 'visible' : ''}>
      <button className="toast-close" onClick={dismiss} aria-label="Dismiss">
        &times;
      </button>
      <span id="error-toast-msg">{msg}</span>
    </div>
  );
}
