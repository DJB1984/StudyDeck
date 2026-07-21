// LoginModal — email magic-link entry point (spec: Auth.spec.md R2-R7).
// Four states: idle, loading, sent, error. Loading is styled to tolerate a
// several-second wait without looking broken (Supabase free-tier projects
// wake from an idle pause on first request — R4).

import { useState } from 'react';
import * as SupabaseClient from '../../lib/SupabaseClient';

type Status = 'idle' | 'loading' | 'sent' | 'error';

// R5: reject an obvious typo before burning a real send attempt.
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function LoginModal({
  onClose,
  initialError,
}: {
  onClose: () => void;
  // R6: expired/already-used magic link — AuthButton detects it in the URL
  // and reopens this modal pre-seeded with the explanatory message.
  initialError?: string;
}) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>(initialError ? 'error' : 'idle');
  const [error, setError] = useState(initialError ?? '');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidEmail(email)) {
      setStatus('error');
      setError('Enter a valid email address.');
      return;
    }
    setStatus('loading');
    const { error: sendError } = await SupabaseClient.signInWithOtp(email.trim());
    if (sendError) {
      setStatus('error');
      // R7: generic message, never the raw provider/error string.
      setError("Couldn't send the login email, try again.");
      return;
    }
    setStatus('sent');
  }

  return (
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

        {status === 'sent' ? (
          <>
            <h3>Check your email</h3>
            <p>Link sent to {email}. Click it to log in.</p>
            <button className="btn-ghost" onClick={onClose}>
              Close
            </button>
          </>
        ) : (
          <>
            <h3>Log in</h3>
            <p className="login-modal-desc">
              We'll email you a link — no password needed.
            </p>
            {/* noValidate: our own isValidEmail check + .login-modal-error
                owns this UI — without it, the browser's native "@" tooltip
                pre-empts the submit handler and clashes with the dark theme. */}
            <form onSubmit={handleSubmit} noValidate>
              <input
                type="email"
                className="login-email-input"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (status === 'error') setStatus('idle');
                }}
                placeholder="you@example.com"
                autoFocus
                disabled={status === 'loading'}
              />
              {status === 'error' && <p className="login-modal-error">{error}</p>}
              <button className="btn" type="submit" disabled={status === 'loading'}>
                {status === 'loading' ? 'Sending…' : 'Send login link'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
