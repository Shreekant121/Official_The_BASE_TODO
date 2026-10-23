/**
 * The Speed switches on Settings → App (2026-09-28): two device-only
 * preferences for finding what makes scrolling stutter on HIS tablet.
 * There were three: the third, the glass lens, was DELETED from the app
 * on 2026-10-06, his call. What it measured is kept below because it is
 * why the lens went.
 *
 * Why they exist: on the laptop's slow-device stand-in every screen scrolls at
 * 57-60fps, and on his tablet it stutters. The stand-in can slow the CPU but
 * not the GPU, and the two suspects left are both GPU work that runs on every
 * scrolled frame — the lens (three displacement passes per glass surface) and
 * the backdrop blur, which since the glass went 92% opaque shows through at
 * 8%. The meter shows the frame rate on the device itself, so he can scroll,
 * flip one switch, and scroll again.
 *
 * Device-only, in localStorage and never synced: whether a GPU can afford the
 * blur is a fact about one device, exactly like the chosen model
 * (`lib/agent/constants.ts` says the same about that). Every read is wrapped,
 * because storage can throw in a locked-down browser and a preference is not
 * worth a crash.
 *
 * Defaults: the blur is on everywhere. The lens was OFF everywhere — his
 * call, 2026-09-30, on this measurement: on his laptop's Radeon 780M at 125%
 * (headed Chromium, a board with the fixture's tasks eight times over) a
 * project scrolled at 11-13fps with the lens and 50-53 without, two boards
 * side by side 8-11 against 50-53, and the ⋯ menus and Ctrl+K hovered at
 * 21-34fps against a steady 60 — the "slow green hover" he saw. Before that
 * the lens was on for a mouse and off for a touch screen — measured on the
 * stand-in with the lens forced on as Brave
 * has it, Home scrolled at 37-39fps with 71 hitches against 57-60fps with none
 * without it, and the stand-in had been running WITHOUT the lens all along
 * (headless Chromium has no `window.chrome`, so `GlassLens` never switched
 * on), which is why it never reproduced his stutter. The glass is 92% opaque,
 * so what the lens bent barely showed.
 */
export type SpeedPref = 'meter' | 'blur';

const KEYS: Record<SpeedPref, string> = {
  meter: 'base.speed.meter',
  blur: 'base.speed.blur',
};

function defaultFor(pref: SpeedPref): boolean {
  return pref === 'blur';
}

const listeners = new Set<() => void>();

export function readSpeedPref(pref: SpeedPref): boolean {
  try {
    const raw = localStorage.getItem(KEYS[pref]);
    return raw === null ? defaultFor(pref) : raw === '1';
  } catch {
    return defaultFor(pref);
  }
}

export function writeSpeedPref(pref: SpeedPref, on: boolean): void {
  try {
    localStorage.setItem(KEYS[pref], on ? '1' : '0');
  } catch {
    /* Not remembered past this page load — the switch still works now. */
  }
  applySpeedPrefs();
  for (const fn of listeners) fn();
}

export function subscribeSpeedPrefs(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/**
 * The blur switch is one attribute on <html>, read by `src/index.css`. Called
 * once from `main.tsx` before the first render, so a tablet with the blur off
 * never draws a single blurred frame, and again on every change.
 */
export function applySpeedPrefs(): void {
  const root = document.documentElement;
  if (readSpeedPref('blur')) root.removeAttribute('data-ag-no-blur');
  else root.setAttribute('data-ag-no-blur', '');
}
