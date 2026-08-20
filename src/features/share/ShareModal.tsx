// ShareModal — "get me a link to this study set", opened from a deck card's
// share button on Home.
//
// Three states, and which one it opens in is decided before any network call:
//   • the deck already has a link  → show it, copy it, no request at all
//   • signed out, no link yet      → log in from here (creating a link needs an
//                                    account; Davis, 2026-08-19)
//   • signed in, no link yet       → publish, then show the link
//
// Overlay/card/close structure mirrors LoginModal and CopyPromptModal.

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { HistoryEntry } from '../../types';
import * as SupabaseClient from '../../lib/SupabaseClient';
import { Storage } from '../../lib/Storage';
import { deckHash } from '../../lib/deckIdentity';
import { copyWithFeedback } from '../../lib/clipboard';
import { shareUrlFor } from '../../lib/shareLink';
import { LoginModal } from '../auth/LoginModal';

type Status = 'ready' | 'creating' | 'signin' | 'error';

export function ShareModal({ file, onClose }: { file: HistoryEntry; onClose: () => void }) {
  const [token, setToken] = useState<string | null>(file.shareToken ?? null);
  const [status, setStatus] = useState<Status>(file.shareToken ? 'ready' : 'creating');
  const [error, setError] = useState('');
  const [copyLabel, setCopyLabel] = useState('Copy link');
  const [loginOpen, setLoginOpen] = useState(false);

  // Publishing is driven off the status rather than run once on mount, so
  // "log in, then try again" is a single setStatus('creating') away.
  useEffect(() => {
    if (status !== 'creating') return;
    let cancelled = false;

    async function publish() {
      // Wait for the session check to settle first — a page that has just
      // loaded reports "logged out" for a beat while Supabase restores the
      // session from storage, and acting on that would show a returning user
      // a sign-in prompt they don't need.
      await SupabaseClient.ready();
      if (cancelled) return;
      if (!SupabaseClient.isLoggedIn()) {
        setStatus('signin');
        return;
      }
      const { token: created, error: failure } = await SupabaseClient.createShare(
        file,
        deckHash(file.data),
      );
      if (cancelled) return;
      if (!created) {
        setStatus('error');
        setError(failure ?? "Couldn't create a link. Try again.");
        return;
      }
      // Stamp the token on the deck so a second Share is instant and offline,
      // and so a link the sharer clicks themselves finds this deck instead of
      // adding a copy of it.
      Storage.saveFile({ ...file, shareToken: created });
      setToken(created);
      setStatus('ready');
    }

    void publish();
    return () => {
      cancelled = true;
    };
  }, [status, file]);

  // Logging in from inside this modal should finish what the student came here
  // for. Only listens while the login step is open — elsewhere this modal has
  // no business reacting to auth changes.
  useEffect(() => {
    if (!loginOpen) return;
    return SupabaseClient.onAuthStateChange((session) => {
      if (!session) return;
      setLoginOpen(false);
      setStatus('creating');
    });
  }, [loginOpen]);

  const link = token ? shareUrlFor(token) : '';

  return createPortal(
    <>
      <div
        className="share-modal-overlay"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="share-modal-card glass-card">
          <button className="modal-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
          <h3>Share this study set</h3>

          {status === 'creating' && (
            <p className="share-modal-desc share-modal-working">Making a link…</p>
          )}

          {status === 'signin' && (
            <>
              <p className="share-modal-desc">
                Log in to create a share link. Anyone you send it to can add the set without an
                account of their own.
              </p>
              <button className="btn" onClick={() => setLoginOpen(true)}>
                Log in
              </button>
            </>
          )}

          {status === 'error' && (
            <>
              <p className="share-modal-error">{error}</p>
              <button className="btn-ghost" onClick={() => setStatus('creating')}>
                Try again
              </button>
            </>
          )}

          {status === 'ready' && token && (
            <>
              <p className="share-modal-desc">
                Anyone with this link can add <strong>{file.title}</strong> to their own library —
                no account needed.
              </p>
              {/* readOnly rather than disabled: a disabled input can't be
                  selected, and selecting the link by hand is the fallback when
                  the clipboard API is unavailable (Safari without a gesture, or
                  a page served over plain http). */}
              <input
                className="share-link-input"
                value={link}
                readOnly
                onFocus={(e) => e.currentTarget.select()}
              />
              <button
                className="btn"
                onClick={() => copyWithFeedback(link, setCopyLabel, 'Copy link')}
              >
                {copyLabel}
              </button>
            </>
          )}
        </div>
      </div>
      {/* Renders after the share overlay, so it stacks on top at equal z-index. */}
      {loginOpen && <LoginModal onClose={() => setLoginOpen(false)} />}
    </>,
    document.body,
  );
}
