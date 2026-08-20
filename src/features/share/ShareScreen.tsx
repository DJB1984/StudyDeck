// ShareScreen — what a share link opens. The one screen a student can land on
// without having been to Home first, so it explains itself and never assumes
// an account.
//
// The whole point of the screen is the choice: a link drops a study set into
// someone's library only if they say yes. The exception is a deck they already
// have, which needs no choice at all — it just opens (Davis, 2026-08-19).

import { useEffect, useRef, useState } from 'react';
import type { HistoryEntry } from '../../types';
import type { SharedDeck } from '../../lib/SupabaseClient';
import * as SupabaseClient from '../../lib/SupabaseClient';
import { Storage, MAX_DECKS } from '../../lib/Storage';
import { validateDeck } from '../../lib/DeckValidation';
import { clearShareTokenFromUrl } from '../../lib/shareLink';
import { Starfield } from '../../components/Starfield/Starfield';
import { addSharedDeck, findExistingCopy } from './shareLibrary';

type State =
  | { name: 'loading' }
  | { name: 'offer'; shared: SharedDeck }
  | { name: 'owned'; entry: HistoryEntry }
  | { name: 'full'; shared: SharedDeck }
  | { name: 'gone' }
  | { name: 'error'; message: string };

// Long enough to read "you already have this", short enough that it reads as a
// redirect rather than a screen. The deck they asked for is what they get
// either way — this only explains why nothing was added.
const OWNED_HANDOFF_MS = 900;

export function ShareScreen({
  token,
  onOpenDeck,
  onHome,
}: {
  token: string;
  onOpenDeck: (entry: HistoryEntry) => void;
  onHome: () => void;
}) {
  const [state, setState] = useState<State>({ name: 'loading' });
  const openRef = useRef(onOpenDeck);
  openRef.current = onOpenDeck;

  useEffect(() => {
    // Drop the token from the address bar immediately: a refresh should land on
    // Home, and on a shared computer the link shouldn't sit in the URL bar.
    clearShareTokenFromUrl();
    let cancelled = false;

    async function resolve() {
      // Settle the session first. Adding works signed out, but a signed-in
      // student's add has to mirror to their account, and Storage decides that
      // synchronously from the session that may still be restoring.
      await SupabaseClient.ready();
      const { deck, error } = await SupabaseClient.fetchSharedDeck(token);
      if (cancelled) return;
      if (error) {
        setState({ name: 'error', message: "Couldn't open this link. Check your connection." });
        return;
      }
      if (!deck) {
        setState({ name: 'gone' });
        return;
      }
      // The payload crossed a network and a database to get here. Validating it
      // like any pasted deck keeps a malformed one out of the library rather
      // than letting it break a screen mid-study.
      const errors = validateDeck(deck.data as unknown as Record<string, unknown>);
      if (errors.length > 0) {
        setState({ name: 'error', message: "This study set isn't readable by this version." });
        return;
      }
      const existing = findExistingCopy(deck);
      if (existing) {
        setState({ name: 'owned', entry: existing });
        return;
      }
      // Checked AFTER the already-have-it pass on purpose: a full library is no
      // reason to refuse someone the deck they already own.
      setState(
        Storage.isAtDeckLimit(deck.title)
          ? { name: 'full', shared: deck }
          : { name: 'offer', shared: deck },
      );
    }

    void resolve();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Already in the library: no second copy, no question asked — open the copy
  // they have, after a beat so the message is readable.
  useEffect(() => {
    if (state.name !== 'owned') return;
    const entry = state.entry;
    const id = window.setTimeout(() => openRef.current(entry), OWNED_HANDOFF_MS);
    return () => window.clearTimeout(id);
  }, [state]);

  function add(shared: SharedDeck) {
    onOpenDeck(addSharedDeck(shared));
  }

  return (
    <section className="screen share-screen">
      <div className="home-hero share-hero">
        <Starfield />
        <div className="share-hero-inner">
          <h1 className="home-title">StudyDeck</h1>
          <p className="subtitle">Someone shared a study set with you.</p>
        </div>
      </div>

      <div className="share-panel glass-card">
        {state.name === 'loading' && <p className="share-modal-working">Opening the link…</p>}

        {state.name === 'owned' && (
          <>
            <h3>{state.entry.title}</h3>
            <p className="share-panel-desc">
              You already have this study set — opening your copy, with your progress.
            </p>
          </>
        )}

        {state.name === 'offer' && (
          <>
            <h3>{state.shared.title}</h3>
            <p className="share-panel-desc">
              {state.shared.data.questions.length}{' '}
              {state.shared.data.type === 'flashcard' ? 'cards' : 'questions'} · add it to your
              library to study it. No account needed.
            </p>
            <div className="share-panel-actions">
              <button className="btn" onClick={() => add(state.shared)}>
                Add to my library
              </button>
              <button className="btn-ghost" onClick={onHome}>
                Not now
              </button>
            </div>
          </>
        )}

        {state.name === 'full' && (
          <>
            <h3>{state.shared.title}</h3>
            <p className="share-panel-desc">
              Your library is full — {MAX_DECKS} study sets is the limit. Remove one you're done
              with, then open this link again and it'll be waiting.
            </p>
            <div className="share-panel-actions">
              <button className="btn" onClick={onHome}>
                Manage my library
              </button>
            </div>
          </>
        )}

        {state.name === 'gone' && (
          <>
            <h3>This link doesn't work</h3>
            <p className="share-panel-desc">
              The study set may have been removed, or the link was cut short in the message it
              came in. Ask whoever sent it for a fresh one.
            </p>
            <div className="share-panel-actions">
              <button className="btn-ghost" onClick={onHome}>
                Go to StudyDeck
              </button>
            </div>
          </>
        )}

        {state.name === 'error' && (
          <>
            <h3>Something went wrong</h3>
            <p className="share-panel-desc">{state.message}</p>
            <div className="share-panel-actions">
              <button className="btn-ghost" onClick={onHome}>
                Go to StudyDeck
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
