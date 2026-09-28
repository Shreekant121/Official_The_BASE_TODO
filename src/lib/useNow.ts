/**
 * "Repaint me every second while something is moving."
 *
 * BUILD-1 turned both focus clocks into wall-clock deadlines (`useFocusRun`),
 * which means nothing in the app has to *count* any more — the remaining
 * seconds are arithmetic on `Date.now()` and are correct whether or not a
 * timer fired. What is still needed is a reason for React to ask again, and
 * that is all this is.
 *
 * The distinction is not pedantic. The old Focus screen decremented state on a
 * `setInterval`, so a throttled or suspended interval did not make the clock
 * *stale*, it made it **wrong** — the missed ticks were simply never counted.
 * Here a missed tick costs a late repaint and nothing else, which is why a
 * tablet that has been asleep comes back showing the right number.
 *
 * WHY IT IS AN EXTERNAL STORE AND NOT `useState` + `useEffect`
 * -----------------------------------------------------------
 * Two of the three obvious shapes are rejected by the React rules this repo
 * lints with, and both rejections are fair:
 *
 *   - seeding the moment from inside an effect is a synchronous `setState` in
 *     an effect body (`react-hooks/set-state-in-effect`), the cascading-render
 *     pattern;
 *   - reading `Date.now()` during render is an impure call
 *     (`react-hooks/purity`), and the value would then change on every
 *     unrelated re-render.
 *
 * `useSyncExternalStore` is what the clock actually is: an external source
 * that changes on its own and that React subscribes to — the same reason
 * `useMedia` in `src/ui` is written this way. The snapshot is cached in module
 * scope, which is the contract (an uncached one loops for ever).
 *
 * One interval serves every subscriber and stops when the last one leaves, so
 * a screen with two clocks on it costs one timer, and an app with none costs
 * nothing at all.
 *
 * `setInterval`, not `requestAnimationFrame`: rAF does not fire at all in a
 * hidden tab, and a clock that stops updating the moment you look away is the
 * bug this file exists to avoid.
 */
import { useSyncExternalStore } from 'react';

const TICK_MS = 1000;

let cached = Date.now();
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  /* A subscriber arriving mid-second must not read a snapshot taken up to a
     second ago — `useSyncExternalStore` re-reads immediately after this call,
     so refreshing it here is what makes a freshly mounted clock exact. */
  cached = Date.now();
  if (timer === null) {
    timer = setInterval(() => {
      cached = Date.now();
      for (const fn of listeners) fn();
    }, TICK_MS);
  }
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/** Subscribing to nothing: the value is frozen, which is what paused means. */
function subscribeNever(): () => void {
  return () => {};
}

function getSnapshot(): number {
  return cached;
}

export function useNow(active: boolean): number {
  return useSyncExternalStore(active ? subscribe : subscribeNever, getSnapshot);
}
