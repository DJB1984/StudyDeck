// Tiny toast bus. Lets non-React modules (Storage) surface user-facing errors
// through the shared <Toast> component without importing React or throwing.
// The Toast component registers itself as the listener on mount.

type Listener = (msg: string) => void;

let listener: Listener | null = null;

export function setToastListener(l: Listener | null): void {
  listener = l;
}

export function showError(msg: string): void {
  if (listener) listener(msg);
  else console.error('[StudyDeck]', msg);
}
