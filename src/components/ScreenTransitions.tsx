/**
 * Screens move from one to the next instead of jumping (2026-10-07, his ask:
 * "add transition animations between changing pages, right now it just opens
 * suddenly and it loads first").
 *
 * THE BROWSER'S OWN VIEW TRANSITION. `document.startViewTransition` takes a
 * picture of the screen being left, lets the app change, then fades the
 * picture out over the new screen (`ui/tokens/screenTransition.css`, which
 * says why a fade and not a slide: measured). Chromium has it, Brave on the
 * tablet included; a browser without it changes screen as before.
 *
 * HOW EVERY NAVIGATION GETS ONE without touching the forty places that call
 * `navigate`: this sits under the router and hands everything below it the
 * location it is *showing*, through React Router's own location context. When
 * the address changes, the shown location follows inside a view transition.
 *
 * NO EMPTY SCREEN ON THE WAY. Before the shown location moves, the new
 * screen's code is fetched (`preloadRoute`, App.tsx), and the move is a React
 * transition, so the old screen stays up until the new one is drawn; the
 * browser holds the old picture meanwhile. The nav's screens are also fetched
 * quietly once BASE is idle, so a first visit is usually instant.
 *
 * A change of search or hash alone (a board opened beside another, a fixture
 * flag) is not a new screen and moves without a transition. So is everything
 * under reduced motion.
 */
import { startTransition, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { UNSAFE_LocationContext, useLocation, useNavigationType, type Location } from 'react-router-dom';

type StartViewTransition = (update: () => Promise<void>) => unknown;
type WithTransitions = Document & { startViewTransition?: StartViewTransition };

const CAN_MOVE = typeof document !== 'undefined' && typeof (document as WithTransitions).startViewTransition === 'function';

/** Longer than any screen's code could reasonably take; the browser gives up near here too. */
const HOLD_MS = 4000;

export default function ScreenTransitions({
  preloadRoute,
  children,
}: {
  preloadRoute: (pathname: string) => Promise<unknown>;
  children: ReactNode;
}) {
  const real = useLocation();
  const navigationType = useNavigationType();
  const [moved, setMoved] = useState<Location>(real);
  const settle = useRef<(() => void) | null>(null);
  /* The address as it is now, for a transition that finishes after it moved on
     (tapping back before the new screen arrived lands on where you are). */
  const latest = useRef(real);
  useLayoutEffect(() => { latest.current = real; });

  const animates = CAN_MOVE && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  /* Only a new screen waits for its transition; anything else shows at once. */
  const shown = !animates || real.pathname === moved.pathname ? real : moved;

  useLayoutEffect(() => {
    if (!animates || real.pathname === moved.pathname) return;
    (document as WithTransitions).startViewTransition?.(() => new Promise<void>((resolve) => {
      const timer = window.setTimeout(resolve, HOLD_MS);
      settle.current = () => { window.clearTimeout(timer); resolve(); };
      void preloadRoute(real.pathname).catch(() => {}).finally(() => {
        startTransition(() => setMoved(latest.current));
      });
    }));
  }, [animates, real, moved.pathname, preloadRoute]);

  /* The new screen is on the page: let the browser take its picture. */
  useLayoutEffect(() => {
    settle.current?.();
    settle.current = null;
  }, [moved]);

  return (
    <UNSAFE_LocationContext.Provider value={{ location: shown, navigationType }}>
      {children}
    </UNSAFE_LocationContext.Provider>
  );
}
