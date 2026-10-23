import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { applySpeedPrefs } from './lib/speedPrefs';
import { applyDarkTint } from './lib/darkTint';
import { registerServiceWorker } from './lib/appUpdate';
import { devServiceWorkerRequested } from './lib/devServiceWorker';
import { installUndoRecorder } from './store/useUndoStore';
import { installDust } from './lib/dust';
import { installStoryRecorder } from './lib/taskStorySync';
import { installMoments } from './lib/moments';
import { installLastHere } from './lib/lastHere';
import { installConnectionWatch } from './lib/connectionWatch';

/* Settings → App → Speed's blur switch, before the first frame (lib/speedPrefs.ts). */
applySpeedPrefs();
/* 29-1P1 — the dark tint too, so a tinted app never opens grey for a frame. */
applyDarkTint();
/* 29-1P4a — his undo watches the store's actions from the first press. */
installUndoRecorder();
/* 29-1P4c — a deleted row turns to dust, and an undo gathers it back. After the
   recorder, so the dust wraps the recorded delete, not the other way round. */
installDust();
/* 29-1P9c — the task's story records every change from the first one. */
installStoryRecorder();
/* 29-1P14a — confetti when his press finishes a project or a milestone. */
installMoments();
/* 29-1P14b — when he was last here on this device, for welcome back (idea 110). */
installLastHere();
/* 29-1P14d1 — the offline pill hears the connection go from the first moment. */
installConnectionWatch();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

/*
 * APP-3 — the service worker: what makes BASE open with no network, and what a
 * push notification is delivered to. See `lib/appUpdate.ts` for the lifecycle
 * and `public/sw.js` for what is cached.
 *
 * **Production only, and that is load-bearing rather than tidy.** A worker
 * caching the Vite dev server would serve a stale bundle exactly the way
 * `localhost:5173` already does, and `npm run shots` runs against a dev server
 * too — a cached shell there would photograph the previous run's app and every
 * baseline after it would be a fact about the cache.
 *
 * The dev opt-in beside it is the only way to drive the real worker locally,
 * which is what APP-3 asks for ("prove it in the browser, not in vitest"). Its
 * whole body is behind a bare `import.meta.env.DEV` that Vite folds to `false`,
 * so `devServiceWorkerRequested` compiles away to nothing in the shipped
 * bundle and `scripts/check-shots-bypass.mjs` fails the build if its marker
 * ever survives.
 *
 * Registration is deliberately after `createRoot`: it costs a network request
 * and a worker start-up, and neither should sit in front of the first frame.
 */
if (import.meta.env.PROD || devServiceWorkerRequested(window.location.search)) {
  registerServiceWorker();
}
