# Architecture

How BASE is put together, and the handful of rules that keep it working. Most of these rules
exist because the obvious approach was tried first and broke. The comments in the code say
how, next to the line they protect.

> **Reading the code:** comments cite internal work-item labels such as "item 16",
> "BUILD-6" or "UI-23". Those refer to the author's private planning notes, which aren't
> published. The comment itself always carries the reasoning you need.

---

## The big picture

```
 Browser (React app, installable, works offline)
   │  Zustand stores ── persist ──► localStorage
   │        │
   │        └── sync ──► Firestore  users/{uid}/data/main    (everything you own, one document)
   │                                users/{uid}/data/trash   (the Trash)
   │                                users/{uid}/data/archive (the Archive)
   │                                publicShares/{id}         (share links)
   │
   ├──► Vercel functions (api/)  ── Admin SDK ──► Firestore, Google Calendar, Gemini, Web Push
   │
   └──► Atlas (optional, on your own computer, over Tailscale) ── MCP ──► mcp/ (this app, in Node)
```

- **Frontend:** React 19, TypeScript, Vite, React Router, Zustand, Framer Motion, dnd-kit.
- **Styling:** a custom glass design system in `src/ui/`, on CSS tokens. Tailwind is used for
  layout only.
- **Auth and data:** Firebase Authentication (email and password) and Cloud Firestore.
- **Server:** Vercel serverless functions in `api/`. Firebase Hosting is not used; it can't
  run them.
- **Tests:** Vitest for logic, and a Playwright harness that photographs every screen.

---

## State and sync

- **`src/store/useStore.ts`** is the main store, persisted to localStorage. `useTrashStore`
  and `useArchiveStore` are two more persisted stores; `useUIStore` is in-memory UI state
  only.
- **Everything a user owns is one Firestore document**, `users/{uid}/data/main`, written by
  `src/lib/firestoreSync.ts`. Firestore caps a document at **1 MB**, so anything added to the
  persisted store spends that budget. `buildSyncPayload` in `src/lib/syncPayload.ts` is the one
  place that decides what gets synced. The Settings storage meter measures the size with
  Firestore's own rules (`lib/syncDocSize.ts`), which differ from `JSON.stringify().length`.
- **Tasks live in two arrays.** `backlogTasks` is the real record; `tasks` is today's queue, a
  snapshot copy. Changing one without the other causes bugs.
- **Subtasks are nested values** inside `Task.subtasks`, with unique ids but no parent
  pointer.
- *Action Steps*, *Backburner* and *Reference Materials* are three built-in lists with fixed
  ids, not special types.

## One path for each dangerous change

- **Deleting** goes through `applyDeletion` in the store, which applies a plan from the pure
  `lib/cascadeDelete.ts`, records it in the Trash, and announces it (`lib/deletionEffects.ts`).
  That announcement cleans up today's queue, "waiting on" links, cross-list links, share
  documents and calendar events. **Callers must not clean up after a delete themselves.**
- **Archiving** is the same cascade with a different keeper. An archived item leaves the store
  entirely, so no screen needs an `archived` check.
- **Completing** a task goes through `updateBacklogTask`, which is where a repeating task
  creates its next occurrence (`lib/recurrenceCompletion.ts`) and where deadline pushes are
  recalculated. Don't complete a task by writing the array directly.
- `withPatch` removes a cleared field instead of setting it to `undefined`, because Firestore
  rejects `undefined` and the whole sync write fails with it.

## The pure core

These modules take everything (including "now" and the time zone) as arguments and have no
store, clock or network, so their tests pin exact results:

| Module | What it decides |
|---|---|
| `lib/priority.ts` | The priority score. `store/usePriorityScores.ts` runs it once over the whole backlog. |
| `lib/smartStart.ts` | Today's queue and what was held back; `planStartNow` for starting one task. |
| `lib/deadlineMath.ts` | Pushing dependent deadlines later, recursively, cycle-safe. |
| `lib/recurrence.ts` | Repeat rules (iCalendar RRULE strings), counted from the first occurrence. |
| `lib/cascadeDelete.ts`, `lib/trashModel.ts` | What a delete takes with it, and restoring it. |
| `lib/deadlineReminder.ts` | What becomes a calendar block, whether it reminds, and how it repeats. |
| `lib/pushPlan.ts` | Which push notifications go out, which are missed, snoozes. |
| `lib/boardDrop.ts` | Where a dragged task lands. |
| `lib/paletteSearch.ts`, `lib/shortcutBindings.ts` | Ctrl+K search, shortcut rebinding. |
| `lib/agent/dates.ts` | The one meaning of a stored `YYYY-MM-DDTHH:mm`. Don't add a second. |

## Google Calendar

- Three ways to get a token, tried in order: a one-time redirect that grants offline access
  (`lib/googleOAuthConnect.ts`); the server minting access tokens from a stored refresh token
  (`api/refresh-token.ts`); and a legacy popup. Refresh tokens live at `googleTokens/{uid}`,
  which the rules close to every browser.
- **The sync is a diff.** It reads the calendar once, compares, and writes only what differs
  through Google's batch endpoint, fifty at a time. It runs after every store change, so a
  per-task API call would be far too slow.
- Repeats are compared by parsing, never as strings (Google respells them). A completed
  repeating task collapses to a single block so two events never draw the same series.
- Rate limits (429, and the rate-limited kind of 403) are retried with backoff. A plain 403
  means a missing permission and is not retried.

## Push notifications

- `public/sw.js` is the service worker. It caches the app for offline use, and it is what a
  push is delivered to. It never updates itself; `components/UpdateBanner.tsx` asks first.
- Devices subscribe into `users/{uid}/pushSubscriptions/{id}`, each with its time zone.
- An outside cron calls `api/push-fire.ts` every minute. It runs `server/pushRun.ts`, which is
  **bundled into `api/_lib/pushRun.js`** by `npm run build:push`. Vercel runs each `api/` file
  as plain Node ESM, which can't import `src/` directly. The build fails if the bundle is
  stale.
- What was sent is logged in the same transaction that read it, so two overlapping calls can't
  send twice.

## The admin and the Gemini key

- The admin is `OWNER_EMAIL` in `src/lib/adminAccess.ts`, **with a verified email**.
  `firestore.rules` repeats the address; `server/rules.test.ts` fails if they differ.
- The admin may *read* other accounts' `data/main` and nothing else, and write only
  `accountAccess/{uid}`, the two switches per account (assistant on; on whose key).
- `server/keyAccess.ts` (bundled like the push sender) is the lock on `GEMINI_API_KEY`. Every
  route that spends the key checks it first. The browser-side checks only decide what to show.

## The assistant

- `src/lib/agent/` holds the tools and the model plumbing. The in-browser assistant uses
  Gemini, either through `api/chat.ts` or directly with a user's own key, and has eight tools
  (`fallbackTools`).
- **`mcp/`** runs the app's real store in Node against the user's Firestore document and serves
  the full tool set over MCP, grouped into *drawers* so an agent sees a few tools at a time.
  It writes through the same store actions as the browser, so deletes go to the Trash and
  repeats repeat. It re-reads before every call, and refuses a write if the user changed the
  task since the agent read it.
- Tools that can't be undone are marked `frontDoor` and must be approved by the user. A
  check at start-up refuses to run if the list and the tools disagree.
- **Revert** works through an undo ring (`useSnapshotStore`), which is in-memory and never
  persisted.

## UI conventions

- **Overlays** use `lib/useOverlayDismiss.ts` (Escape closes only the top layer).
- **Stacking order** comes from `lib/zLayers.ts`, applied as an inline `zIndex`. Tailwind can't
  generate a class from a computed value.
- **Dragging** is one system, `components/SortableList.tsx` on dnd-kit. On the board a row's
  drag id is scoped to its list (`listId::taskId`), because one task can show in two lists.
- **Framer Motion overwrites `transform`**, so centre things with flex, not
  `-translate-x-1/2`.
- Write `-webkit-backdrop-filter` **before** `backdrop-filter`; the other order can lose the
  blur after minifying.
- `design-system/` is the design reference the UI was built from. Nothing imports it.

## Screenshot tests

`npm run shots` starts its own dev server, loads a fixed dataset (`scripts/fixture.ts`) with the
clock frozen, photographs every screen at desktop, tablet and phone sizes, and compares against
`shots/baseline/`. Screens that need a server (the chat, Atlas screens, share links) have dev
fixtures in `src/lib/dev*Fixture.ts`. Each fixture is only reachable in development, and
`scripts/check-shots-bypass.mjs` fails the build if one could reach production.
