/**
 * Dev-only fixture for dock mode, used by the screenshot harness
 * (`scripts/screenshots.ts`).
 *
 * WHY THIS EXISTS
 * ---------------
 * Every state of that screen is produced by a live microphone and a live
 * voice. The harness has neither: Chromium is started with no speech
 * permission, `SpeechRecognition` never fires a result, and nothing would ever
 * leave the resting state — so the one screen in the app that has four of them
 * would be photographed once, empty, and the other three would have no
 * baseline at all.
 *
 * It is the honest version of the harness `design-system/screens/voice.html`
 * draws in its own footer. The mockup carries four buttons that force the orb
 * into each state, because a drawing has to be read; DESIGN-1 deliberately did
 * not build those, because a control that lies about what the microphone is
 * doing has no business on a screen across a room. This puts the same
 * affordance where it belongs — behind a dev flag, reachable by the harness
 * and by a hand check, and folded out of the shipped bundle.
 *
 * **It pins the state and takes the microphone out of the loop entirely.**
 * Anything else and a permission error would arrive a moment after the capture
 * began and overwrite the state being photographed.
 *
 * The **ninth** of its kind, after `devAuth`, `devShareFixture`,
 * `devChatFixture`, `devModelFixture`, `devHostFixture`, `devCatalogFixture`,
 * `devSkillsFixture` and `devLogFixture`, and it is kept out of the shipped
 * bundle the same way: every branch behind a bare `import.meta.env.DEV`, which
 * Vite folds to `false` in a production build, and
 * `scripts/check-shots-bypass.mjs` greps `dist/` for the marker. **Do not read
 * that flag into a variable first**, and **do not lift anything below to
 * module scope** — a module-level `const` is initialised whether or not the
 * guarded function is reachable, which is how `devShareFixture`'s marker
 * survived into `dist/` the first time.
 */

/**
 * The five photographable states. `blocked` is not a `DockState` — it is the
 * screen's answer to a microphone it cannot have, which is a state of the
 * whole screen rather than of the machine.
 */
export type DockFixture = 'waiting' | 'hearing' | 'thinking' | 'speaking' | 'blocked';

/** What the fixture has him saying, mid-sentence. `voice.html`'s own words. */
export function devDockHeard(): string {
  return 'What is late right';
}

/** What it is reading out. Also the mockup's, so the two can be diffed by eye. */
export function devDockAnswer(): string {
  return 'Three are past their date. The launch email is the one that costs you something.';
}

export function devDockFixture(): DockFixture | null {
  if (!import.meta.env.DEV) return null;
  const match = /__dev-dock-fixture__=([a-z]+)/.exec(window.location.search);
  if (match === null) return null;
  const asked = match[1];
  return asked === 'hearing' || asked === 'thinking' || asked === 'speaking' || asked === 'blocked'
    ? asked
    : 'waiting';
}
