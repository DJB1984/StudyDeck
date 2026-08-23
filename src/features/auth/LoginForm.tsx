// LoginForm — the magic-link state machine, with no opinion about its shell.
//
// Four states: idle, loading, sent, error. Loading is styled to tolerate a
// several-second wait without looking broken (Supabase free-tier projects wake
// from an idle pause on first request — R4).
//
// It renders in two shells because login is reached two ways. On the Home
// header it drops as an anchored plate, so signing in doesn't dim the library
// to type forty characters. Reached from the Share flow — and on touch, where a
// centred card beats a plate the on-screen keyboard is about to crowd — it
// renders inside the modal it always has. One state machine, so the two can't
// drift apart on validation, wording, or error handling.

import { useState } from 'react';
import * as SupabaseClient from '../../lib/SupabaseClient';

type Status = 'idle' | 'loading' | 'sent' | 'error';

// R5: reject an obvious typo before burning a real send attempt.
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function LoginForm({
  variant,
  onClose,
  initialError,
}: {
  variant: 'modal' | 'plate';
  onClose: () => void;
  // R6: expired/already-used magic link — AuthButton detects it in the URL and
  // reopens login pre-seeded with the explanatory message.
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

  const plate = variant === 'plate';

  if (status === 'sent') {
    return plate ? (
      // Same footprint, one state later: the plate's marking changes and the
      // ruled row below the hairline becomes the way out. Nothing under the
      // plate moves, because nothing about the plate's shape did.
      <>
        <div className="login-plate-body">
          <span className="plate-label login-plate-label">Check your email</span>
          <p className="login-plate-sent">
            Link sent to <span className="login-plate-address">{email}</span>. Click it to log in.
          </p>
        </div>
        <button className="plate-row-btn" onClick={onClose}>
          Done
        </button>
      </>
    ) : (
      <>
        <h3>Check your email</h3>
        <p>Link sent to {email}. Click it to log in.</p>
        <button className="btn-ghost" onClick={onClose}>
          Close
        </button>
      </>
    );
  }

  // noValidate: our own isValidEmail check + the error line own this UI —
  // without it, the browser's native "@" tooltip pre-empts the submit handler
  // and clashes with the dark theme.
  const field = (
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
  );

  if (plate) {
    return (
      <form onSubmit={handleSubmit} noValidate className="login-plate-form">
        <div className="login-plate-body">
          <span className="plate-label login-plate-label">Sign in</span>
          <p className="login-plate-desc">We'll email you a link — no password needed.</p>
          {field}
          {status === 'error' && <p className="login-modal-error">{error}</p>}
        </div>
        {/* A full-width ruled row under a hairline, the same shape as Log out
            in the account plate — a plate's actions are rows, not buttons
            floating inside it. */}
        <button className="plate-row-btn" type="submit" disabled={status === 'loading'}>
          {status === 'loading' ? 'Sending…' : 'Send login link'}
        </button>
      </form>
    );
  }

  return (
    <>
      <h3>Log in</h3>
      <p className="login-modal-desc">We'll email you a link — no password needed.</p>
      <form onSubmit={handleSubmit} noValidate>
        {field}
        {status === 'error' && <p className="login-modal-error">{error}</p>}
        <button className="btn" type="submit" disabled={status === 'loading'}>
          {status === 'loading' ? 'Sending…' : 'Send login link'}
        </button>
      </form>
    </>
  );
}
