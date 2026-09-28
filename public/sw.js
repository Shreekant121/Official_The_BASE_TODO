/*
 * BASE's service worker — APP-3.
 *
 * Two jobs, and they are the same file because the browser only gives you one:
 * it makes the app open with no network, and it is what a push notification is
 * delivered to.
 *
 * WHY THIS IS HAND-WRITTEN AND NOT WORKBOX
 * ----------------------------------------
 * The whole app shell is `index.html` plus two hashed files — Vite emits one JS
 * chunk and one CSS chunk, there is no code splitting — so the precache is a
 * list of about twenty URLs and the caching rules fit on a page. A generator
 * would be more machinery than the thing it generates. The list itself is NOT
 * hand-written: `scripts/build-sw.mjs` walks `dist/` after every build and
 * rewrites the `__BUILD__` line below, so a forgotten filename is impossible.
 *
 * In `npm run dev` this file is served exactly as it sits here, with an empty
 * precache and the version `development`. That is deliberate: it is the only
 * way to drive the real thing locally (see `src/lib/devServiceWorker.ts`), and
 * an empty precache means every rule below falls through to the network, so
 * Vite's module graph and HMR are untouched.
 *
 * STALENESS IS THE COST AND IT IS PAID ON PURPOSE
 * -----------------------------------------------
 * A navigation is served **from the cache first**, which is what makes BASE
 * open instantly and work in aeroplane mode — and it means a new deploy does
 * not arrive by itself. So this worker never calls `skipWaiting()` on its own.
 * A new version installs, parks in `waiting`, and sits there until the running
 * page asks for it: `src/lib/appUpdate.ts` raises the "New version available"
 * banner and only sends `SKIP_WAITING` when the banner is tapped. Not silent,
 * not forced — Shreekant's call, written into APP-3.
 *
 * WHAT IS DELIBERATELY NOT TOUCHED
 * ---------------------------------
 * Anything cross-origin (Firestore, Google Calendar, Atlas over Tailscale) and
 * anything under `/api/`. No `respondWith`, no cache, not even a wrapper — the
 * request goes to the network exactly as if this file did not exist. That is
 * what makes those three **fail visibly rather than hang** when the tablet is
 * offline: the browser's own fetch rejects immediately, and the app's existing
 * banners say so. A worker that tried to be helpful there — a timeout, a stale
 * fallback, a queued retry — would turn a clean failure into a hang, which is
 * the one behaviour APP-3 names as unacceptable.
 */

/*
 * Rewritten in `dist/` by scripts/build-sw.mjs. Kept as one valid JS statement
 * so this file runs unmodified in dev, and marked with a comment rather than a
 * placeholder string so a failed substitution is a visible `development` in
 * Settings instead of a syntax error nobody sees.
 */
const BUILD = /* __BUILD__ */ { version: 'development', builtAt: null, precache: [] };

const CACHE = `base-shell-${BUILD.version}`;

/*
 * Every navigation resolves to this one document. BASE is a single-page app —
 * `/`, `/settings`, `/project/xyz` and `/s/abc` are all the same HTML with a
 * different route read out of the URL — so one cached shell covers every screen
 * including ones never visited. Cached under its literal path because that is
 * what Vercel serves it as: the rewrite in `vercel.json` deliberately excludes
 * anything ending in a file extension.
 */
const SHELL = '/index.html';

/*
 * Runtime caching is limited to `/assets/`, and the reason is the hash in the
 * filename. `index-CrmmPky3.js` can never mean two different things, so storing
 * it forever is safe. Nothing else is stored at runtime: an unhashed path that
 * went stale in this cache would stay stale until the next deploy, which is the
 * failure this whole file is meant to be honest about rather than to spread.
 */
const IMMUTABLE_PREFIX = '/assets/';

/*
 * `ignoreVary` is NOT a precaution — without it this whole file does nothing.
 *
 * `cache.addAll` fetches each URL as a `no-cors` request, which carries no
 * `Origin` header. Vercel (and Vite's own preview server) answer a static asset
 * with `Vary: Origin`, so that header is stored alongside the response — and
 * the Cache API then only matches a request whose `Origin` agrees. The page's
 * real request for `index-*.js` is a `cors` module fetch and **does** send one,
 * so it misses, falls through to the network, and offline gets an ERR_FAILED on
 * the app's only script: a cached shell with nothing in it.
 *
 * Found by stopping the server and reloading, which is the only way it shows —
 * every one of these entries is present in the cache and `caches.match(url)`
 * from the page finds all of them, because a hand-made `Request` has no
 * `Origin` either. Ignoring Vary is also simply correct here: everything cached
 * is a static file whose bytes do not depend on any request header.
 */
const MATCH = { ignoreVary: true };

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      /*
       * `cache.addAll` is all-or-nothing: one 404 and the whole install fails,
       * leaving the old worker in charge. That is the right failure — a shell
       * with a missing chunk is an app that white-screens offline — and the
       * build script is what guarantees the list matches what was emitted.
       */
      if (BUILD.precache.length) await cache.addAll(BUILD.precache);
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      /*
       * Drop every previous build's cache. The name carries the build version,
       * so this is what stops an old shell surviving beside the new one and
       * eventually being served by a stale `caches.match`.
       */
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith('base-shell-') && name !== CACHE)
          .map((name) => caches.delete(name)),
      );
      /*
       * Take over the page that registered us, so the very first visit is
       * offline-capable without a second load. This fires `controllerchange`
       * in every open tab; `appUpdate.ts` ignores that event unless it was the
       * one that asked for the swap, which is why a first install does not
       * reload the screen out from under you.
       */
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Someone else's server — Google, Firestore, the laptop over Tailscale.
  if (url.origin !== self.location.origin) return;
  // The serverless functions. Never cached, never delayed, never wrapped.
  if (url.pathname.startsWith('/api/')) return;
  // The browser updates this file through its own path; do not stand in it.
  if (url.pathname === '/sw.js') return;

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cached = await caches.match(SHELL, MATCH);
        if (cached) return cached;
        return fetch(request);
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cached = await caches.match(request, MATCH);
      if (cached) return cached;

      const response = await fetch(request);
      if (response.ok && url.pathname.startsWith(IMMUTABLE_PREFIX)) {
        const cache = await caches.open(CACHE);
        /*
         * `put` is deliberately not awaited before the response is returned:
         * the body is already cloned, and making the page wait on a disk write
         * is latency for nothing.
         */
        cache.put(request, response.clone());
      }
      return response;
    })(),
  );
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;

  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  /*
   * What version is actually running. Asked by the App panel in Settings, and
   * the answer is honest by construction: the page asking arrived from this
   * worker's cache, so this worker's version IS the running version. A number
   * fetched from a file on the server would describe the latest deploy
   * instead, which is the opposite of the question.
   */
  if (data.type === 'GET_VERSION') {
    const port = event.ports && event.ports[0];
    if (port) port.postMessage({ version: BUILD.version, builtAt: BUILD.builtAt });
  }
});

/*
 * PUSH
 * ----
 * APP-3 proved one notification through here; BUILD-5 sends the real ones.
 * This handler is still a plain renderer of whatever the server sent — it
 * knows nothing about tasks or deadlines. What each field says is decided in
 * `src/lib/pushPlan.ts`; this only draws it.
 *
 * On Android four things are ours — small icon, title, body, actions
 * (`design-system/screens/notification.html`). Everything else is drawn by
 * the system.
 *
 * `showNotification` is not optional: a push event that resolves without one
 * makes Chrome show its own "This site has been updated in the background"
 * notice, and repeated offences cost the site its push permission — so the
 * catch below still shows something rather than nothing.
 */
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : '' };
  }

  const actions = Array.isArray(payload.actions) ? payload.actions : [];

  event.waitUntil(
    self.registration.showNotification(payload.title || 'BASE', {
      body: payload.body || '',
      // The filled tile, so the notification wears the same icon as the drawer.
      icon: '/brand/icon-192.png',
      // Android's status-bar glyph, which is drawn as a silhouette — the
      // transparent white mark is the only one of the five that survives it.
      badge: '/brand/mark-white.png',
      tag: payload.tag || 'base',
      // A last call replaces its fire under the same tag; without this it
      // would replace it silently.
      renotify: Boolean(payload.renotify && payload.tag),
      ...(typeof payload.timestamp === 'number' ? { timestamp: payload.timestamp } : {}),
      actions: actions.map((a) => ({ action: a.action, title: a.title })),
      data: { url: payload.url || '/', actions, snooze: payload.snooze || null },
    }),
  );
});

/*
 * The "5 min" button. There is no page and no sign-in here, so the alert
 * carries its own proof (see `api/push-snooze.ts`). The last call itself is
 * sent by the server's next knock five minutes on — nothing waits in here,
 * because Android stops a worker within seconds of its event finishing.
 *
 * A snooze that did not reach BASE says so, rather than leaving him to wait
 * five minutes for an alert that is not coming.
 */
async function snooze(data) {
  let ok = false;
  try {
    const response = await fetch('/api/push-snooze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data.snooze),
    });
    ok = response.ok;
  } catch {
    ok = false;
  }
  if (ok) return;
  await self.registration.showNotification('Snooze did not reach BASE', {
    body: 'No alert is coming back. Start the task from the app when you can.',
    icon: '/brand/icon-192.png',
    badge: '/brand/mark-white.png',
    tag: 'base-snooze-failed',
    data: { url: data.url || '/', actions: [], snooze: null },
  });
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};

  if (event.action === 'snooze') {
    if (data.snooze) event.waitUntil(snooze(data));
    return;
  }

  /* A button carries its own destination; the notification body uses the
     alert's. Start goes to `/start/:taskId`, which starts the task running. */
  const chosen = (data.actions || []).find((a) => a.action === event.action);
  const target = new URL((chosen && chosen.url) || data.url || '/', self.location.origin).href;

  event.waitUntil(
    (async () => {
      /*
       * `includeUncontrolled` matters on the first run after an install: a tab
       * this worker has not claimed yet is still BASE, and opening a second
       * window beside it is not what tapping a notification should do.
       */
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        if ('focus' in client) {
          await client.focus();
          /* `navigate` rejects on a tab this worker does not control yet, and
             a tap that does nothing is the one outcome this must not have. */
          try {
            if ('navigate' in client) await client.navigate(target);
          } catch {
            await self.clients.openWindow(target);
          }
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
