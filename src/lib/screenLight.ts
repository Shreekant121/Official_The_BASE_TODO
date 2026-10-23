/*
 * Each screen's light (29-1P5a, ideas 62 and 14) — which colour a screen's
 * backdrop glows, decided from the address alone. Pure: no clock, no DOM.
 *
 * One colour, one job (BIG-15): Home, the boards and New Session are emerald
 * (his call 2026-10-07 for New Session, over lime), Focus teal, Atlas's
 * screens violet, Set Deadlines and Notifications sky, the Score screen coral,
 * Settings and what hangs off it neutral. The Dashboard alone has no fixed
 * colour: it takes the hour's sky (idea 14), whose lead colour is its light.
 *
 * `useScreenLight` (App.tsx) writes the answer onto <html> as
 * `data-screen-light`; `ui/tokens/screenLight.css` turns it into a colour on
 * every `.ag-page` and fades the old one into the new.
 */

/** The four skies, named for the Dashboard's own greeting. */
export type HourPhase = 'morning' | 'afternoon' | 'evening' | 'night';

export type ScreenLight =
  | 'emerald'
  | 'teal'
  | 'violet'
  | 'sky'
  | 'coral'
  | 'neutral'
  | `hour-${HourPhase}`;

/*
 * Start hours. Morning, afternoon and evening begin where `greetingFor` in
 * DashboardPage.tsx changes its word (5, 12, 17), so the sky never says
 * something different from the greeting under it; night is the hour that
 * greeting has no word for, from nine.
 */
const PHASE_STARTS: readonly [number, HourPhase][] = [
  [5, 'morning'],
  [12, 'afternoon'],
  [17, 'evening'],
  [21, 'night'],
];

export function hourPhaseAt(now: Date): HourPhase {
  return phaseOfHour(now.getHours());
}

/** The sky of a clock hour, 0 to 23 (the month's focus type reads it too). */
export function phaseOfHour(h: number): HourPhase {
  let phase: HourPhase = 'night';
  for (const [start, p] of PHASE_STARTS) if (h >= start) phase = p;
  return phase;
}

/** Milliseconds from `now` to the next change of sky, on the hour. */
export function msUntilNextPhase(now: Date): number {
  const h = now.getHours();
  const next = PHASE_STARTS.find(([start]) => start > h);
  const at = new Date(now);
  if (next) at.setHours(next[0], 0, 0, 0);
  else {
    at.setDate(at.getDate() + 1);
    at.setHours(PHASE_STARTS[0][0], 0, 0, 0);
  }
  return Math.max(0, at.getTime() - now.getTime());
}

const EXACT: Record<string, ScreenLight> = {
  '/': 'emerald',
  '/select': 'emerald',
  '/focus': 'teal',
  '/deadlines': 'sky',
  '/calendar': 'sky',
  '/notifications': 'sky',
  '/scoring': 'coral',
  '/chat': 'violet',
  '/catalog': 'violet',
  '/log': 'violet',
  '/skills': 'violet',
  '/atlas-host': 'violet',
  '/inbox': 'violet',
  '/contacts': 'violet',
  '/settings': 'neutral',
  '/trash': 'neutral',
  '/archive': 'neutral',
  '/admin': 'neutral',
  '/design': 'neutral',
};

/**
 * The light for an address. Anything not named — a board, the sign-in page,
 * a public share — keeps BASE's own emerald, the colour every backdrop wore
 * before this step.
 */
export function screenLightFor(pathname: string, phase: HourPhase): ScreenLight {
  if (pathname === '/dashboard') return `hour-${phase}`;
  /* `/start/:taskId` starts a Focus session and hands over to `/focus`. */
  if (pathname.startsWith('/start/')) return 'teal';
  return EXACT[pathname] ?? 'emerald';
}

/** A nav icon's colour: its screen's light, or `hour` for the Dashboard's sky. */
export type NavCellLight = Exclude<ScreenLight, `hour-${HourPhase}`> | 'hour';

/**
 * The colour of the nav icon that goes to `route` (29-1P5b, his call
 * 2026-10-07: "make it so that all icons have color"). Each icon wears the
 * light of the screen it opens, from the same map as the screens themselves;
 * the Dashboard's is `hour`, which `screenLight.css` resolves against the
 * `data-hour` that `useScreenLight` keeps on <html>.
 */
export function navCellLight(route: string): NavCellLight {
  const light = screenLightFor(route, 'morning');
  return light.startsWith('hour-') ? 'hour' : (light as NavCellLight);
}
