import { useEffect, useLayoutEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { hourPhaseAt, msUntilNextPhase, screenLightFor, type HourPhase } from './screenLight';

/*
 * Puts the current screen's light on <html> (29-1P5a): `data-screen-light`
 * is where the page is now, `data-screen-light-from` where it just came from.
 * `ui/tokens/screenLight.css` reads both — the second only as the starting
 * colour of a screen that has just appeared (`@starting-style`), which is the
 * fade from one screen's light into the next.
 *
 * Attributes on <html> rather than a custom property: the rules that read
 * them end in `.ag-page`, so a change restyles the pages and nothing else,
 * where an inherited property set on the root would restyle the whole tree.
 *
 * One timer, to the next change of sky (four a day), re-armed when the tab
 * comes back: a sleeping tablet holds a timeout for as long as it sleeps.
 * Nothing runs between.
 */
function useHourPhase(): HourPhase {
  const [phase, setPhase] = useState(() => hourPhaseAt(new Date()));
  useEffect(() => {
    let timer = 0;
    const arm = () => {
      window.clearTimeout(timer);
      /* A second past the hour, so the check lands on the new side of it. */
      timer = window.setTimeout(check, msUntilNextPhase(new Date()) + 1000);
    };
    const check = () => {
      setPhase(hourPhaseAt(new Date()));
      arm();
    };
    arm();
    const onShow = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onShow);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onShow);
    };
  }, []);
  return phase;
}

/* Longer than the slowest fade in screenLight.css (the sky's 1.6s). */
const SETTLE_MS = 1800;

export function useScreenLight(): void {
  const { pathname } = useLocation();
  const phase = useHourPhase();
  const light = screenLightFor(pathname, phase);

  /* The hour, for the Dashboard's nav icon on every screen (29-1P5b). */
  useLayoutEffect(() => {
    document.documentElement.dataset.hour = phase;
  }, [phase]);

  /* Before paint, so a screen shown in this commit starts from the old light. */
  useLayoutEffect(() => {
    const root = document.documentElement;
    const prev = root.dataset.screenLight;
    root.dataset.screenLightFrom = prev ?? light;
    root.dataset.screenLight = light;
    if (!prev || prev === light) return;
    /* Once the fade is over, a page that mounts late (a screen's chunk still
       arriving) starts at the new light instead of fading again. */
    const timer = window.setTimeout(() => { root.dataset.screenLightFrom = light; }, SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [light]);
}
