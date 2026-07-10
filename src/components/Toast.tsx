// Toast — the app-level error surface. Registers itself with the toast bus so
// any module (React or not) can call showError() and have it appear here.
// Dismissible, supports multi-line text (white-space: pre-wrap via CSS).

import { useEffect, useState } from 'react';
import { setToastListener } from '../lib/toast';

export function Toast() {
  const [msg, setMsg] = useState('');
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setToastListener((m) => {
      setMsg(m);
      setVisible(true);
    });
    return () => setToastListener(null);
  }, []);

  return (
    <div id="error-toast" className={visible ? 'visible' : ''}>
      <button className="toast-close" onClick={() => setVisible(false)} aria-label="Dismiss">
        &times;
      </button>
      <span id="error-toast-msg">{msg}</span>
    </div>
  );
}
