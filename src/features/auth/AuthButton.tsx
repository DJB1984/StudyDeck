// AuthButton — Home screen header element.
// Logged out: ghost "Log in" button. Logged in: a circular avatar (generic
// person icon, matching the app's solid panel surfaces rather than a solid
// per-email color) that drops a ruled account plate beneath it — the email
// under a brass plate marking, and a full-width "Log out" row under a
// hairline (see styles.css .auth-menu). Also owns the two pieces of
// app-startup auth wiring that
// belong nowhere else: detecting an expired/used magic link in the URL (R6),
// and kicking off migration exactly once per real sign-in (R11/R14, via
// SupabaseClient.onSignedIn).

import { useEffect, useRef, useState } from 'react';
import { Storage } from '../../lib/Storage';
import * as SupabaseClient from '../../lib/SupabaseClient';
import { LoginModal } from './LoginModal';
import { syncOnLogin } from './migration';

// Generic person silhouette (head + shoulders), matching the placeholder
// avatar convention used by Gmail/Slack/etc. Two circles: the shoulder
// circle's center sits below the viewBox, so only its top arc shows —
// SVG clips to its viewBox by default, no extra CSS needed.
function PersonIcon({ className = 'auth-person-icon' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="38" r="20" />
      <circle cx="50" cy="112" r="46" />
    </svg>
  );
}

// R6: Supabase redirects an expired/already-used magic link back with
// `#error=...&error_code=otp_expired...` in the URL hash rather than through
// onAuthStateChange — check for it once at startup.
function consumeExpiredLinkError(): boolean {
  if (!window.location.hash.includes('error=')) return false;
  const params = new URLSearchParams(window.location.hash.slice(1));
  const isAuthError = params.has('error') || params.has('error_code');
  if (isAuthError) {
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }
  return isAuthError;
}

export function AuthButton() {
  const [loggedIn, setLoggedIn] = useState(SupabaseClient.isLoggedIn());
  const [email, setEmail] = useState(SupabaseClient.getUserEmail());
  const [modalOpen, setModalOpen] = useState(false);
  const [expiredError, setExpiredError] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    // A click anywhere outside the avatar or its plate closes the menu; one
    // inside (selecting the email text, say) leaves it open. Deferred one
    // tick so the avatar's own click — the one that set menuOpen=true —
    // doesn't immediately close it again via this same listener.
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    const id = window.setTimeout(() => document.addEventListener('click', onClick), 0);
    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (consumeExpiredLinkError()) {
      setExpiredError(true);
      setModalOpen(true);
    }

    const unsubState = SupabaseClient.onAuthStateChange((session) => {
      setLoggedIn(session !== null);
      setEmail(session?.user.email ?? null);
      if (session !== null) setModalOpen(false);
    });
    // R11/R14: fires once per real login (not on every mount/page load of an
    // already-persisted session) — the exact moment migration should run.
    const unsubSignIn = SupabaseClient.onSignedIn(() => {
      void syncOnLogin();
    });
    return () => {
      unsubState();
      unsubSignIn();
    };
  }, []);

  async function handleLogout() {
    setMenuOpen(false);
    await SupabaseClient.signOut();
    // Shared-device privacy: return to a clean guest slate on logout. Cloud
    // data is untouched — logging back in restores it via hydration.
    Storage.clearLocal();
  }

  if (!loggedIn) {
    return (
      <>
        {/* Same glyph as the logged-in avatar — see .auth-login-btn in
            styles.css for why the two states share it. */}
        <button className="auth-login-btn" onClick={() => setModalOpen(true)}>
          <PersonIcon className="auth-login-icon" />
          Log in
        </button>
        {modalOpen && (
          <LoginModal
            onClose={() => {
              setModalOpen(false);
              setExpiredError(false);
            }}
            initialError={
              expiredError
                ? 'This link has expired or was already used, request a new one.'
                : undefined
            }
          />
        )}
      </>
    );
  }

  // The plate stays in the DOM always (never conditionally rendered) — the
  // "open" class alone drives it, both opening AND closing. Conditional
  // rendering would unmount the plate the instant menuOpen flips false,
  // skipping the close transition entirely.
  //
  // The avatar itself never moves or changes shape: the menu is a separate
  // plate set down beneath it. That's the whole difference from the old
  // grow-from-circle morph — no control in this system changes its own
  // geometry, and nothing rounds past the 4px system maximum.
  return (
    <div className="auth-avatar-wrap" ref={wrapRef}>
      <button
        className="auth-avatar-btn"
        onClick={() => setMenuOpen((v) => !v)}
        title={email ?? undefined}
        aria-label="Account"
        aria-expanded={menuOpen}
        aria-haspopup="menu"
      >
        <PersonIcon />
      </button>
      <div className={'auth-menu' + (menuOpen ? ' open' : '')}>
        <div className="auth-menu-id">
          <span className="auth-menu-label">Signed in</span>
          <span className="auth-menu-email" title={email ?? undefined}>
            {email}
          </span>
        </div>
        <button className="auth-logout-btn" onClick={handleLogout}>
          Log out
        </button>
      </div>
    </div>
  );
}
