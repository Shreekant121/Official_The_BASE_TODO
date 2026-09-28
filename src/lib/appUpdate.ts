/**
 * The browser's half of the service worker — APP-3.
 *
 * `public/sw.js` decides what is cached. This file decides when a new one is
 * allowed to take over, and it is the answer to the cost APP-3 names: once the
 * shell is cached a new deploy does not arrive by itself, so it has to announce
 * itself instead.
 *
 * THE LIFECYCLE, AND THE ONE THING TO UNDERSTAND ABOUT IT
 * -------------------------------------------------------
 * A new `sw.js` installs beside the running one and parks in `waiting`. It
 * cannot take over while a page the old one controls is open — that is the
 * browser's rule, not ours, and it exists so a running app never has half its
 * chunks swapped underneath it. Three things follow:
 *
 *   1. **`waiting` is the whole signal.** `registration.waiting` set, with a
 *      `controller` already in place, means "a newer BASE is downloaded and
 *      ready". That is what raises the banner, and `updateReady` in
 *      `useUIStore` is that fact and nothing else.
 *   2. **Nothing happens until it is tapped.** `SKIP_WAITING` is only ever
 *      sent from `applyUpdate`, which only ever runs from the banner. The
 *      worker never calls `skipWaiting()` on its own.
 *   3. **The reload is ours, and it is guarded.** `controllerchange` also
 *      fires on a first-ever install, when the worker calls `clients.claim()`.
 *      Reloading on every `controllerchange` would therefore refresh the screen
 *      out from under somebody the first time they opened the app. So the
 *      handler does nothing unless `applyUpdate` set `requested` first.
 *
 * WHEN IT CHECKS
 * --------------
 * `register()` performs one check by itself. After that: hourly, and whenever
 * the app comes back to the foreground, throttled to one check every fifteen
 * minutes. The foreground check is the one that matters on the tablet —
 * an installed app is usually *resumed*, not loaded, so a version check that
 * only ran on load would in practice never run at all. Every check is a
 * conditional GET of one file and is free when offline: it rejects, and the
 * `.catch` swallows it, because "we could not ask" is not news.
 */
import { useUIStore } from '../store/useUIStore';

/** What the running worker reports about itself. */
export interface RunningVersion {
  /** The short build fingerprint, or `development` from an unbuilt worker. */
  version: string;
  /** ISO instant the build ran, or `null` in dev. Shown, never compared. */
  builtAt: string | null;
}

const HOUR = 60 * 60 * 1000;
const CHECK_THROTTLE = 15 * 60 * 1000;

let registration: ServiceWorkerRegistration | null = null;
let requested = false;
let reloading = false;
let lastCheck = 0;

/**
 * A newer worker is downloaded and parked. The `controller` half is not
 * incidental: on a first-ever install there is no controller yet, the waiting
 * worker is simply the first one, and calling that "a new version available"
 * would greet a brand-new install with an offer to update to itself.
 */
function reportIfWaiting(reg: ServiceWorkerRegistration) {
  if (reg.waiting && navigator.serviceWorker.controller) {
    useUIStore.getState().setUpdateReady(true);
  }
}

/** One conditional GET of `/sw.js`, at most once per throttle window. */
function checkForUpdate(force = false) {
  if (!registration) return;
  const now = Date.now();
  if (!force && now - lastCheck < CHECK_THROTTLE) return;
  lastCheck = now;
  registration.update().catch(() => {
    // Offline, or the server is down. Not news — the app already works.
  });
}

/**
 * Registers the worker and starts watching for a newer one.
 *
 * Called once from `main.tsx`. Safe to call when the browser has no service
 * worker support at all: it returns, and every screen behaves exactly as it did
 * before APP-3.
 */
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    /*
     * See point 3 in the header. `requested` is what separates "the user asked
     * for the new version" from "this worker just claimed a page for the first
     * time", and only the former is a reason to reload.
     */
    if (!requested || reloading) return;
    reloading = true;
    window.location.reload();
  });

  navigator.serviceWorker
    .register('/sw.js', { scope: '/' })
    .then((reg) => {
      registration = reg;
      lastCheck = Date.now();
      reportIfWaiting(reg);

      reg.addEventListener('updatefound', () => {
        const installing = reg.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          /*
           * `installed` is reached by both a first install and an update; the
           * controller test inside `reportIfWaiting` is what tells them apart.
           */
          if (installing.state === 'installed') reportIfWaiting(reg);
        });
      });

      setInterval(() => checkForUpdate(true), HOUR);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkForUpdate();
      });
    })
    .catch(() => {
      /*
       * A failed registration is a swallowed error on purpose. Everything it
       * buys — opening offline, the update banner, push — is additive; the app
       * itself has worked out of localStorage since long before this file.
       */
    });
}

/**
 * Take the waiting version. Tells it to stop waiting, and the
 * `controllerchange` handler above reloads once it has.
 *
 * The timeout is a real case rather than defensive padding: if the waiting
 * worker has already been discarded — the tab was left open across two deploys
 * — the message lands nowhere and no `controllerchange` ever arrives. A plain
 * reload then picks up whatever is current, which is what the banner promised.
 */
export function applyUpdate() {
  requested = true;
  useUIStore.getState().setUpdateReady(false);

  const waiting = registration?.waiting;
  if (!waiting) {
    window.location.reload();
    return;
  }

  waiting.postMessage({ type: 'SKIP_WAITING' });
  setTimeout(() => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  }, 2000);
}

/**
 * Asks the worker serving this page what version it is.
 *
 * The page you are reading came out of that worker's cache, so its answer is
 * the version actually running — which is the question Settings asks, and a
 * different question from "what is the latest deploy". `null` means nothing is
 * controlling this page: either the browser has no service workers, or this is
 * the first load and the worker has not taken over yet.
 */
export function readRunningVersion(): Promise<RunningVersion | null> {
  return new Promise((resolve) => {
    const controller = navigator.serviceWorker?.controller;
    if (!controller) {
      resolve(null);
      return;
    }

    const channel = new MessageChannel();
    // An unanswered port would leave this pending for ever; a worker that has
    // been killed between the controller check and the post is a real case.
    const timer = setTimeout(() => resolve(null), 2000);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      resolve(event.data as RunningVersion);
    };
    controller.postMessage({ type: 'GET_VERSION' }, [channel.port2]);
  });
}

/**
 * Ask now, on the user's behalf, and say whether anything was found.
 *
 * Used by the "Check for updates" button in Settings. Resolves to `true` when a
 * newer version is parked afterwards — the banner will be up by then, and the
 * button says the same thing in place so the answer is where the question was.
 */
export async function checkForUpdateNow(): Promise<boolean> {
  if (!registration) return false;
  lastCheck = Date.now();
  try {
    await registration.update();
  } catch {
    return false;
  }
  reportIfWaiting(registration);
  return Boolean(registration.waiting && navigator.serviceWorker.controller);
}

/** Whether a worker is controlling this page — i.e. whether BASE opens offline. */
export function isOfflineReady(): boolean {
  return Boolean(navigator.serviceWorker?.controller);
}
