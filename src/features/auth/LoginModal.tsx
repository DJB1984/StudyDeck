// LoginModal — the centred shell around LoginForm.
//
// Still the shape login takes when it's reached from the Share flow, and on
// touch devices, where an anchored plate would sit under the on-screen keyboard
// the email field is about to raise. On the Home header with a mouse, login
// drops an anchored plate instead (see AuthButton) — same form, no overlay.

import { createPortal } from 'react-dom';
import { LoginForm } from './LoginForm';

export function LoginModal({
  onClose,
  initialError,
}: {
  onClose: () => void;
  initialError?: string;
}) {
  // Portaled to <body>, like every other modal in the app. Without it the
  // overlay renders inside the Home header — and .home-hero is a stacking
  // context, so a fixed z-index:200 overlay declared in there still paints
  // UNDER the catalog rows and the add-deck surface below it.
  return createPortal(
    <div
      className="login-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="login-modal-card glass-card">
        <button className="modal-close" onClick={onClose} aria-label="Close">
          &times;
        </button>
        <LoginForm variant="modal" onClose={onClose} initialError={initialError} />
      </div>
    </div>,
    document.body,
  );
}
