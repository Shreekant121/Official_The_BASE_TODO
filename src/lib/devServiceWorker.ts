/**
 * Dev-only opt-in that registers the service worker against the Vite dev
 * server — APP-3.
 *
 * WHY THIS EXISTS
 * ---------------
 * APP-3 says to prove the worker in a browser rather than in vitest, and this
 * is what makes that possible without a deploy. A service worker needs a real
 * `/sw.js` at the origin root and a secure context; `npm run dev:full`
 * (`vercel dev`) gives both on `http://localhost:3000`, which browsers treat as
 * secure, **and** serves the `api/` routes — so the offline shell, the update
 * banner and a real push notification can all be driven end to end on the
 * laptop before anything reaches the tablet.
 *
 * Registration is otherwise production-only, and that is not caution for its
 * own sake: a worker that cached the dev server would serve a stale bundle
 * exactly the way `localhost:5173` already does, and the screenshot harness
 * (`npm run shots`) runs against a dev server too — a cached shell there would
 * photograph the previous run's app.
 *
 * `public/sw.js` is served verbatim in dev, with an empty precache and the
 * version `development`, so every caching rule in it falls through to the
 * network and Vite's module graph is untouched. What you get is the real
 * worker's `push`, `notificationclick`, `message` and update lifecycle, which
 * is the half being proved.
 *
 * HOW IT IS KEPT OUT OF THE SHIPPED BUNDLE
 * ----------------------------------------
 * Same mechanism as `devAuth.ts` and the five fixtures beside it. The whole
 * body sits behind a bare `import.meta.env.DEV`, which Vite replaces with the
 * literal `false` for a production build; the guard folds to a constant, the
 * bundler drops what follows, and `scripts/check-shots-bypass.mjs` greps
 * `dist/` for the marker and fails the build if it survives. **Do not read the
 * flag into a variable first**, and **do not lift the marker string out to
 * module scope** — a module-level `const` is initialised whether or not the
 * guarded function is reachable, which is how `devShareFixture`'s marker
 * reached `dist/` the first time.
 */

/**
 * Whether this dev session asked for the worker. Takes `location.search` rather
 * than reading it itself, so the caller's bare `import.meta.env.DEV` is the
 * only branch that decides anything.
 *
 * Drive it with `http://localhost:3000/?__dev-service-worker__=1`. The flag is
 * needed once per browser profile: registration outlives the query string, so
 * everything after that first load is the ordinary app. **Unregister it from
 * devtools (Application -> Service workers) when you are done**, or the next
 * plain `npm run dev` in that profile will still be served a cached shell.
 */
export function devServiceWorkerRequested(search: string): boolean {
  if (!import.meta.env.DEV) return false;
  return search.includes('__dev-service-worker__');
}
