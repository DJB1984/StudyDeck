// In-app confirmation dialog — replaces window.confirm() so destructive
// actions ask in the app's own voice/styling instead of a browser chrome popup.
// Overlay/card structure mirrors HomeScreen's CopyPromptModal and the auth
// LoginModal; portaled to document.body so no ancestor can trap the overlay.

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export function ConfirmModal({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  /** Optional — omit when the title alone says everything. */
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Focus Cancel, not Confirm — a stray Enter should never delete anything.
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return createPortal(
    <div
      className="confirm-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="confirm-modal-card glass-card" role="alertdialog" aria-modal="true">
        <h3>{title}</h3>
        {message && <p className="confirm-modal-message">{message}</p>}
        <div className="confirm-modal-actions">
          <button ref={cancelRef} className="btn-ghost" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button className={danger ? 'btn btn-danger' : 'btn'} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
