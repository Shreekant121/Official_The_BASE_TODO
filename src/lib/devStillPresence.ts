/**
 * Dev-only switch that holds Atlas's presence orb (`ui/data/AiPresence.tsx`)
 * on one frame, used by the screenshot harness (`scripts/screenshots.ts`).
 *
 * WHY THIS EXISTS
 * ---------------
 * The orb's shader is driven by its own clock, the sum of the frame intervals
 * `requestAnimationFrame` hands it. The harness fakes that clock, but a
 * Playwright fake clock is **not parked** between the harness's jumps: after
 * `clock.install()` it keeps flowing at wall-clock speed, and `runFor` only adds
 * to it. So how far the orb has turned by the capture depends on how long the
 * page took to load and how long each wait took — measured 2026-09-24 on
 * `dock-hearing`, the dock orb's first frame landed at 8.4s, 4.5s and 2.1s of
 * virtual time in three runs, and its clock read 14.47, 14.44 and 18.00 at the
 * capture. Every other endless animation on those screens is a loop the
 * comparator absorbs; a raymarched sphere half a screen wide is not, and
 * `dock-hearing`, `-thinking` and `-speaking` flagged on every run with a
 * different cell count each time. The orbs that are paused or dimmed draw one
 * frame at time zero and never moved, which is why only the live ones did.
 *
 * The watchdog is the second reason. It times its own draws with
 * `performance.now()`, which flows the same way, so a run on a busy machine
 * could step the orb down a resolution rung, or hand it to the CSS sphere,
 * part-way through a capture.
 *
 * With the key set, the orb draws the state it is in **as it looks once
 * settled** — the state's own ripple targets at time zero (the moment a
 * paused orb already draws, so no other baseline moves), the synthesised
 * voice at its mean — once, as reduced motion does, and never times a draw.
 * What it photographs is still the shader, in the right state, at the right
 * size; only the moment is fixed. (Once, not every frame: redrawing the same
 * frame ~560 times a shot timed `tablet/dock-speaking` out in four runs of five.)
 *
 * HOW IT IS KEPT OUT OF THE SHIPPED BUNDLE
 * ----------------------------------------
 * Same mechanism as `devAuth.ts` and every fixture beside it: the body sits
 * behind a bare `import.meta.env.DEV`, which Vite folds to `false` for a
 * production build, and `scripts/check-shots-bypass.mjs` greps `dist/` for the
 * key and fails the build if it survives. The key is written inside the
 * function, after the guard, and the harness takes its copy from
 * `scripts/fixture.ts` — a module-level constant here would be initialised
 * whether or not the guarded function is reachable, which is how
 * `devShareFixture`'s marker once reached `dist/`. **Do not read the flag into
 * a variable first.**
 */
export function devStillPresence(): boolean {
  if (!import.meta.env.DEV) return false;
  try {
    return localStorage.getItem('__dev-still-presence__') === '1';
  } catch {
    return false;
  }
}
