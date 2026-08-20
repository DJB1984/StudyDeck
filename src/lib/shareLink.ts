// shareLink — the URL half of sharing: reading a token off the address bar,
// and building the link that carries one.
//
// A QUERY PARAM (`/?s=<token>`), not a path (`/s/<token>`): the app ships as a
// static bundle on shared hosting with no rewrite rules, so any path but `/`
// would 404 before React ever loaded. The param form works from `file://` and
// `npm run preview` too.

const SHARE_PARAM = 's';

// Matches the 12-char URL-safe base64 the create_share() SQL function mints,
// with slack for a future length change. Anything else never reaches the
// network — a malformed token is a typo'd link, not a lookup.
const TOKEN_RE = /^[A-Za-z0-9_-]{6,64}$/;

export function readShareTokenFromUrl(): string | null {
  try {
    const token = new URLSearchParams(window.location.search).get(SHARE_PARAM);
    return token && TOKEN_RE.test(token) ? token : null;
  } catch {
    return null;
  }
}

/**
 * Drop the token from the address bar without a navigation, so a refresh (or a
 * later bookmark) lands on Home rather than re-running the add flow — and so
 * the link isn't left sitting in the URL of a shared browser.
 */
export function clearShareTokenFromUrl(): void {
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete(SHARE_PARAM);
    const search = url.searchParams.toString();
    history.replaceState(null, '', url.pathname + (search ? `?${search}` : '') + url.hash);
  } catch {
    /* cosmetic — the flow works with the param still showing */
  }
}

export function shareUrlFor(token: string): string {
  const url = new URL(window.location.href);
  url.hash = '';
  url.search = `?${SHARE_PARAM}=${encodeURIComponent(token)}`;
  return url.toString();
}
