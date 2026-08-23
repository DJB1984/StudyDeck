// AuthButton — Home screen header element.
//
// Logged out: a ghost "Log in" control that drops the login form as an anchored
// plate — the header's grammar, and the reason typing an email no longer means
// dimming the whole library to reach a field in the centre of the screen. On
// touch it opens the centred modal instead, since a plate anchored to the top
// of the page is exactly where the on-screen keyboard would crowd it.
//
// Logged in: a circular avatar (generic person icon, matching the app's solid
// panel surfaces rather than a solid per-email colour) dropping a ruled account
// plate beneath it — the email under a brass plate marking, and a full-width
// "Log out" row under a hairline.
//
// It also owns the two pieces of app-startup auth wiring that belong nowhere
// else: detecting an expired/used magic link in the URL (R6), and kicking off
// migration exactly once per real sign-in (R11/R14, via
// SupabaseClient.onSignedIn).

import { useEffect, useState } from 'react';
import { Storage } from '../../lib/Storage';
import * as SupabaseClient from '../../lib/SupabaseClient';
import { useMediaQuery, TOUCH_QUERY } from '../../lib/useMediaQuery';
import { AnchorPlate } from '../../components/AnchorPlate';
import { LoginModal } from './LoginModal';
import { LoginForm } from './LoginForm';
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

const EXPIRED_LINK_MESSAGE = 'This link has expired or was already used, request a new one.';

export function AuthButton() {
  const [loggedIn, setLoggedIn] = useState(SupabaseClient.isLoggedIn());
  const [email, setEmail] = useState(SupabaseClient.getUserEmail());
  const [loginOpen, setLoginOpen] = useState(false);
  const [expiredError, setExpiredError] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const touch = useMediaQuery(TOUCH_QUERY);

  useEffect(() => {
    if (consumeExpiredLinkError()) {
      setExpiredError(true);
      setLoginOpen(true);
    }

    const unsubState = SupabaseClient.onAuthStateChange((session) => {
      setLoggedIn(session !== null);
      setEmail(session?.user.email ?? null);
      if (session !== null) setLoginOpen(false);
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

  function closeLogin() {
    setLoginOpen(false);
    setExpiredError(false);
  }

  if (!loggedIn) {
    // Same glyph as the logged-in avatar — see .auth-login-btn in styles.css
    // for why the two states share it.
    const label = (
      <>
        <PersonIcon className="auth-login-icon" />
        Log in
      </>
    );

    // Touch keeps the modal: a plate pinned to the top of the page is precisely
    // where a raised keyboard leaves the least room, and a centred card is the
    // shape every mobile sign-in already is.
    if (touch) {
      return (
        <>
          <button className="auth-login-btn" onClick={() => setLoginOpen(true)}>
            {label}
          </button>
          {loginOpen && (
            <LoginModal
              onClose={closeLogin}
              initialError={expiredError ? EXPIRED_LINK_MESSAGE : undefined}
            />
          )}
        </>
      );
    }

    return (
      <AnchorPlate
        open={loginOpen}
        onOpenChange={(next) => (next ? setLoginOpen(true) : closeLogin())}
        haspopup="dialog"
        role="dialog"
        label="Log in"
        deferChildren
        wrapClassName="login-plate-wrap"
        plateClassName="login-plate"
        trigger={(props) => (
          <button className="auth-login-btn" {...props}>
            {label}
          </button>
        )}
      >
        <LoginForm
          variant="plate"
          onClose={closeLogin}
          initialError={expiredError ? EXPIRED_LINK_MESSAGE : undefined}
        />
      </AnchorPlate>
    );
  }

  // The avatar itself never moves or changes shape: the menu is a separate
  // plate set down beneath it. That's the whole difference from the old
  // grow-from-circle morph — no control in this system changes its own
  // geometry, and nothing rounds past the 4px system maximum.
  return (
    <AnchorPlate
      open={menuOpen}
      onOpenChange={setMenuOpen}
      label="Account"
      wrapClassName="auth-avatar-wrap"
      trigger={(props) => (
        <button className="auth-avatar-btn" title={email ?? undefined} aria-label="Account" {...props}>
          <PersonIcon />
        </button>
      )}
    >
      <div className="auth-menu-id">
        <span className="plate-label auth-menu-label">Signed in</span>
        <span className="auth-menu-email" title={email ?? undefined}>
          {email}
        </span>
      </div>
      <button className="plate-row-btn" onClick={handleLogout}>
        Log out
      </button>
    </AnchorPlate>
  );
}
