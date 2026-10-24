# BASE: context for AI assistants

This file tells an AI coding assistant (Claude, Copilot, Cursor, Codex, Gemini and others)
what this repository is and how to work in it safely. People should start with
[README.md](README.md).

## What BASE is

BASE is a **task manager that chooses what you should work on next, then keeps you on it.**
Tagline: *"Strict focus. One task at a time."* It is a single-user productivity web app,
installable as a PWA on phone, tablet and desktop, and it works offline.

The core loop is **capture → score → plan → focus**:

1. **Capture.** Projects hold lists, lists hold tasks, tasks hold subtasks (nested to any
   depth). Each project starts with three built-in lists that have fixed ids: *Action Steps*,
   *Backburner* and *Reference Materials*. A task can be "waiting on" other tasks.
2. **Score.** Every task gets a priority score from seven capped factors: importance (0–9),
   emergency (0–5), deadline, overdue, bottleneck, avoided (times deferred) and duration.
   Factors add up while the task is far from its *latest start* (deadline minus duration).
   Close to it, a smooth curve moves them toward multiplying. Blockers inherit the urgency
   of the work waiting on them.
3. **Plan.** *Smart Start* fills today's queue with the highest scores that fit the hours
   you have. A blocked task only comes in together with its prerequisites. Or you go
   *Select → Deadlines* by hand, giving each task a time box.
4. **Focus.** One task on screen with a timer, its subtasks, +5/+15 minutes, and "defer",
   which counts against the task.

Other features: deadlines that push themselves later when a prerequisite moves, repeating
tasks (iCalendar RRULE), Google Calendar sync, Web Push reminders at the latest start, share
links (read-only, live client view, outsourcing board), a 30-day Trash and an Archive, a
Ctrl+K command palette with rebindable shortcuts, an admin panel, and an **AI assistant**
that can read and change tasks, with a Revert button for each turn.

## Tech stack

- **Frontend:** React 19, TypeScript, Vite, React Router 7, Zustand 5, Framer Motion, dnd-kit
- **Styling:** a custom "liquid glass" design system in `src/ui/` built on CSS tokens.
  Tailwind is for **layout only**.
- **Backend:** Firebase Auth (email/password) and Cloud Firestore. Vercel serverless functions
  live in `api/`. Firebase Hosting is not used.
- **AI:** Google Gemini (`@google/genai`), through `api/chat.ts` or a user's own key. An
  optional local model runs through *Atlas*, a separate companion program that is **not in
  this repo**. It talks to this repo's MCP server in `mcp/`.
- **Tests:** Vitest (Node environment, no jsdom) for logic, and a Playwright screenshot
  harness for every screen.
- Node 22+ (24 recommended). The npm package name is `liquid-glass`. License: MIT.

## Repository map

```
src/
  App.tsx        routes: / /dashboard /calendar /chat /select /deadlines /focus
                 /project/:projectId /scoring /notifications /settings /trash /archive
                 /admin /s/:shareId (public share) /login ...
  pages/         one file per screen
  components/    pieces of screens (chat/, project/, task-fields/, session/, calendar/ ...)
  ui/            the design system: glass surfaces, tokens, motion, icons
  store/         Zustand stores. useStore.ts is the main one and defines Task, Project,
                 TaskList and Subtask
  lib/           the logic, mostly pure functions with tests next to them
    agent/       the assistant: tools, toolServer, model plumbing, transports
    atlas/       client side of the optional local Atlas assistant
  contexts/      AuthContext, ShortcutsContext
api/             Vercel functions: chat, models, google-connect, refresh-token,
                 push-fire, push-snooze, push-test, lookup, admin-accounts
  _lib/          GENERATED bundles of server/. Do not edit by hand
server/          server code bundled into api/_lib/ by `npm run build:push`
mcp/             BASE as an MCP server over stdio (`npm run mcp`)
scripts/         build steps, verify, the screenshot harness, test fixture
design-system/   the visual reference the UI was built from. Nothing imports it
docs/            SETUP.md, FEATURES.md, ARCHITECTURE.md, screenshots
firestore.rules  the security rules that guard all user data
```

## Data model

- **Everything a user owns is one Firestore document:** `users/{uid}/data/main`. Trash and
  Archive are `data/trash` and `data/archive`. Share links are `publicShares/{id}`. Google
  refresh tokens are in `googleTokens/{uid}`, which no browser can read. Push subscriptions
  are in `users/{uid}/pushSubscriptions/{id}`.
- Firestore limits a document to **1 MB**. `src/lib/syncPayload.ts` (`buildSyncPayload`) is
  the one place that decides what gets synced. Don't put bulk data in the persisted store.
- **Tasks live in two arrays.** `backlogTasks` is the real record. `tasks` is today's queue,
  a snapshot copy. Changing one without the other causes bugs.
- Subtasks are nested values in `Task.subtasks`, with unique ids and no parent pointer.
- Stored datetimes use the format `YYYY-MM-DDTHH:mm`. The only interpretation of it is in
  `src/lib/agent/dates.ts`. Don't add a second one.
- A repeating task is *complete-and-clone*. Finishing it stamps it done and creates the next
  occurrence. `seriesId`, `occurrence` and `seriesAnchor` link the occurrences, and only
  `src/lib/recurrence.ts` computes them.

## Rules you must follow

Each of these exists because the obvious approach was tried and broke. The reasoning is in
code comments next to the lines involved.

1. **Read the comment before you "simplify" something.** Odd-looking code is usually
   deliberate. Comments cite labels like "item 16", "BUILD-6" or "UI-23". Those are the
   author's private notes and aren't published, but the comment itself explains the reason.
2. **One path for each dangerous change:**
   - Delete through `applyDeletion` (store) → `lib/cascadeDelete.ts`. It cleans up the
     queue, "waiting on" links, shares and calendar events. **Callers must not clean up
     after a delete themselves.**
   - Archive through the same cascade. Archived items leave the store entirely.
   - Complete or update tasks through `updateBacklogTask`. Don't write the task arrays
     directly.
   - Clear fields with `withPatch`, which removes the key. Firestore rejects `undefined`,
     and one `undefined` makes the whole sync write fail.
3. **Keep logic pure.** Modules such as `lib/priority.ts`, `lib/smartStart.ts`,
   `lib/deadlineMath.ts`, `lib/recurrence.ts`, `lib/cascadeDelete.ts`, `lib/pushPlan.ts` and
   `lib/boardDrop.ts` take "now" and the time zone as arguments and use no store, clock or
   network. New logic of this kind goes in `src/lib/` with a `*.test.ts` next to it.
4. **Styling comes from `src/ui/` tokens.** Colours, glass, radii, shadows, type and motion
   all come from there. Use Tailwind only for flex, grid and spacing.
5. **UI gotchas:**
   - Framer Motion overwrites `transform`, so center things with flex, not
     `-translate-x-1/2`.
   - Write `-webkit-backdrop-filter` *before* `backdrop-filter`. The other order can lose
     the blur after minifying.
   - z-index comes from `lib/zLayers.ts`, applied as an inline `zIndex`.
   - Overlays close through `lib/useOverlayDismiss.ts`, so Escape closes only the top layer.
   - Dragging always goes through `components/SortableList.tsx`. On the board, drag ids are
     `listId::taskId`.
6. **Secrets never get a `VITE_` prefix.** Vite puts every `VITE_*` variable into the public
   bundle. `FIREBASE_SERVICE_ACCOUNT` and `GEMINI_API_KEY` are server-only.
   `FIREBASE_SERVICE_ACCOUNT` bypasses all security rules.
7. **Changed `server/`, or code it imports?** Run `npm run build:push` and commit the
   regenerated `api/_lib/` files. The build fails when they are stale. (Vercel runs `api/`
   as plain Node ESM, which can't import `src/`.)
8. **Admin identity is in two places.** It is `OWNER_EMAIL` in `src/lib/adminAccess.ts` and
   `isAdmin()` in `firestore.rules`. `server/rules.test.ts` fails if they differ.
   `server/keyAccess.ts` is the server-side lock on the Gemini key. Browser-side checks
   only decide what the UI shows.
9. **Assistant tools that can't be undone are marked `frontDoor`** and need the user's
   approval. A start-up consistency check (`lib/agent/toolServer/consistency.ts`) refuses
   to run if the list and the tools disagree. Revert uses an in-memory undo ring
   (`useSnapshotStore`) that is never persisted.
10. **Dev fixtures** (`src/lib/dev*Fixture.ts`) exist for screenshots. They must never be
    reachable in production, and `scripts/check-shots-bypass.mjs` checks that.

## The assistant and MCP

- `src/lib/agent/tools/` holds the tool implementations (tasks, subtasks, board, queue,
  schedule, moves, events, shares, trash, evening, batch). The in-browser chat exposes a
  smaller set, `fallbackTools`.
- `mcp/` runs the app's real Zustand store in Node against the user's Firestore document. It
  serves the full tool set over MCP, grouped into "drawers" so an agent sees only a few tools
  at a time. It writes through the same store actions as the UI, so deletes go to the Trash
  and repeating tasks repeat. It re-reads before every call and refuses a write if the task
  changed since the agent read it.

## Commands

```bash
npm install
npm run dev          # app only, http://localhost:5173
npm run dev:full     # app + api/ functions (vercel dev)
npm test             # Vitest: src/, mcp/, server/
npm run lint         # ESLint, zero warnings allowed
npm run typecheck    # tsc -b --force
npm run build        # checks generated bundles, vite build, service worker
npm run verify       # lint + typecheck + test + build in parallel, then screenshots if needed
npm run shots        # screenshot regression (run `npm run shots:update` once first)
npm run build:push   # regenerate api/_lib/ from server/
npm run mcp          # start the MCP server
```

Before you call a change done, run `npm run verify`, or at least
`npm run lint && npm run typecheck && npm test`. The app needs a filled-in `.env` (copy
`.env.example`, then add the six `VITE_FIREBASE_*` values) to start. Without it, screenshots
time out with `auth/invalid-api-key`.

## Style

TypeScript and React function components, Prettier-compatible formatting. Match the code
around you, including how much it comments. Comments explain *why*, not *what*.

## Further reading

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how the parts fit, and why
- [docs/FEATURES.md](docs/FEATURES.md): a tour of each screen and the ideas behind it
- [docs/SETUP.md](docs/SETUP.md): Firebase, Vercel and every optional feature
- [CONTRIBUTING.md](CONTRIBUTING.md): house rules and the pull request process
- [.env.example](.env.example): every environment variable, explained
