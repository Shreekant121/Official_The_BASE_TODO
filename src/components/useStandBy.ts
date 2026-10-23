/*
 * Whether Focus is the StandBy clock right now (29-1P10c, idea 100), and the
 * tap that puts Focus back. The rule is `lib/standBy.ts`; this feeds it the
 * device and his last touch. The face is `FocusStandBy.tsx`.
 */
import { useEffect, useState } from 'react';
import { useMedia } from '../ui';
import { standByNight, standByShown } from '../lib/standBy';

/** A finger, not a mouse (P10b's away card asks the same). */
const POINTER_FINE = '(hover: hover) and (pointer: fine)';
/** Sideways, and tablet-tall: a phone on its side is under 500px. */
const SIDEWAYS_TABLET = '(orientation: landscape) and (min-height: 600px)';

/** `now` is Focus's own one-second tick, so StandBy's return needs no timer. */
export function useStandBy({ running, busy, now }: { running: boolean; busy: boolean; now: number }) {
  const fine = useMedia(POINTER_FINE);
  const landscape = useMedia(SIDEWAYS_TABLET);
  const [lastTouch, setLastTouch] = useState(() => Date.now());
  const shown = standByShown({ tablet: !fine, landscape, running, busy, now, lastTouch });

  /* Every touch on Focus holds StandBy off for another minute. Not while it
     is shown: its own tap is `wake`, on click, so the finger that lifts it
     never lands on the button underneath. */
  useEffect(() => {
    if (shown || fine) return;
    const touched = () => setLastTouch(Date.now());
    window.addEventListener('pointerdown', touched, true);
    window.addEventListener('keydown', touched, true);
    return () => {
      window.removeEventListener('pointerdown', touched, true);
      window.removeEventListener('keydown', touched, true);
    };
  }, [shown, fine]);

  return { shown, night: standByNight(now), wake: () => setLastTouch(Date.now()) };
}
