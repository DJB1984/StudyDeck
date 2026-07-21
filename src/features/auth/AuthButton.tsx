// AuthButton — Home screen header element (spec: Auth.spec.md R1, R8-R10).
// Logged out: ghost "Log in" button. Logged in: a glass circular avatar
// (generic person icon, matching the app's liquid-glass surfaces rather than
// a solid per-email color) that smoothly grows into a panel showing the
// email and a "Log out" button (see styles.css .auth-panel for the
// animation). Also owns the two pieces of app-startup auth wiring that
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
function PersonIcon() {
  return (
    <svg className="auth-person-icon" viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="38" r="20" />
      <circle cx="50" cy="112" r="46" />
    </svg>
  );
}

// Must match .auth-panel-header's icon width + gap + padding in styles.css —
// kept as constants here (rather than reading computed styles) since they're
// simple, stable design values used to compute the content-fit panel width.
const ICON_AREA_WIDTH = 20 + 12; // icon + gap to the email text
const PANEL_TEXT_PAD_LEFT = 13;
const PANEL_TEXT_PAD_RIGHT = 13;
const PANEL_COLLAPSED_SIZE = 40;

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
  const emailTextRef = useRef<HTMLSpanElement>(null);
  const [expandedWidth, setExpandedWidth] = useState(PANEL_COLLAPSED_SIZE);

  // Content-fit expanded width: measures the email text's actual rendered
  // width so the panel is only ever as wide as it needs to be. Without this,
  // a fixed width leaves asymmetric empty space after short emails — this is
  // what makes the row look properly centered rather than lopsided.
  useEffect(() => {
    if (emailTextRef.current) {
      setExpandedWidth(
        emailTextRef.current.scrollWidth +
          ICON_AREA_WIDTH +
          PANEL_TEXT_PAD_LEFT +
          PANEL_TEXT_PAD_RIGHT,
      );
    }
  }, [email]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    // Deferred one tick so the avatar's own click (which set menuOpen=true)
    // doesn't immediately close it again via this same listener.
    const id = window.setTimeout(() => document.addEventListener('click', close), 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener('click', close);
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
        <button className="btn-ghost auth-login-btn" onClick={() => setModalOpen(true)}>
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

  // Header and body stay in the DOM always (never conditionally rendered) —
  // the "expanded" class alone drives the animation, both opening AND
  // closing. Conditionally rendering would unmount the panel the instant
  // menuOpen flips false, skipping the close transition entirely.
  //
  // The panel is a liquid-glass surface (var(--surface)/var(--surface-hover)
  // + backdrop-filter) in BOTH collapsed and expanded states — matching the
  // app's existing glass cards, and avoiding a jarring solid-color-to-glass
  // transition. The person icon stays a fixed-size, fixed-position badge;
  // the email and Log out button slide/fade in next to and below it.
  return (
    <div className="auth-avatar-wrap">
      <div
        className={'auth-panel' + (menuOpen ? ' expanded' : '')}
        style={{ width: menuOpen ? expandedWidth : PANEL_COLLAPSED_SIZE }}
      >
        <button
          className="auth-panel-header"
          onClick={() => setMenuOpen((v) => !v)}
          title={email ?? undefined}
          aria-expanded={menuOpen}
        >
          <PersonIcon />
          <span className="auth-email-slide" ref={emailTextRef}>
            {email}
          </span>
        </button>
        <div className="auth-panel-body">
          <button className="auth-logout-btn" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </div>
    </div>
  );
}
