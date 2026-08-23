// Small `matchMedia` subscription, for the cases where a media query has to be
// React's decision rather than CSS's — which controls exist at all, which shell
// a flow opens in, which hint a screen is captioned with.
//
// Lives in lib/ rather than in any one feature: the flashcard screen wrote it
// first, but auth needs the same `(pointer: coarse)` answer, and features don't
// reach across each other for a shared utility.

import { useEffect, useState } from 'react';

// The app's one definition of "this is a touch device". Not a width breakpoint:
// a desktop window dragged narrow is still a mouse, and a tablet held wide is
// still a finger.
export const TOUCH_QUERY = '(pointer: coarse)';

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(query).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}
