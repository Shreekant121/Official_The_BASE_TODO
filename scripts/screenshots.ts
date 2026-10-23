/**
 * Visual verification harness — photographs every main screen and every
 * overlay the app can open, on desktop, tablet and phone, against a fixed
 * dataset.
 *
 *   npm run shots            # capture, then diff against the committed baselines
 *   npm run shots:update     # accept what you see as the new baselines
 *   npm run shots:accept     # promote only what the last run flagged — no re-capture
 *   npm run shots -- --only=recurrence     # just the shots whose name matches
 *   npm run shots -- --workers=1           # one at a time (default: WORKERS below)
 *   npm run shots -- --viewport=phone      # one viewport only (combines with --only)
 *
 * `--only` and `--viewport` clear only the files they are about to rewrite, so
 * the rest of the last full run in `shots/current/` and `shots/diff/` survives.
 *
 * Baselines live in `shots/baseline/<viewport>/` and are committed; a plain run
 * writes to `shots/current/<viewport>/`, which is gitignored, and reports which
 * files stopped matching. Re-baseline only when the change was intentional.
 *
 * ── What makes a run reproducible ────────────────────────────────────────────
 *
 * - **Auth.** Every screen worth capturing is behind `ProtectedRoute`. Instead
 *   of real credentials, one localStorage key switches on the dev-only bypass
 *   in `src/lib/devAuth.ts`, which a production build strips out entirely.
 * - **Data.** `scripts/fixture.ts` is seeded into the `mutineer-os-storage`
 *   key before the app boots, so nothing is read from Firestore. The public
 *   share view is the one screen that key cannot reach — it reads only
 *   Firestore — so it gets its own dev-only fixture, `src/lib/devShareFixture.ts`,
 *   stripped from production builds by the same check as the auth bypass.
 * - **The clock.** Installed as a *fake* clock pinned to `FROZEN_NOW` and then
 *   advanced by hand in fixed steps. That does two jobs. It stops every
 *   "due in 3 days" chip and deadline-derived priority score from drifting
 *   overnight — and, because Playwright's fake clock also drives
 *   `requestAnimationFrame`, it puts Framer Motion on a virtual timeline. That
 *   second part is not optional: several surfaces animate *forever* (the
 *   project-card icon breathes on a 3.5s loop, for one), so with a real clock
 *   they land on a different frame every run and no two captures ever match.
 *   Every shot is therefore photographed at exactly `READY_AT_MS` (or
 *   `OPENED_AT_MS`) of virtual time since navigation, never at "whenever the
 *   wall clock got here".
 * - **The network.** Everything off localhost is aborted — the Google Identity
 *   Services script in `index.html`, Firestore, the lot. No run depends on
 *   being online, and no run can be perturbed by a remote response.
 * - **A fresh context per shot.** Several screens write to the store on mount
 *   (Set Deadlines restores allocated time, for one), so shots would otherwise
 *   contaminate each other through persisted localStorage.
 * - **The animations the clock does NOT own.** Faking the clock takes over
 *   `setTimeout` and `requestAnimationFrame`, and so takes over Framer Motion —
 *   but not the document timeline, which is what drives CSS animations and
 *   transitions. Those keep running on the wall clock however the harness winds
 *   its own. `settleAnimations` waits them out before a scripted interaction is
 *   allowed to land on top of them; see UI-23 in the comment on that function
 *   for what happens when it does not.
 *
 * Even with all of that, two captures are never byte-identical; `imageDiff.ts`
 * explains why and what the comparison does about it. The harness never decides
 * whether a change is *correct* — it decides that something moved, writes out
 * both images and a highlighted diff, and leaves the judgement to a person.
 *
 * Baselines are specific to the machine that captured them (font rasterisation
 * differs across operating systems), which is fine for a single-developer
 * project and is why this is a script rather than something CI runs.
 */
import { access, copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { createServer, type ViteDevServer } from 'vite';
import { DEV_AUTH_KEY } from '../src/lib/devAuth.ts';
import { ATLAS_URL_KEY } from '../src/lib/atlas/client.ts';
import { LANDING_KEY } from '../src/lib/landingPref.ts';
import {
  DEV_SHARE_IDS, DEV_STILL_PRESENCE_KEY, FROZEN_NOW, LOCALE, STORAGE_KEY, TIMEZONE, TRASH_STORAGE_KEY,
  ARCHIVE_STORAGE_KEY, serializedStore, serializedTrash, serializedArchive,
  DASHBOARD_STORAGE_KEY, serializedDashboard,
} from './fixture.ts';
import { Comparator } from './imageDiff.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS_DIR = join(ROOT, 'shots');

/**
 * The virtual timeline every shot follows, in milliseconds of fake time since
 * navigation. The clock only ever moves in these four fixed jumps — never in
 * response to how long something took — which is the whole point: a component
 * that mounts while the clock is parked starts its animations at exactly the
 * parked reading, however slow the machine was that day.
 *
 * `BOOT_MS` has to clear the longest mount-time timer on the way to a first
 * paint (`App.tsx` holds the splash for 600ms); `OPEN_STEP_MS` has to clear the
 * `setTimeout(…, 50)` several screens use to focus a freshly revealed input.
 * The generous gaps up to each `*_AT_MS` mark let every spring come to rest.
 */
const BOOT_MS = 3_000;
const READY_AT_MS = 12_000;
const OPEN_STEP_MS = 1_000;
const OPENED_AT_MS = 20_000;

// ─── Viewports ───────────────────────────────────────────────────────────────

interface Viewport {
  name: string;
  width: number;
  height: number;
  hasTouch: boolean;
}

/**
 * Tablet is 820×1180 portrait: wide enough for Tailwind's `md` breakpoint but
 * not `lg`, which is the layout band no desktop shot covers. Touch is emulated
 * there because Session 7's drag work has to be judged on a touch device.
 *
 * These numbers were originally chosen from an iPad Air, which is the WRONG
 * device — Shreekant's tablet is Android, in Chrome (`CLAUDE.md`, "His two
 * devices"). 820×1180 still sits in the `md`-not-`lg` band this run exists to
 * cover, so it is not wrong for the purpose, but it has never been checked
 * against his actual viewport. Do not "fix" the numbers casually: changing
 * either one re-baselines every tablet capture in `shots/baseline/`, so it is a
 * deliberate, separately-verified change, not a tidy-up.
 *
 * Phone is 390×844, the phone half of `design-system/Devices.dc.html` (V3-1).
 * **No screen has a phone layout yet** — that is step 41 (`V3-10`), his call,
 * last of everything. The viewport is here now so that every V3 screen session
 * between banks what its screen does at that size, and step 41 starts from
 * baselines rather than blind. So a phone baseline records the app as it
 * falls at 390px, not as it is meant to look, and it moving is expected until
 * step 41. Shots whose script cannot run there are skipped by `Shot.phone`.
 */
const VIEWPORTS: Viewport[] = [
  { name: 'desktop', width: 1440, height: 900, hasTouch: false },
  { name: 'tablet', width: 820, height: 1180, hasTouch: true },
  { name: 'phone', width: 390, height: 844, hasTouch: true },
];

// ─── Shots ───────────────────────────────────────────────────────────────────

interface Shot {
  /** File name, without extension. */
  name: string;
  /** Route to open. */
  path: string;
  /** Must be visible before the screen counts as loaded. */
  ready: string;
  /**
   * Clicks/keystrokes that open the overlay this shot is about. `settle` winds
   * the fake clock on by one step and then waits out any CSS animation the
   * clock does not drive — call it between interactions when the second one
   * targets something the first has to finish animating open. Skipping it does
   * not merely photograph a half-open overlay; it lets the second interaction
   * measure a box that is still moving. See `settleAnimations`.
   */
  open?: (page: Page, settle: () => Promise<void>) => Promise<void>;
  /** Must be visible after `open` has run. */
  opened?: string;
  /**
   * Overrides `MAX_CLUSTERED_CELLS` for this shot alone. Only for a screen
   * whose own rendering noise has been *measured* above the global floor —
   * see the note on that constant, and write the measurement down here.
   */
  maxCells?: number;
  /**
   * `false` skips this shot at the phone viewport. Only for a shot whose
   * `open` script cannot run at 390px — the control it presses is not on
   * screen there until step 41 gives the screen a phone layout — and say
   * which control beside it. Step 41 turns these back on.
   */
  phone?: false;
}

/**
 * `/login` is deliberately absent. UI-6 gave two reasons; UI-28 removed one
 * of them and the other still stands on its own.
 *
 * STILL TRUE — its background (`LoginAuraScene`) runs permanent Framer Motion
 * loops: a per-ring breathe of 10-to-18 seconds and an `offsetDistance` orbit
 * of 48 to 96, driven by rAF against real elapsed time, so two captures of it
 * are never the same image. Freezing rAF hard enough to fix that would also
 * stop every spring the rest of the harness relies on settling. UI-28
 * reconciled this screen against `design-system/screens/login.html`, which has
 * no backdrop scene at all — the scene is the app's own and Shreekant kept it,
 * so this reason is a standing one, not a stopgap.
 *
 * NO LONGER TRUE — the heading swap was an `AnimatePresence mode="wait"`,
 * whose exiting child never receives a last frame under a parked clock, so a
 * captured sign-in/register swap showed the heading frozen on the mode it had
 * just left. UI-28 replaced it with the mockup's own answer: a re-keyed
 * `ag-condense`, which is a CSS animation the harness already settles by
 * waiting it out. `LoginPage.tsx` imports no Framer Motion at all now.
 *
 * So a baseline would still be unstable, but it would no longer photograph a
 * state no person can reach. UI-6 and UI-28 both verified the screen against a
 * real browser instead — which is also the only way to press a mode switch or
 * a reveal toggle, neither of which a baseline can do.
 */
/**
 * `/scoring`'s own floor, measured at UI-30 (`Shot.maxCells`).
 *
 * `MAX_CLUSTERED_CELLS`'s own note already named this screen as the set's worst case, at a peak
 * of 178, *"whose native date inputs render their text unstably"*. UI-30 raised
 * that floor: the screen went from a 12-column grid of small cards to one
 * `--glass-bd-md` pane holding every score input, a second `--glass-bd-md` pane
 * for the `Instrument`, and two `--glass-bd-lg` bars floating over the content.
 * Far more text now sits on heavy glass, and heavy glass is precisely what
 * `imageDiff.ts` opens by saying Chromium rasterises at a different sub-pixel
 * offset from one run to the next.
 *
 * Measured over five consecutive no-change runs of the full set: **441, 357,
 * 335, 313, 0** — and *which* of the six scoring shots exceeds 300 changes from
 * run to run, which is what proves it is the noise population rather than a
 * regression. Every one of those diffs was opened: selective glyph-contrast
 * flips scattered over the two panes, adjacent identically-styled words
 * untouched, and no element box moved (the boxes were also read back directly
 * from a live browser). A real regression on this set measures 772–1043, so 550
 * still sits in the gap — and it is spent on these six shots only, rather than
 * blunting the other forty-three.
 */
const SCORING_CLUSTERED_CELLS = 550;

/**
 * Scrolls the `/chat` transcript holding `text` to one end, for the shots that
 * need it at a known place (see `chat-turns` and `chat-markdown` for why).
 *
 * It walks up to the first ancestor that **can** scroll — `overflow-y` of
 * `auto` or `scroll` — and actually overflows. The walk used to take the
 * first ancestor whose `scrollHeight` beat its `clientHeight`, and that is a
 * measurement of layout, not a property of the box: measured 2026-09-24, a
 * finished turn sometimes reports 4px of overflow it no longer has (733 tall,
 * 737 of `scrollHeight`, transform back at identity, nothing still running) —
 * left over from its `ag-condense` entrance when the machine laid the page out
 * mid-flight, which happens under a full parallel run and almost never alone.
 * The walk stopped at that turn's plain `div`, the write did nothing, and the
 * transcript stayed wherever the page had pinned it: `chat-markdown`
 * photographed the bottom of the reply (14,076 cells desktop, 6,849 phone),
 * while the shots that scroll to the bottom passed by luck.
 */
function scrollTranscriptTo(page: Page, text: string, end: 'top' | 'bottom'): Promise<void> {
  return page.getByText(text).evaluate((el, toTop) => {
    for (let node = el.parentElement; node; node = node.parentElement) {
      const { overflowY } = getComputedStyle(node);
      if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight + 1) {
        node.scrollTop = toTop ? 0 : node.scrollHeight;
        return;
      }
    }
  }, end === 'top');
}

/** OPT-12: two open tasks made late against the frozen clock (12 March, 09:30). */
const MAKE_TWO_LATE = `(async function () {
  var S = await import('/src/store/useStore.ts');
  var open = S.useStore.getState().backlogTasks.filter(function (t) { return !t.parent && t.status !== 'completed'; });
  var late = {}; late[open[2].id] = '2026-03-08T21:30'; late[open[4].id] = '2026-03-11T18:00';
  S.useStore.setState(function (s) { return { backlogTasks: s.backlogTasks.map(function (t) {
    return late[t.id] ? Object.assign({}, t, { deadline: late[t.id] }) : t; }) }; });
  return true;
})()`;

/**
 * 29-1P14d1, idea 26: three notices up at once — the broken sync, a reminder
 * that did not reach Google and a new version — so they pile.
 */
const PILE_NOTICES = `(async function () {
  var U = await import('/src/store/useUIStore.ts');
  var s = U.useUIStore.getState();
  s.setCloudSyncOk(false);
  s.setReminderSyncIssue('Google said the calendar could not be reached.');
  U.useUIStore.setState({ updateReady: true });
  return true;
})()`;

/** 29-1P14d1, idea 114: the connection drops. The page only hears the event. */
const GO_OFFLINE = `(function () { window.dispatchEvent(new Event('offline')); return true; })()`;

/** 29-1P10b: a session paused 3:12 into flow (see `focus-flow`). */
const IN_FLOW = `(async function () {
  var R = await import('/src/store/useFocusRun.ts');
  R.useFocusRun.setState({ begun: true, taskBegun: true, taskLeft: -192, sessionLeft: 14400 - 5400 - 192 });
  return true;
})()`;

/**
 * 29-1P8c, idea 153: Shreekant Empire made a folder of four — Studio Launch
 * moved inside, and three made here with fixed ids and covers (a project with
 * no stored cover rolls one from its id, and `addProject`'s ids are random).
 * Set straight into the store, so no undo toast is on the picture.
 */
const MAKE_A_FOLDER = `(async function () {
  var S = await import('/src/store/useStore.ts');
  var made = [
    { id: 'p-hire', name: 'Hiring', cover: { kind: 'pattern', pattern: 'stripes', seed: 7 } },
    { id: 'p-legal', name: 'Legal', cover: { kind: 'name', seed: 3 } },
    { id: 'p-money', name: 'Money', cover: { kind: 'aurora', seed: 11 } },
  ].map(function (p, i) { return Object.assign({ description: '', createdAt: 1740300000000 + i, order: i + 1, parentId: 'p-empire' }, p); });
  S.useStore.setState(function (s) { return { projects: s.projects.map(function (p) {
    return p.id === 'p-studio' ? Object.assign({}, p, { parentId: 'p-empire', order: 0 }) : p; }).concat(made) }; });
  return true;
})()`;

/**
 * 29-1P8c, idea 154: three projects opened on this device, against the frozen
 * clock — Studio Launch twelve and a half minutes ago at a task (the half
 * keeps the label clear of a minute's edge as the harness clock drifts),
 * Shreekant Empire yesterday in a list, Personal on Monday with nowhere noted.
 */
const SEED_JUMP_BACK = `(async function () {
  var J = await import('/src/store/useJumpBackStore.ts');
  var now = Date.now(), min = 60000;
  J.useJumpBackStore.setState({ spots: [
    { projectId: 'p-studio', at: now - 12.5 * min, taskId: 't-invites', listId: 'l-studio-launch' },
    { projectId: 'p-empire', at: now - 26 * 60 * min, listId: 'l-empire-ops' },
    { projectId: 'p-personal', at: now - 3 * 24 * 60 * min },
  ] });
  return true;
})()`;

const SHOTS: Shot[] = [
  // ── Home ──
  /*
   * BIG-6 — the Dashboard, 29-1a. No stored layout in the fixture, so these
   * photograph the default one: the one thing, today, the next deadline, the
   * overdue pile and the busiest project, all read off the fixture at
   * FROZEN_NOW.
   */
  { name: 'dashboard', path: '/dashboard', ready: 'text=Do this one thing' },
  /* 29-1P14d1: the notices at the top, piled (idea 26), then fanned by the
     mouse, and the offline pill (idea 114). Nothing else seeds either. */
  {
    name: 'notices-pile',
    path: '/dashboard',
    ready: 'text=Do this one thing',
    open: (page) => page.evaluate(PILE_NOTICES),
    opened: '[data-notice-stack="piled"]',
  },
  {
    name: 'notices-fanned',
    path: '/dashboard',
    ready: 'text=Do this one thing',
    open: async (page, settle) => {
      await page.evaluate(PILE_NOTICES);
      await page.locator('[data-notice-stack="piled"]').waitFor();
      await settle();
      await page.locator('[data-notice-stack]').hover({ position: { x: 40, y: 20 } });
    },
    opened: '[data-notice-stack="fanned"]',
  },
  {
    name: 'offline-pill',
    path: '/dashboard',
    ready: 'text=Do this one thing',
    open: (page) => page.evaluate(GO_OFFLINE),
    opened: '[data-offline-pill="offline"]',
  },
  {
    name: 'dashboard-edit',
    path: '/dashboard',
    ready: 'text=Do this one thing',
    open: (page) => page.getByRole('button', { name: 'Edit', exact: true }).click(),
    opened: 'text=Pull its corner to resize it',
  },
  {
    name: 'dashboard-gallery',
    path: '/dashboard',
    ready: 'text=Do this one thing',
    open: (page) => page.getByRole('button', { name: 'Add widget' }).click(),
    opened: 'text=It goes at the end',
  },
  {
    name: 'dashboard-settings',
    path: '/dashboard',
    ready: 'text=Do this one thing',
    open: async (page, settle) => {
      await page.getByRole('button', { name: 'Edit', exact: true }).click();
      await settle();
      await page.getByRole('button', { name: 'Widget settings' }).last().click();
    },
    opened: 'text=Measure by',
  },
  /* OPT-12 — nothing in the fixture is late, so the Overdue block says "All
     caught up" on `dashboard`. These two make two tasks late through the live
     store, the oldest by three and a half days: a flame half grown. */
  {
    name: 'dashboard-flame',
    path: '/dashboard',
    ready: 'text=Do this one thing',
    open: (page) => page.evaluate(MAKE_TWO_LATE),
    opened: 'text=Oldest burning',
  },
  {
    name: 'dashboard-overdue',
    path: '/dashboard',
    ready: 'text=Do this one thing',
    open: async (page) => {
      await page.evaluate(MAKE_TWO_LATE);
      await page.getByRole('button', { name: 'See every overdue task', exact: true }).click();
    },
    opened: 'text=Oldest first',
  },
  /* BIG-6, 29-1b — the hours block's two sheets. The fixture's Dashboard seed
     sets today to four hours, so the first shows the override and its way back. */
  {
    name: 'dashboard-hours',
    path: '/dashboard',
    ready: 'text=Do this one thing',
    open: (page) => page.getByRole('button', { name: 'Hours you have', exact: true }).click(),
    opened: 'text=Every week',
  },
  {
    name: 'dashboard-log-time',
    path: '/dashboard',
    ready: 'text=Do this one thing',
    open: (page) => page.getByRole('button', { name: 'Log time by hand', exact: true }).click(),
    opened: 'text=Work the timer did not see',
  },
  /* 29-1P13 — the three new blocks, which no default layout holds: a Stack,
     the runway and Waiting on, put at the top through the live store, with two
     names on tasks (one handed over eight days before the frozen clock). */
  {
    name: 'dashboard-new-blocks',
    path: '/dashboard',
    ready: 'text=Do this one thing',
    open: async (page) => { await page.evaluate(`(async function () {
      var S = await import('/src/store/useStore.ts');
      var D = await import('/src/store/useDashboardStore.ts');
      var open = S.useStore.getState().backlogTasks.filter(function (t) { return !t.parent && t.status !== 'completed'; });
      S.useStore.getState().updateBacklogTask(open[1].id, { assignee: 'Priya' });
      S.useStore.getState().updateBacklogTask(open[3].id, { assignee: 'Rahul (CA)' });
      S.useStore.setState(function (s) { return { backlogTasks: s.backlogTasks.map(function (t) {
        return t.id === open[3].id ? Object.assign({}, t, { assignedAt: Date.now() - 8 * 86400000 }) : t; }) }; });
      var d = D.useDashboardStore.getState();
      d.addBlock('stack', undefined, 0); d.addBlock('runway', undefined, 1); d.addBlock('waiting-on', undefined, 2);
      return true;
    })()`); },
    opened: 'text=Next two weeks',
  },
  /* 29-1c1 — the quick-add note (idea 143), which no default layout holds,
     put first with three jotted lines filing into a project's list. */
  {
    name: 'dashboard-quick-add',
    path: '/dashboard',
    ready: 'text=Do this one thing',
    open: async (page) => { await page.evaluate(`(async function () {
      var D = await import('/src/store/useDashboardStore.ts');
      D.useDashboardStore.getState().addBlock('quick-add', {
        listId: 'l-empire-build',
        note: 'call priya about the logo\\n- buy printer ink\\nidea: a newsletter for the studio',
      }, 0);
      return true;
    })()`); },
    /* "Add 3" on the phone, where the block is one column wide. */
    opened: 'text=Add 3',
  },
  /* 29-1c2 — the timeline (ideas 29, 38, 128), which no default layout holds.
     Two of the fixture's tasks are put on the frozen day (12 March), one of
     them at 7:30pm, so the Today block, made two tall, splits into now and
     This evening with its moons; the timeline opens on the hours around the
     orange now line at 9:30. The second shot is the week, four cells wide. */
  {
    name: 'dashboard-timeline',
    path: '/dashboard',
    ready: 'text=Do this one thing',
    open: async (page) => { await page.evaluate(`(async function () {
      var S = await import('/src/store/useStore.ts');
      var D = await import('/src/store/useDashboardStore.ts');
      var open = S.useStore.getState().backlogTasks.filter(function (t) { return !t.parent && t.status !== 'completed'; });
      S.useStore.getState().updateBacklogTask(open[0].id, { deadline: '2026-03-12T11:00' });
      S.useStore.getState().updateBacklogTask(open[4].id, { deadline: '2026-03-12T19:30' });
      var d = D.useDashboardStore.getState();
      d.addBlock('timeline', undefined, 0);
      var today = d.blocks.find(function (b) { return b.kind === 'today'; });
      D.useDashboardStore.getState().resizeBlock(today.id, 2, 2);
      return true;
    })()`); },
    opened: '[aria-label="Back to the day"]',
  },
  {
    name: 'dashboard-timeline-week',
    path: '/dashboard',
    ready: 'text=Do this one thing',
    open: async (page) => { await page.evaluate(`(async function () {
      var D = await import('/src/store/useDashboardStore.ts');
      var d = D.useDashboardStore.getState();
      d.addBlock('timeline', { range: 'week' }, 0);
      var tl = D.useDashboardStore.getState().blocks[0];
      D.useDashboardStore.getState().resizeBlock(tl.id, 4, 2);
      return true;
    })()`); },
    opened: 'text=This week',
  },
  /* 29-1c3 — the week strip (ideas 40, 128) with another day picked: two of
     the fixture's tasks are put on Friday 13 March, the day after the frozen
     one, and Friday is tapped, so the timeline, the Today block (two tall)
     and Hours all show Friday, the strip's Friday a lime gel with its dots. */
  {
    name: 'dashboard-week-strip',
    path: '/dashboard',
    ready: 'text=Do this one thing',
    open: async (page) => {
      await page.evaluate(`(async function () {
        var S = await import('/src/store/useStore.ts');
        var D = await import('/src/store/useDashboardStore.ts');
        var open = S.useStore.getState().backlogTasks.filter(function (t) { return !t.parent && t.status !== 'completed'; });
        S.useStore.getState().updateBacklogTask(open[0].id, { deadline: '2026-03-13T11:00' });
        S.useStore.getState().updateBacklogTask(open[4].id, { deadline: '2026-03-13T16:30' });
        var d = D.useDashboardStore.getState();
        d.addBlock('timeline', undefined, 0);
        var today = d.blocks.find(function (b) { return b.kind === 'today'; });
        D.useDashboardStore.getState().resizeBlock(today.id, 2, 2);
        return true;
      })()`);
      await page.locator('[data-plus-day="2026-03-13"]').click();
    },
    opened: 'text=Tomorrow',
  },
  /* 29-1c4 — a new account's three questions. Only an account with no
     projects of its own and a Dashboard document that says so is asked, so
     the fixture's projects are taken away and the flag set, then two answers
     picked (the first leads). */
  {
    name: 'dashboard-first-run',
    path: '/dashboard',
    ready: 'text=Do this one thing',
    open: async (page) => {
      await page.evaluate(`(async function () {
        var S = await import('/src/store/useStore.ts');
        var D = await import('/src/store/useDashboardStore.ts');
        S.useStore.setState({ projects: [] });
        D.useDashboardStore.getState().askFirstRun();
        return true;
      })()`);
      await page.getByRole('button', { name: /^Deadlines coming up/ }).click();
      await page.getByRole('button', { name: /^How much I've worked/ }).click();
    },
    opened: 'text=· leads',
  },
  /* 29-1c4 — the Sample blocks, which a first run puts on a new account's
     Dashboard and the gallery offers under "Coming next". Three since 29-2a
     made the countdown real. */
  {
    name: 'dashboard-samples',
    path: '/dashboard',
    ready: 'text=Do this one thing',
    open: async (page) => { await page.evaluate(`(async function () {
      var D = await import('/src/store/useDashboardStore.ts');
      var d = D.useDashboardStore.getState();
      d.addBlock('sample-morning', undefined, 0);
      d.addBlock('sample-streak', undefined, 1); d.addBlock('sample-routine', undefined, 2);
      return true;
    })()`); },
    opened: 'text=days in a row',
  },
  /* 29-2a — the real Countdown widget, two tall: the soonest event, the next
     two under it, and the archive button for the one that has passed. Dated
     against FROZEN_NOW (12 March 2026). */
  {
    name: 'dashboard-countdown',
    path: '/dashboard',
    ready: 'text=Do this one thing',
    open: async (page) => { await page.evaluate(`(async function () {
      var E = await import('/src/store/useEventStore.ts');
      var e = E.useEventStore.getState();
      e.addEvent({ title: 'Mumbai Marathon', start: '2026-03-20T06:00', end: '2026-03-20T10:00', location: 'Marine Drive' }, 'ev-race');
      e.addEvent({ title: "Mum's birthday", start: '1964-04-02', recurrence: 'yearly', colour: 'rose', countdown: 'days' }, 'ev-bday');
      e.addEvent({ title: 'Goa trip', start: '2026-05-01', end: '2026-05-05', colour: 'teal', countdown: 'weeks' }, 'ev-goa');
      e.addEvent({ title: 'Holi', start: '2026-03-04' }, 'ev-holi');
      var D = await import('/src/store/useDashboardStore.ts');
      var id = D.useDashboardStore.getState().addBlock('countdown', undefined, 0);
      D.useDashboardStore.getState().resizeBlock(id, 2, 2);
      return true;
    })()`); },
    opened: '[data-countdown-event="ev-race"]',
  },
  /* 29-2e1 — the Calendar, its three views, with the fixture's tasks and five
     events (a weekly class, a birthday, a trip over four days, two one-offs),
     dated against FROZEN_NOW (Thursday 12 March 2026). The month is its first
     view on a device that has not picked one. */
  {
    name: 'calendar-month',
    path: '/calendar',
    ready: 'text=This month',
    open: async (page) => { await page.evaluate(`(async function () {
      var E = await import('/src/store/useEventStore.ts');
      var e = E.useEventStore.getState();
      e.addEvent({ title: 'Mumbai Marathon', start: '2026-03-15T06:00', end: '2026-03-15T10:00', location: 'Marine Drive', colour: 'orange' }, 'ev-race');
      e.addEvent({ title: 'Gym', start: '2026-03-02T07:00', recurrence: 'weekly', colour: 'teal' }, 'ev-gym');
      e.addEvent({ title: 'Dentist', start: '2026-03-12T12:30', end: '2026-03-12T13:30', colour: 'violet', location: 'Bandra' }, 'ev-dent');
      e.addEvent({ title: 'Goa trip', start: '2026-03-19', end: '2026-03-22', colour: 'teal' }, 'ev-goa');
      e.addEvent({ title: "Mum's birthday", start: '1964-03-13', recurrence: 'yearly', colour: 'rose' }, 'ev-bday');
      return true;
    })()`); },
    opened: '[aria-label^="Friday 13 March, 1 event"]',
  },
  {
    name: 'calendar-week',
    path: '/calendar',
    ready: 'text=This month',
    open: async (page) => { await page.evaluate(`(async function () {
      var E = await import('/src/store/useEventStore.ts');
      var e = E.useEventStore.getState();
      e.addEvent({ title: 'Mumbai Marathon', start: '2026-03-15T06:00', end: '2026-03-15T10:00', location: 'Marine Drive', colour: 'orange' }, 'ev-race');
      e.addEvent({ title: 'Gym', start: '2026-03-02T07:00', recurrence: 'weekly', colour: 'teal' }, 'ev-gym');
      e.addEvent({ title: 'Dentist', start: '2026-03-12T12:30', end: '2026-03-12T13:30', colour: 'violet', location: 'Bandra' }, 'ev-dent');
      e.addEvent({ title: 'Goa trip', start: '2026-03-19', end: '2026-03-22', colour: 'teal' }, 'ev-goa');
      e.addEvent({ title: "Mum's birthday", start: '1964-03-13', recurrence: 'yearly', colour: 'rose' }, 'ev-bday');
      var C = await import('/src/store/useCalendarView.ts');
      C.useCalendarView.getState().setView('week');
      return true;
    })()`); },
    opened: 'text=This week',
  },
  {
    name: 'calendar-day',
    path: '/calendar',
    ready: 'text=This month',
    open: async (page) => { await page.evaluate(`(async function () {
      var E = await import('/src/store/useEventStore.ts');
      var e = E.useEventStore.getState();
      e.addEvent({ title: 'Mumbai Marathon', start: '2026-03-15T06:00', end: '2026-03-15T10:00', location: 'Marine Drive', colour: 'orange' }, 'ev-race');
      e.addEvent({ title: 'Gym', start: '2026-03-02T07:00', recurrence: 'weekly', colour: 'teal' }, 'ev-gym');
      e.addEvent({ title: 'Dentist', start: '2026-03-12T12:30', end: '2026-03-12T13:30', colour: 'violet', location: 'Bandra' }, 'ev-dent');
      e.addEvent({ title: 'Goa trip', start: '2026-03-19', end: '2026-03-22', colour: 'teal' }, 'ev-goa');
      e.addEvent({ title: "Mum's birthday", start: '1964-03-13', recurrence: 'yearly', colour: 'rose' }, 'ev-bday');
      var C = await import('/src/store/useCalendarView.ts');
      C.useCalendarView.getState().setView('day');
      return true;
    })()`); },
    opened: 'text=Dentist',
  },
  /* 29-2b — the four new styles, one widget each: Cover (a made picture, as
     no fixture has one), Shape (a burst), Journey (set twelve days ago) and
     the split-flap board. Minimal is dashboard-countdown above. */
  {
    name: 'dashboard-countdown-styles',
    path: '/dashboard',
    ready: 'text=Do this one thing',
    open: async (page) => { await page.evaluate(`(async function () {
      var E = await import('/src/store/useEventStore.ts');
      var e = E.useEventStore.getState();
      var svg = "<svg xmlns='http://www.w3.org/2000/svg' width='600' height='350'><defs><linearGradient id='g' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#3a6fd8'/><stop offset='0.7' stop-color='#f08a4b'/><stop offset='1' stop-color='#5a2a1a'/></linearGradient></defs><rect width='600' height='350' fill='url(#g)'/><circle cx='420' cy='110' r='60' fill='#ffe9a8'/></svg>";
      var day = 86400000;
      e.putEvent({ id: 'ev-race', title: 'Mumbai Marathon', start: '2026-03-20T06:00', end: '2026-03-20T10:00', location: 'Marine Drive', colour: 'orange', imageUrl: 'data:image/svg+xml;base64,' + btoa(svg), createdAt: Date.now() - 12 * day });
      e.putEvent({ id: 'ev-bday', title: "Mum's birthday", start: '1964-04-02', recurrence: 'yearly', colour: 'rose', shape: 'burst', countdown: 'days', createdAt: Date.now() - 400 * day });
      e.putEvent({ id: 'ev-goa', title: 'Goa trip', start: '2026-05-01', end: '2026-05-05', colour: 'teal', countdown: 'weeks', createdAt: Date.now() - 12 * day });
      var D = await import('/src/store/useDashboardStore.ts');
      var d = D.useDashboardStore.getState();
      d.addBlock('countdown', { eventId: 'ev-race', face: 'cover' }, 0);
      d.addBlock('countdown', { eventId: 'ev-bday', face: 'shape' }, 1);
      d.addBlock('countdown', { eventId: 'ev-goa', face: 'journey' }, 2);
      d.addBlock('countdown', { eventId: 'ev-race', face: 'flap' }, 3);
      return true;
    })()`); },
    opened: '[data-countdown-flap]',
  },
  /* 29-2d2 — the three things a Countdown counts to, each with what is due
     before it switched on: the marathon (its linked task first, then the rest,
     the invoices overdue), the bank account (what it waits on, the
     incorporation, first) and a date he named, one tall, which only counts. */
  {
    name: 'dashboard-countdown-due',
    path: '/dashboard',
    ready: 'text=Do this one thing',
    open: async (page) => { await page.evaluate(`(async function () {
      var E = await import('/src/store/useEventStore.ts');
      E.useEventStore.getState().addEvent({ title: 'Mumbai Marathon', start: '2026-03-20T06:00', end: '2026-03-20T10:00', location: 'Marine Drive' }, 'ev-race');
      var S = await import('/src/store/useStore.ts');
      var id = S.useStore.getState().addBacklogTask('Buy running shoes', 'action');
      S.useStore.getState().updateBacklogTask(id, { eventId: 'ev-race', deadline: '2026-03-20T06:00' });
      var D = await import('/src/store/useDashboardStore.ts');
      var d = D.useDashboardStore.getState();
      var a = d.addBlock('countdown', { eventId: 'ev-race', dueBefore: true }, 0); d.resizeBlock(a, 2, 3);
      var b = d.addBlock('countdown', { taskId: 't-bank', dueBefore: true }, 1); d.resizeBlock(b, 2, 2);
      var c = d.addBlock('countdown', { date: '2026-04-15', dateName: 'Exams', dateSince: Date.now() - 10 * 86400000, dueBefore: true }, 2);
      d.resizeBlock(c, 2, 1);
      return true;
    })()`); },
    opened: '[data-countdown-target="date"]',
  },
  /* 29-2d2 — a Countdown's ⚙ on a task: the three tabs, the task list
     with how far off each is, and the switch. */
  {
    name: 'dashboard-countdown-settings',
    path: '/dashboard',
    ready: 'text=Do this one thing',
    open: async (page, settle) => {
      await page.evaluate(`(async function () {
        var D = await import('/src/store/useDashboardStore.ts');
        D.useDashboardStore.getState().addBlock('countdown', { taskId: 't-bank', dueBefore: true });
        return true;
      })()`);
      await settle();
      await page.getByRole('button', { name: 'Edit', exact: true }).click();
      await settle();
      await page.getByRole('button', { name: 'Widget settings' }).last().click();
    },
    opened: 'text=Show what is due before it',
  },
  /* 29-2a — one event open: the live countdown over its fields. */
  {
    name: 'event-sheet',
    path: '/dashboard',
    ready: 'text=Do this one thing',
    open: async (page) => { await page.evaluate(`(async function () {
      var E = await import('/src/store/useEventStore.ts');
      E.useEventStore.getState().addEvent({ title: 'Mumbai Marathon', start: '2026-03-20T06:00', end: '2026-03-20T10:00', location: 'Marine Drive', notes: 'Bib 4127, gate C' }, 'ev-race');
      var S = await import('/src/store/useEventSheet.ts');
      S.useEventSheet.getState().openEvent('ev-race');
      return true;
    })()`); },
    opened: '[data-event-preview]',
  },
  { name: 'home', path: '/', ready: 'text=Your Projects' },
  {
    name: 'home-new-project',
    path: '/',
    ready: 'text=Your Projects',
    open: (page) => page.keyboard.press('p'),
    opened: 'text=New Project',
  },
  {
    name: 'home-smart-start',
    path: '/',
    ready: 'text=Your Projects',
    open: (page) => page.keyboard.press('s'),
    opened: 'text=Smart Start',
  },
  {
    // The queue itself, opened. Nothing else photographs it: the sheet lists
    // what the hours bought only once its head is pressed, and that list is
    // the thing the button is promising.
    name: 'home-smart-start-queue',
    path: '/',
    ready: 'text=Your Projects',
    open: async (page, settle) => {
      await page.keyboard.press('s');
      await settle();
      // The box opens at the hours left today since BIG-6 29-1b — 2.5 on the
      // fixture, one task. Two hours is the queue this shot has always shown.
      await page.getByRole('button', { name: '2h', exact: true }).click();
      await settle();
      await page.getByRole('button', { name: /tasks queued/ }).click();
    },
    // A queued row, not the head that opened it — "2h of work" is on screen
    // either way, so it would pass against a list that never expanded.
    opened: 'text=Countersign the studio lease',
  },
  {
    // An hour is not enough for either of the fixture's two blockers, so both
    // of the tasks waiting on them are withheld. The first is then overridden,
    // which puts the offered state and the taken state in the same picture —
    // along with the overrun the override causes.
    name: 'home-smart-start-held-back',
    path: '/',
    ready: 'text=Your Projects',
    open: async (page, settle) => {
      await page.keyboard.press('s');
      await settle();
      await page.getByRole('button', { name: '1h', exact: true }).click();
      await settle();
      await page.getByRole('button', { name: /held back/ }).click();
      // The list expands with a height animation; its rows are not clickable
      // until the clock has run far enough to finish it.
      await settle();
      await page.getByRole('button', { name: 'Schedule anyway' }).first().click();
    },
    opened: 'text=Scheduled',
  },
  {
    name: 'home-shortcuts',
    path: '/',
    ready: 'text=Your Projects',
    open: (page) => page.keyboard.press('?'),
    opened: 'text=Shortcuts',
  },
  /* BUILD-10's editor, caught mid-edit: New project's key field listening,
     and S refused because Smart Start holds it on Home. The one shot that
     shows the refusal line, which is the only thing in the editor that is
     not also on the list view. */
  {
    name: 'home-shortcuts-edit',
    path: '/',
    ready: 'text=Your Projects',
    open: async (page, settle) => {
      await page.keyboard.press('?');
      await settle();
      await page.getByRole('button', { name: 'Edit', exact: true }).click();
      await settle();
      await page.getByRole('textbox', { name: /^New project:/ }).click();
      await page.keyboard.press('s');
    },
    opened: 'text=S is already Smart Start on Home.',
  },
  /* BUILD-9's command palette: opened empty it is the command menu; typed
     into, it is tasks and lists with where they live, and the Ask Atlas row
     at the bottom. The field has the focus on open, so typing needs no click. */
  {
    name: 'home-palette',
    path: '/',
    ready: 'text=Your Projects',
    open: (page) => page.keyboard.press('Control+k'),
    opened: '[aria-label="Command palette"]',
  },
  {
    name: 'home-palette-search',
    path: '/',
    ready: 'text=Your Projects',
    open: async (page, settle) => {
      await page.keyboard.press('Control+k');
      await settle();
      await page.keyboard.type('re');
    },
    opened: 'text=Ask Atlas',
  },
  /* 29-1P8c — Home's shape. A project holding projects is a folder whose
     cover is theirs (153, his pick C); pressed, it unfolds them in a row
     under its own row, with the way into it last. Jump back in (154, his
     pick D) sits above the projects, and opens Ctrl+K before anything is
     typed. */
  {
    name: 'home-folder',
    path: '/',
    ready: 'text=Your Projects',
    open: (page) => page.evaluate(MAKE_A_FOLDER),
    opened: '[aria-label="Shreekant Empire: 4 projects inside"]',
  },
  {
    name: 'home-folder-open',
    path: '/',
    ready: 'text=Your Projects',
    open: async (page, settle) => {
      await page.evaluate(MAKE_A_FOLDER);
      await settle();
      await page.locator('[aria-label="Shreekant Empire: 4 projects inside"]').press('Enter');
    },
    opened: '[aria-label="Inside Shreekant Empire"]',
  },
  {
    name: 'home-jump-back',
    path: '/',
    ready: 'text=Your Projects',
    open: (page) => page.evaluate(SEED_JUMP_BACK),
    opened: '#jump-back-title',
  },
  {
    name: 'home-palette-jump-back',
    path: '/',
    ready: 'text=Your Projects',
    open: async (page, settle) => {
      await page.evaluate(SEED_JUMP_BACK);
      await settle();
      await page.keyboard.press('Control+k');
    },
    opened: '[aria-label="Command palette"] >> text=Jump back in',
  },

  // ── Project view ──
  { name: 'project', path: '/project/p-empire', ready: 'text=Operations' },
  /* BIG-5 — two boards: side by side on desktop, stacked on the upright
     tablet and the phone. Each pane's slim header is the thing to check. */
  {
    name: 'project-split',
    path: '/project/p-empire?beside=p-studio',
    ready: '[data-split-pane="1"]:has-text("The Space")',
  },
  /* The AI panel about a task on the left board stands in for the right one
     (his call) — the panel fixture opens on whichever board the URL names first. */
  {
    name: 'project-split-ai',
    path: '/project/p-empire?beside=p-studio&__dev-panel-fixture__=task',
    ready: '[data-ai-panel]:has-text("Two steps added")',
  },
  {
    name: 'project-quick-add',
    path: '/project/p-empire',
    ready: 'text=Operations',
    open: (page) => page.keyboard.press('n'),
    opened: '[placeholder^="Task title"]',
  },
  {
    name: 'project-new-list',
    path: '/project/p-empire',
    ready: 'text=Operations',
    open: (page) => page.keyboard.press('l'),
    opened: '[placeholder^="List name"]',
  },
  {
    /* A list's ⋯ menu. Always visible — a list header is chrome, not a card's
       overlay controls — and the panel is portalled, which is the whole reason
       UI-17 gave it `MorphMenu`'s `portal`: this card clips its own contents. */
    name: 'project-list-menu',
    path: '/project/p-empire',
    ready: 'text=Operations',
    open: (page) => page.locator('button[aria-label="Actions for Build"]').click(),
    opened: '[role="menu"][aria-hidden="false"]',
  },
  {
    /* A task row's ⋯ menu, armed on its destructive item — the one state a
       static shot can prove the in-place confirm from. The trigger is inside
       `.ag-card-actions`, hidden at rest on a pointer device; clicking it
       focuses it, which is one of the two cases `screens.css` reveals it for. */
    name: 'project-task-menu',
    path: '/project/p-empire',
    ready: 'text=Operations',
    open: async (page, settle) => {
      await page.locator('button[aria-label^="Actions for File the incorporation"]').click();
      await settle();
      await page.locator('[role="menu"][aria-hidden="false"] button:has-text("Delete task")').click();
    },
    opened: 'text=Delete File the incorporation paperwork?',
  },
  {
    /* BUILD-11 — the same menu armed on Archive, the one confirm strip in the
       app that is NOT rose: a neutral well, a solid glass button, "Cancel". */
    name: 'project-task-menu-archive',
    path: '/project/p-empire',
    ready: 'text=Operations',
    open: async (page, settle) => {
      await page.locator('button[aria-label^="Actions for File the incorporation"]').click();
      await settle();
      await page.locator('[role="menu"][aria-hidden="false"] button:has-text("Archive task")').click();
    },
    opened: 'text=Archive File the incorporation paperwork?',
  },
  {
    /* BUILD-2's whole design: Start now on a BLOCKED task offers what it
       waits on instead. `t-bank` waits on `t-incorporate`, so its menu should
       read "Blocked · start first" over "Start File the incorporation…". */
    name: 'project-task-menu-blocked',
    path: '/project/p-empire',
    ready: 'text=Operations',
    open: async (page, settle) => {
      await page.locator('button[aria-label^="Actions for Open the current account"]').click();
      await settle();
    },
    opened: '[role="menu"][aria-hidden="false"] >> text=Start File the incorporation paperwork',
  },
  {
    /*
     * The same tasks as a table — UI-29's second half of the toolbar's
     * `SegmentedControl`, and the app's first MODE switch. Nothing in the
     * board's shots renders `ListTable`, so without this the whole view is
     * unphotographed.
     */
    name: 'project-list-view',
    path: '/project/p-empire',
    ready: 'text=Operations',
    open: (page) => page.getByRole('tab', { name: 'List' }).click(),
    opened: '[role="tab"][aria-selected="true"]:has-text("List")',
  },
  /* 29-1P9a — idea 157, his pick A: a list folded into a thin spine, the
     lists beside it wider (a flat one-line bar where the board is one
     column), and idea 158, his pick E: the list view grouped by due date
     and by Score through the "Group:" button. */
  {
    name: 'project-folded',
    path: '/project/p-empire',
    ready: 'text=Operations',
    open: (page) => page.locator('button[aria-label="Fold Operations away"]').click(),
    opened: '.ag-spine',
  },
  {
    /*
     * 29-1P9b (ideas 155, 156): "40% done" pressed open — the fixture's two
     * milestones on their line (t-incorporate done-next, t-bank waiting on it)
     * and the chart, with p-empire's Finish by as the coral line.
     */
    name: 'project-forecast',
    path: '/project/p-empire',
    ready: 'text=Operations',
    open: (page) => page.locator('button[aria-expanded]', { hasText: '% done' }).first().click(),
    opened: '[data-forecast-panel="open"]',
  },
  {
    name: 'project-list-by-due',
    path: '/project/p-empire',
    ready: 'text=Operations',
    open: async (page, settle) => {
      await page.getByRole('tab', { name: 'List' }).click();
      await settle();
      await page.locator('button[aria-label^="Group tasks"]').click();
      await settle();
      await page.getByRole('menuitem', { name: 'By due date' }).click();
    },
    opened: 'button[aria-label="Group tasks: by due date"]',
  },
  {
    name: 'project-list-by-score',
    path: '/project/p-empire',
    ready: 'text=Operations',
    open: async (page, settle) => {
      await page.getByRole('tab', { name: 'List' }).click();
      await settle();
      await page.locator('button[aria-label^="Group tasks"]').click();
      await settle();
      await page.getByRole('menuitem', { name: 'By Score' }).click();
    },
    opened: 'button[aria-label="Group tasks: by Score"]',
  },
  {
    /*
     * "Show done" ON. The switch brings finished rows back and — this is the
     * part worth a picture — every list header's count, ₹ total and "min left"
     * recount to include them. `Money` goes 0/1 → 1/2.
     *
     * **It was `project-hide-done` until FIX-1**, which flipped the default to
     * off because a board opening full of finished work is what Shreekant asked
     * to stop. Hidden is what `project` photographs now, so the click has to go
     * the other way or this shot re-photographs its neighbour — and the old
     * `aria-checked="false"` wait failed outright on a switch that had just
     * gone true.
     */
    name: 'project-show-done',
    path: '/project/p-empire',
    ready: 'text=Operations',
    open: (page) => page.getByRole('switch').click(),
    opened: '[role="switch"][aria-checked="true"]',
  },
  {
    /*
     * The floating selection bar, with two rows picked. It is `inert` and at
     * `opacity: 0` until something is selected, so this is the only shot that
     * proves it arrives at all — and the only one that photographs a row in
     * its emerald `selected` state.
     */
    name: 'project-selection',
    path: '/project/p-empire',
    ready: 'text=Operations',
    open: async (page, settle) => {
      await page.getByRole('button', { name: 'Select', exact: true }).click();
      await settle();
      await page.locator('button[aria-label="Select Rewrite the landing page copy"]').click();
      await page.locator('button[aria-label="Select Open the current account"]').click();
      /* Where a click scrolls the board to depends on whether the project
         header had finished laying out when it landed: on a busy machine
         (several shots capturing at once, 2026-09-17) the desktop rows were
         still below the fold and the board scrolled 360px to reach them; idle,
         they were already on screen and nothing scrolled. Measured, not
         guessed — the scroller read 360 in every failing run and 0 in every
         passing one. So once everything has settled, go back to the top and
         scroll only as far as the finished layout needs. */
      await settle();
      await page.evaluate('document.querySelectorAll("*").forEach((el) => { if (el.scrollTop > 0) el.scrollTop = 0; })');
      await page.locator('button[aria-label="Deselect Open the current account"]').scrollIntoViewIfNeeded();
    },
    opened: 'text=2 selected',
  },
  {
    name: 'project-task-detail',
    path: '/project/p-empire',
    ready: 'text=Operations',
    open: (page) => page.getByText('Rewrite the landing page copy', { exact: true }).first().click(),
    opened: 'text=Depends on',
  },
  {
    /*
     * The sheet scrolled. `project-task-detail` photographs the top of all three
     * columns, which is the one place a pinned header and a pinned footer look
     * exactly like an unpinned pair — this is the shot that can catch either of
     * them coming loose, and the only one that shows the foot of the columns.
     * Same reason UI-9 added `scoring-scrolled`.
     */
    name: 'project-task-detail-scrolled',
    path: '/project/p-empire',
    ready: 'text=Operations',
    open: async (page, settle) => {
      await page.getByText('Rewrite the landing page copy', { exact: true }).first().click();
      await settle();
      // The sheet owns its own scroller — the page behind it does not move.
      await page.locator('.ag-task-sheet-body').evaluate((el) => { el.scrollTop = 640; });
    },
    opened: 'text=Depends on',
  },
  {
    // OPT-5 — the closed Optional section at the sheet's foot, opened: Start
    // date, Reminder, Status, Value and Share, side by side.
    name: 'project-task-detail-optional',
    path: '/project/p-empire',
    ready: 'text=Operations',
    open: async (page, settle) => {
      await page.getByText('Rewrite the landing page copy', { exact: true }).first().click();
      await settle();
      await page.getByRole('dialog').getByRole('button', { name: /^Optional/ }).click();
      await settle();
      await page.locator('.ag-task-sheet-body').evaluate((el) => { el.scrollTop = el.scrollHeight; });
    },
    opened: 'text=Keeps it out of sessions until then.',
  },
  {
    // 29-1P9c — the closed Story row under Optional, opened. The fixture has
    // no stored story (the harness never signs in), so what shows is what
    // the task itself says: when it was made and the day it was focused on.
    name: 'project-task-detail-story',
    path: '/project/p-empire',
    ready: 'text=Operations',
    open: async (page, settle) => {
      await page.getByText('Rewrite the landing page copy', { exact: true }).first().click();
      await settle();
      await page.getByRole('dialog').getByRole('button', { name: /^Story/ }).click();
      await settle();
      await page.locator('.ag-task-sheet-body').evaluate((el) => { el.scrollTop = el.scrollHeight; });
    },
    opened: 'text=Focused 1 h 30 m',
  },

  // ── Session flow ──
  { name: 'select', path: '/select', ready: 'text=New Session' },
  {
    name: 'select-new-task',
    path: '/select',
    ready: 'text=New Session',
    open: (page) => page.keyboard.press('n'),
    opened: '[placeholder^="What needs to be done"]',
  },
  /*
   * The other three panels UI-15 rebuilt. Each is behind a press, so none of
   * them had a baseline before — `select` and `select-new-task` between them
   * covered the screen at rest and one of its four forms.
   */
  {
    name: 'select-new-list',
    path: '/select',
    ready: 'text=New Session',
    open: (page) => page.keyboard.press('l'),
    opened: 'textarea[aria-label="New list name"]',
  },
  {
    /* Typed, not empty: an empty field photographs the same as a placeholder
       and proves nothing about the search actually filtering. */
    name: 'select-search',
    path: '/select',
    ready: 'text=New Session',
    open: async (page, settle) => {
      await page.locator('button[aria-label="Search tasks"]').click();
      await settle();
      /*
       * "account" and not, say, "lease", because the one task it matches is
       * already the FIRST row — so no surviving row has to travel, and the
       * shot does not depend on a `layout` animation finishing.
       *
       * It still depends on seven rows leaving, and that needs both kinds of
       * wait. Winding the clock runs their exit animations to the end (they
       * reach opacity 0), but the unmount that follows is a React state
       * update, and React 19 schedules those through a MessageChannel, which
       * a fake clock does not drive. Without the real wait the capture shows
       * one visible row inside a hole seven invisible ones are still holding
       * open. It winds nothing, so it cannot make two runs differ — every
       * animation still advances only by the fixed jumps around it.
       */
      await page.locator('input[aria-label="Search tasks and subtasks"]').fill('account');
      await settle();
      await page.waitForTimeout(500);
    },
    /* The count chip states how many tasks are AVAILABLE and no longer moves
       with the search (UI-31); the field's own readout is what proves the
       filter ran, so that is what this pins. */
    opened: 'text=1 match',
  },
  {
    name: 'select-filter',
    path: '/select',
    ready: 'text=New Session',
    /* The menu is placed from where its button is when the click lands. On a
       busy machine that was sometimes before the page's entry animation had
       finished, and the menu came out 17px low (2026-09-17). Settle first. */
    open: async (page, settle) => {
      await settle();
      await page.locator('button[aria-label="Filter by list"]').click();
    },
    opened: 'button[aria-pressed="true"]:has-text("All lists")',
  },
  {
    /* A row's ⋯ menu. The trigger is `.ag-card-actions`, hidden at rest on a
       pointer device — clicking it focuses it, which is one of the two cases
       `screens.css` reveals it for. */
    name: 'select-task-menu',
    path: '/select',
    ready: 'text=New Session',
    open: (page) => page.locator('button[aria-label^="Actions for"]').first().click(),
    opened: '[role="menu"][aria-hidden="false"]',
  },
  { name: 'deadlines', path: '/deadlines', ready: 'text=Set Deadlines' },
  {
    /* 29-1P10a, idea 97: a press on a task's time opens the minute ruler,
       saying when the whole run would end. The first task whose time is its
       own (a task with subtasks shows their sum, which has no ruler). */
    name: 'deadlines-ruler',
    path: '/deadlines',
    ready: 'text=Set Deadlines',
    open: async (page, settle) => {
      await page.locator('input[aria-label^="Minutes allocated to"]').first().click();
      await settle();
    },
    opened: 'text=The run ends at',
  },
  {
    /*
     * The PERT sheet, drawing a real distribution. UI-27 made it open already
     * populated — the three numbers are derived from what the task is
     * allocated now (50m: 0.6× → 30, 1× → 50, 1.8× → 90) — so the shot no
     * longer has to type three numbers to prove the calculator rather than an
     * empty form. It types ONE, to prove the drawing follows the fields:
     * 30 / 45 / 90 is (30 + 4×45 + 90) / 6 = 50 expected and (90 − 30) / 6 = 10
     * deviation. Both land on whole minutes on purpose — a rounded figure that
     * drifted would be indistinguishable from a rounding change.
     */
    name: 'deadlines-pert',
    path: '/deadlines',
    ready: 'text=Set Deadlines',
    open: async (page, settle) => {
      /*
       * A CSS selector, not `getByRole('button', { name: /with PERT/ })`.
       * dnd-kit gives every `SortableRow` wrapper `role="button"`, so a row
       * takes its accessible name from everything inside it — including this
       * button's label — and the row, being the outer element, is what a role
       * query matches first. Clicking it lands in the middle of the card and
       * opens nothing.
       */
      await page.locator('button[aria-label*="with PERT"]').first().click();
      await settle();
      await page.getByLabel('Minutes for the most likely estimate').fill('45');
    },
    /* Not `text=`: the button names the figure it will apply, so this pins the
       whole chain — the derived defaults, the edit, and the formula. */
    opened: 'button:not([disabled]):has-text("Allocate 50m")',
  },
  /* `Global work session` is the session strip's kicker and the one string on
     this screen that is neither a task title nor a control. UI-32 brought it
     back — UI-11's header had replaced it with a `Session left` countdown, and
     the strip is what the mockup puts there. */
  { name: 'focus', path: '/focus', ready: 'text=Global work session' },
  {
    /*
     * Tablet (portrait) stacks the panel under the stage (UI-32). Desktop is
     * landscape, so since FIX-10 it has no Details pill: both panes sit in a
     * column beside the stage, and at 1440x900 the details start FOLDED —
     * the two panes are 14px taller than the column. So on desktop this shot
     * is the fold opened by hand, which is the other half of that column.
     */
    name: 'focus-details',
    path: '/focus',
    ready: 'text=Global work session',
    open: async (page) => {
      const pill = page.getByRole('button', { name: /^Details/ });
      if (await pill.count()) await pill.click();
      else await page.getByRole('button', { name: /^Task details/ }).click();
    },
    opened: 'text=Task details',
  },
  {
    /* `steps done` is the panel's own progress readout, so it pins the
       reconciled panel rather than a subtask title that also appears in the
       queue behind it. */
    name: 'focus-subtasks',
    path: '/focus',
    ready: 'text=Global work session',
    /* No pill in landscape (FIX-10): the checklist is always showing, so on
       desktop there is nothing to open and the `opened` check is the proof. */
    open: async (page) => {
      const pill = page.getByRole('button', { name: /^Subtasks/ });
      if (await pill.count()) await pill.first().click();
    },
    opened: 'text=steps done',
  },
  {
    /*
     * The capture sheet, which had no baseline at all before UI-18 — it is
     * behind the corner button on this screen and on Set Deadlines, and
     * nothing had ever photographed it. Shot from Focus Mode rather than Set
     * Deadlines because this is the screen it exists to interrupt.
     *
     * `Dialog` mounts the sheet and flips `shown` a frame later, so the panel
     * has a state to transition FROM; without the settle the capture lands
     * mid-condense on a half-blurred sheet.
     */
    name: 'focus-capture',
    path: '/focus',
    ready: 'text=Global work session',
    open: async (page, settle) => {
      await page.locator('button[aria-label="Capture an idea or task"]').click();
      await settle();
    },
    opened: 'text=Capture Idea',
    /* At 390px the corner button sits under the floating nav bar, which takes
       the click (seen in `phone/focus`, 2026-09-23). Step 41's to fix. */
    phone: false,
  },
  {
    /*
     * The end of a session, which had no baseline before UI-11 because it is
     * only reachable by emptying the queue — three skips, one per task in the
     * fixture. `settle()` between them lets the card's exit animation finish;
     * `AnimatePresence mode="wait"` holds the next card back until it has.
     *
     * Skipping CLOSES nothing, so this is UI-32's second end state: the pane
     * with no report in it, no emission, and the old "Queue cleared" name.
     */
    name: 'focus-cleared',
    path: '/focus',
    ready: 'text=Global work session',
    open: async (page, settle) => {
      for (let i = 0; i < 3; i += 1) {
        await page.getByRole('button', { name: 'Skip this task' }).click();
        await settle();
      }
    },
    opened: 'text=Queue cleared',
  },
  {
    /*
     * The other end state, new at UI-32: the session REPORT, reached by
     * closing all three rather than skipping them. Every figure on it reads
     * `0m` and that is correct — the harness parks the clock and this session
     * was never started, so no time was spent. What the baseline is here for
     * is the pane's shape: the accent emission, the total, and one row per
     * closed task.
     */
    name: 'focus-report',
    path: '/focus',
    ready: 'text=Global work session',
    open: async (page, settle) => {
      for (let i = 0; i < 3; i += 1) {
        await page.getByRole('button', { name: 'Mark done' }).click();
        await settle();
      }
    },
    /* "Session done" since 29-1P11a (idea 105): the counts and Another 25 ·
       Done. No Break here: the fixture is not in pomodoro mode. */
    opened: 'text=Session done',
  },
  {
    /*
     * 29-1P11a, idea 104: a real break, taken from "Session done" in pomodoro
     * mode. The mode is set through the live module (it is read at load, so
     * localStorage alone would need a reload), the idea is pinned to the
     * seed's first, and the page clock is PAUSED at a moment the break's end
     * is measured from — its readout is a countdown, and the harness's clock
     * otherwise flows at wall speed between jumps, which would land it on a
     * different second each run.
     */
    name: 'focus-break',
    path: '/focus',
    ready: 'text=Global work session',
    open: async (page, settle) => {
      await page.evaluate(`(async () => {
        (await import('/src/lib/brownNoise.ts')).setNoisePrefs({ mode: 'pomodoro', breakMinutes: 5 });
      })()`);
      for (let i = 0; i < 3; i += 1) {
        await page.getByRole('button', { name: 'Mark done' }).click();
        await settle();
      }
      await page.getByRole('button', { name: /^Break/ }).click();
      await settle();
      const at = await page.evaluate(`(async () => {
        const { useFocusBreak } = await import('/src/store/useFocusBreak.ts');
        const at = Date.now() + 500;
        useFocusBreak.setState((s) => ({ breakOn: { ...s.breakOn, ideaId: 's1', endsAt: at + 300000 } }));
        return at;
      })()`);
      await page.clock.pauseAt(at as number);
    },
    opened: 'text=Look at something 6 metres away',
  },
  {
    /*
     * 29-1P10a, idea 96: the line written before the clock runs, and Mark
     * done asking about it — Not yet, Partly, Yes in place of the controls.
     */
    name: 'focus-done-question',
    path: '/focus',
    ready: 'text=Global work session',
    open: async (page, settle) => {
      await page.locator('input[placeholder="uploaded the signed forms"]').fill('sent the signed forms to the CA');
      await page.getByRole('button', { name: 'Mark done' }).click();
      await settle();
    },
    opened: 'text=Did you?',
  },
  {
    /* 29-1P10a, idea 97: + time opens the minute ruler. The clock is paused,
       so the line under the number is the time left, not a time of day. */
    name: 'focus-add-time',
    path: '/focus',
    ready: 'text=Global work session',
    open: async (page, settle) => {
      await page.locator('button[title="Add time to this task"]').click();
      await settle();
    },
    opened: '[role="slider"][aria-label="Minutes to add"]',
  },
  {
    /*
     * 29-1P10b, idea 102: the task's clock past zero is "in flow" — gold,
     * counting up, the stage glowing gold, Wrap up under the clock. A RUNNING
     * clock cannot be photographed here (the fake clock flows between the
     * harness's jumps, so it lands on a different second every run), so the
     * session is set straight into the run, paused 3:12 past the first task's
     * 90 minutes. The halfway note exists only while the clock runs, so it
     * has no shot of its own: `design-while-you-work` holds its look.
     */
    name: 'focus-flow',
    path: '/focus',
    ready: 'text=Global work session',
    open: (page) => page.evaluate(IN_FLOW),
    opened: 'button:has-text("Wrap up")',
  },
  {
    /*
     * OPT-7: the switches live in a drawer behind one corner button, closed
     * by default. Opened here, so the five are photographed, all pressed in.
     */
    name: 'focus-switches',
    path: '/focus',
    ready: 'text=Global work session',
    open: async (page, settle) => {
      await page.locator('button[aria-label="Show the screen switches"]').click();
      await settle();
    },
    opened: 'button[aria-label="Show the top banner"][aria-pressed="true"]',
  },
  {
    /*
     * Pure focus (2026-09-30, OPT-7): every switch off — no top banner, no
     * subtasks, no details, no session bar, no nav — and the drawer closed
     * again. The stage alone, and the one button that brings it all back.
     */
    name: 'focus-pure',
    path: '/focus',
    ready: 'text=Global work session',
    open: async (page, settle) => {
      await page.locator('button[aria-label="Show the screen switches"]').click();
      /* Soft toggles since 29-1P2: one name each, pressed in while showing. */
      for (const what of ['the top banner', 'subtasks', 'task details', 'the session bar', 'the nav bar']) {
        await page.locator(`button[aria-label="Show ${what}"][aria-pressed="true"]`).click();
      }
      await page.locator('button[aria-label="Hide the screen switches"]').click();
      await settle();
    },
    opened: 'button[aria-label="Show the screen switches"][aria-expanded="false"]',
  },
  {
    /*
     * FIX-10's corner picker for the mini timer, which exists only while a
     * session runs on a screen that is NOT Focus. So: start the session, leave
     * by the back arrow (the run keeps going — BUILD-1), and press Move. The
     * fake clock is parked, so the pill's countdown reads the full allocation.
     * The four targets are where the pill would land; bottom-left, the default
     * on desktop, is the one marked "here now". On the tablet the default is
     * the centred lane, so no target is marked there.
     */
    name: 'focus-pill-corners',
    path: '/focus',
    ready: 'text=Global work session',
    open: async (page, settle) => {
      /* 29-1P10a: a session's first press is Start, and it breathes for five
         seconds before the clock runs; Skip starts it at once. The fake
         clock's jumps can carry it past the breath on their own, so Skip is
         pressed only while it is there, and Pause is the proof either way. */
      await page.getByRole('button', { name: 'Start', exact: true }).click();
      const skip = page.getByRole('button', { name: 'Skip', exact: true });
      const pause = page.getByRole('button', { name: 'Pause', exact: true });
      await skip.or(pause).first().waitFor();
      if (await skip.count()) await skip.click();
      await pause.waitFor();
      await settle();
      await page.getByRole('button', { name: 'Back to set deadlines' }).click();
      await settle();
      await page.getByRole('button', { name: 'Move the timer to another corner' }).click();
      await settle();
    },
    opened: 'text=Top left',
  },
  {
    /*
     * 29-1P11b, idea 16: the same pill, tapped, grown into its panel — Pause,
     * + time, Mark done and the task up next, with Focus a tap further on.
     * Reached exactly as the corners above; on the tablet it grows out of the
     * centred lane.
     */
    name: 'focus-pill-open',
    path: '/focus',
    ready: 'text=Global work session',
    open: async (page, settle) => {
      await page.getByRole('button', { name: 'Start', exact: true }).click();
      const skip = page.getByRole('button', { name: 'Skip', exact: true });
      const pause = page.getByRole('button', { name: 'Pause', exact: true });
      await skip.or(pause).first().waitFor();
      if (await skip.count()) await skip.click();
      await pause.waitFor();
      await settle();
      await page.getByRole('button', { name: 'Back to set deadlines' }).click();
      await settle();
      await page.getByRole('button', { name: /^Timer controls for/ }).click();
      await settle();
    },
    opened: 'button[aria-label="Shrink the timer back"][aria-expanded="true"]',
  },

  // ── Needs Attention ──
  { name: 'scoring', path: '/scoring', ready: 'text=Quarterly compliance review', maxCells: SCORING_CLUSTERED_CELLS },
  {
    // The "Advanced" card is the one field group that starts collapsed.
    name: 'scoring-advanced',
    path: '/scoring',
    ready: 'text=Quarterly compliance review',
    maxCells: SCORING_CLUSTERED_CELLS,
    open: (page) => page.getByRole('button', { name: /Advanced/ }).click(),
    opened: 'text=Every 2 weeks',
  },
  {
    // The fixture's first attention task carries a custom repeat rule, so its
    // Repeat field renders as a button that reopens the modal in one click.
    // This is the baseline Session 1's centring fix has to be judged against.
    name: 'scoring-recurrence',
    path: '/scoring',
    ready: 'text=Quarterly compliance review',
    maxCells: SCORING_CLUSTERED_CELLS,
    open: async (page, settle) => {
      await page.getByRole('button', { name: /Advanced/ }).click();
      // The card expands with a height animation; its contents are not
      // clickable until the clock has run far enough to finish it.
      await settle();
      /*
       * `:not([aria-expanded])` is load-bearing as of UI-30. That session gave
       * every Section header a hint line stating what is inside it, so the
       * Advanced header now READS "Every 2 weeks on Mon, Thu, 8x" (plus
       * "· 1 hour before" until OPT-5) as part of its own accessible name — and a bare
       * `getByRole('button', { name: /Every 2 weeks/ })` matched both it and
       * the Repeat control it describes. Only the section headers carry
       * `aria-expanded`, so excluding them leaves exactly the field.
       */
      await page.locator('button:not([aria-expanded])').filter({ hasText: /Every 2 weeks/ }).click();
    },
    opened: 'text=Custom recurrence',
  },
  {
    /*
     * An OPEN `CustomDropdown`, which nothing had ever photographed — the six
     * task editors show it shut, and shut it is just a pill. The panel is the
     * half UI-18 rebuilt, so this is the baseline that would catch it
     * regressing.
     *
     * The reminder one, because its ten options are the longest list any of
     * them offers and therefore the one that exercises the scroller and the
     * viewport clamp. `aria-label="Reminder"` is the trigger's own name —
     * UI-18 gave every picker one, precisely because a screen showing five of
     * them could otherwise only be reached by index.
     */
    name: 'scoring-reminder',
    path: '/scoring',
    ready: 'text=Quarterly compliance review',
    maxCells: SCORING_CLUSTERED_CELLS,
    open: async (page, settle) => {
      // Reminder moved from Advanced to the last section, Optional, at OPT-5.
      await page.getByRole('button', { name: /^Optional/ }).click();
      await settle();
      await page.locator('button[aria-label="Reminder"]').click();
      await settle();
    },
    /* The fixture's first attention task carries `reminderMinutes: 60`, so the
       ticked row is "1 hour before" — waiting on `aria-pressed="true"` is what
       proves the panel opened AND that it knows which option is current. */
    opened: 'button[aria-pressed="true"]:has-text("1 hour before")',
  },
  {
    /*
     * The page scrolled, which is the one thing about this screen a shot of
     * the top cannot prove. UI-9 made the header a sticky pane of glass with
     * the field cards passing BEHIND it, and that depends entirely on its
     * `zIndex` — every Card has a `backdrop-filter`, so every Card is a
     * stacking context, and stacking contexts without a z-index paint in DOM
     * order. Lose that one line and the header, being the first child, is
     * painted over by every card that scrolls up to meet it. That is the same
     * regression UI-7 hit on the Notifications page and it is invisible until
     * something scrolls.
     *
     * `scrollIntoViewIfNeeded` rather than a wheel gesture: it moves the
     * nearest scrollable ancestor in one jump, where Chromium animates a wheel
     * scroll and would land on a different frame each run.
     */
    name: 'scoring-scrolled',
    path: '/scoring',
    ready: 'text=Quarterly compliance review',
    maxCells: SCORING_CLUSTERED_CELLS,
    open: (page) => page.getByRole('button', { name: /Subtasks/ }).scrollIntoViewIfNeeded(),
  },
  {
    /*
     * The end-of-session screen, which had no baseline at all before UI-9 —
     * it is only reachable by exhausting the queue or pressing End session,
     * so nothing had ever photographed it.
     *
     * Scoring one task first is not decoration: it is what makes the
     * number read `1/7` rather than `0/7` (a ring until 29-1P14d2),
     * and it drives a real save through `useTaskDraft.commit` on the way,
     * which is the only place in the shot set that happens.
     */
    name: 'scoring-done',
    path: '/scoring',
    ready: 'text=Quarterly compliance review',
    maxCells: SCORING_CLUSTERED_CELLS,
    open: async (page, settle) => {
      await page.getByRole('button', { name: /Critical/ }).click();
      await settle();
      /* Sentence case since UI-30 — the commit bar took the source's
         "Save & next", which is also the interface voice `readme.md` asks for. */
      await page.getByRole('button', { name: /Save & next/ }).click();
      await settle();
      await page.getByRole('button', { name: 'End session' }).click();
    },
    opened: 'text=Session complete',
  },

  /*
   * ── The rest of the nav ──
   *
   * DESIGN-2 rebuilt this screen, so all three of its captures moved and two
   * arrived. They wait on `Firing today`, which is the screen's own heading
   * now; they waited on `Default lead time`, which that item deleted — the
   * lead-time menu is gone as a concept, not moved.
   *
   * **The seeded dataset has nothing firing today and that is not a gap in
   * it.** `FROZEN_NOW` is 2026-03-12T09:30 and the nearest deadlines are the
   * 13th and the 14th, so the plain capture below is the screen's *empty*
   * state — which is real, is what most days look like, and is worth a
   * baseline of its own. The timeline itself comes from
   * `src/lib/devNotificationsFixture.ts`, which hands this page four tasks and
   * reaches nothing else in the app; dating a shared-fixture task would have
   * moved `/scoring`, `/home` and Smart Start with it.
   */
  { name: 'notifications', path: '/notifications', ready: 'text=Firing today' },
  {
    /*
     * The point of the item: four alerts on one day, the arithmetic under each
     * one, the Now line between what has gone and what has not, and all three
     * states — one missed at 08:00, the next at 10:15 carrying the only accent
     * on the screen, two queued behind it.
     */
    name: 'notifications-today',
    path: '/notifications?__dev-notifications-fixture__=today',
    ready: 'text=Draft the incorporation filing',
  },
  {
    /*
     * A row's ⋯ menu, open. It replaces `notifications-reminder-default` and
     * guards the same thing that shot existed for: a MorphMenu panel hanging
     * outside its own row and over the rows below it. Every glass surface has
     * a `backdrop-filter`, so every one is a stacking context, and a
     * stacking-order regression does not look broken — it simply hides the
     * panel behind the next pane.
     */
    name: 'notifications-row-menu',
    path: '/notifications?__dev-notifications-fixture__=today',
    ready: 'text=Draft the incorporation filing',
    open: (page) => page.getByRole('button', { name: /^Options for / }).first().click(),
    opened: 'text=Do not fire today',
  },
  {
    /*
     * Notifications refused in the browser — the card written for Brave, which
     * is what his tablet runs. It cannot be reached any other way: a
     * permission is the browser's to give, the harness starts Chromium without
     * one, and a denial cannot be un-denied from code.
     */
    name: 'notifications-blocked',
    path: '/notifications?__dev-notifications-fixture__=blocked',
    ready: 'text=Notifications are switched off in Brave',
  },
  {
    /*
     * BUILD-5: what the sender actually did, read from its log. Six rows: the
     * pitch missed and naming the summary it was counted in, the invoice sent,
     * the CA snoozed with its last-call time, then the three still to come.
     * The log and the two extra tasks come from the same fixture module, under
     * `delivered`, so `today` and `blocked` keep the rows they were taken with.
     */
    name: 'notifications-delivered',
    path: '/notifications?__dev-notifications-fixture__=delivered',
    ready: 'text=Back at',
  },
  /*
   * ── TAPPING A NOTIFICATION (BUILD-5) ──
   *
   * `/start/:taskId` starts the task and replaces itself with /focus, so the
   * plain path has nothing to photograph. These are the two cases where it has
   * to stop and ask, both BUILD-2's rules: a task waiting on another (the
   * seeded bank account waits on the incorporation), and a start that would
   * clear the seeded focus queue.
   */
  {
    name: 'start-blocked',
    path: '/start/t-bank',
    ready: 'text=Start first',
  },
  {
    name: 'start-confirm',
    path: '/start/t-incorporate',
    ready: 'text=Replace today’s queue?',
  },
  {
    // The quick-reminder sheet. Nothing else photographs it.
    name: 'notifications-quick-reminder',
    path: '/notifications',
    ready: 'text=Firing today',
    open: (page) => page.getByRole('button', { name: 'New reminder' }).click(),
    opened: 'text=Not tied to a task',
  },
  // The Google consent screen redirects here with a `code`. Opened cold like
  // this there is no code to exchange, so what gets photographed is the failure
  // card — which is the state worth guarding, since the success path only ever
  // flashes a spinner before navigating away.
  {
    name: 'oauth-callback',
    path: '/oauth/callback',
    ready: 'text=Google Calendar was not connected',
  },
  /*
   * ITEM 9A — the placeholder behind the destinations `navModel` lists but no
   * session has built yet. One shot covers them all: they are the same
   * component and differ only in the icon and the two lines of copy the nav
   * entry supplies.
   *
   * It photographed `/atlas-host` until item 9B built that screen, then
   * `/skills` until item 12 built that one, then `/log` until item 13 built
   * that one, and moves again rather than being deleted — three destinations
   * still land here. The next session to build one moves it again; the last
   * one to do so deletes both this shot and `ComingSoon`. `/inbox` is item
   * 23's, which is the next one to go.
   */
  {
    name: 'coming-soon',
    path: '/inbox',
    ready: 'text=Not built yet',
  },
  /*
   * ── The Atlas host (item 9B) ──
   *
   * Three states, because they are the three this screen exists to tell apart,
   * and none of them can be reached without a laptop on a tailnet the harness
   * blocks. `src/lib/devHostFixture.ts` hands the store a landed probe;
   * `__dev-model-fixture__` rides along because the model residency panel lists
   * what Atlas says is installed, which is the second blocked fetch.
   *
   * The plain "asleep" state needs no fixture — the pinned `atlas.invalid`
   * host produces it on any machine — but it is taken through the fixture
   * anyway so that all three baselines are pinned to the same literal rather
   * than one of them depending on how a failed fetch happened to time out.
   */
  {
    name: 'atlas-host',
    path: '/atlas-host?__dev-host-fixture__=awake&__dev-model-fixture__=1',
    ready: 'h1:has-text("Atlas host")',
  },
  {
    /* Awake, and its MCP server did not start. The one state where the screen
       has something to say that nothing else in the app can: the reason. */
    name: 'atlas-host-no-tools',
    path: '/atlas-host?__dev-host-fixture__=no-tools&__dev-model-fixture__=1',
    ready: 'h1:has-text("Atlas host")',
  },
  {
    name: 'atlas-host-asleep',
    path: '/atlas-host?__dev-host-fixture__=asleep',
    ready: 'h1:has-text("Atlas host")',
  },
  {
    /* One model's readings open. The expander is a 0fr → 1fr grid morph, so a
       regression in it collapses this shot back onto the closed one.
     *
     * THE `scrollTo` IS LOAD-BEARING, AND WITHOUT IT THIS SHOT NEVER PASSES.
     * Playwright scrolls a target into view before clicking it, and how far it
     * scrolls here depends on sub-pixel layout — so the capture landed at a
     * different offset on almost every run and the whole page read as moved.
     * Measured while item 9C was banking its own baselines: **43,402 cells on
     * desktop and 32,553 on tablet against `HEAD` with no changes at all**, and
     * then 35,729 more on the very next run against a baseline taken one run
     * earlier. It is not drift and it was never 9C's; it is this `open` step.
     * The committed baseline had been captured mid-scroll and could not be
     * reproduced by anything.
     *
     * Pinning the scroller to the top after the click makes the offset a
     * constant. `/atlas-host` scrolls on its own `.ag-page` rather than on the
     * window — every screen in this app is an `h-screen overflow-y-auto` — so
     * `window.scrollTo` alone does nothing; both are done because the next
     * screen to need this may differ. The readings row is ~700px down at offset
     * zero in both viewports, so `opened` still resolves visible. */
    name: 'atlas-host-readings',
    path: '/atlas-host?__dev-host-fixture__=awake&__dev-model-fixture__=1',
    ready: 'h1:has-text("Atlas host")',
    open: async (page) => {
      await page.getByRole('button', { name: 'Readings' }).first().click();
      await page.evaluate(() => {
        document.querySelectorAll('.ag-page').forEach((el) => el.scrollTo(0, 0));
        window.scrollTo(0, 0);
      });
    },
    opened: 'text=on charger',
  },
  {
    /* The "What leaves the laptop" panel, which sits below every other
       capture of this screen. It held BUILD-12's Downshift switch until
       OPT-4 removed it with the AI spending. Scrolled to a computed offset
       rather than by a click, for the readings shot's reason above. */
    name: 'atlas-host-offsite',
    path: '/atlas-host?__dev-host-fixture__=awake&__dev-model-fixture__=1',
    ready: 'h1:has-text("Atlas host")',
    open: async (page) => {
      await page.evaluate(async () => {
        /* Measured after Inter has arrived, and with `offsetTop`, which is
           layout and ignores transforms: the panels enter on a condense
           animation, and a `getBoundingClientRect` taken mid-flight landed
           a few pixels apart run to run (8,847 cells). */
        await document.fonts.ready;
        const title = [...document.querySelectorAll('h2')].find((h) => h.textContent === 'What leaves the laptop');
        if (!title) return;
        /* The heading's own scrolling ancestor: the page has more than one
           `.ag-page`, and the first is not the one that scrolls. */
        let scroller = title.parentElement;
        while (scroller && !(scroller.scrollHeight > scroller.clientHeight && getComputedStyle(scroller).overflowY !== 'visible')) {
          scroller = scroller.parentElement;
        }
        if (!scroller) return;
        let top = 0;
        for (let el: HTMLElement | null = title; el !== null && el !== document.body; el = el.offsetParent as HTMLElement | null) {
          top += el.offsetTop;
        }
        scroller.scrollTo(0, Math.max(0, top - 120));
      });
    },
    opened: 'text=Hand-off prompt',
  },
  /*
   * ── The design system (29-1P1, BIG-15) ──
   *
   * `/design`, the hidden page showing every colour and button live. Two
   * shots: the colours at the top, and the thirteen buttons further down.
   * Every 29-1P session adds its pieces to the page, so these two move with
   * each of them and are re-banked there on purpose.
   */
  { name: 'design', path: '/design', ready: 'text=One colour, one job' },
  {
    name: 'design-buttons',
    path: '/design',
    ready: 'text=One colour, one job',
    open: (page) =>
      page.locator('h2', { hasText: /^Buttons$/ }).evaluate((el) => {
        el.scrollIntoView({ block: 'start' });
      }),
    opened: 'text=Hold to empty Trash',
  },
  /* 29-1P12: the Dashboard's pieces — the glass that fills, the dot-matrix
     week, rolling numbers, the four block looks, the corner glyph and the
     quiet blocks. The fixture seeds no block looks, so this is the one
     baseline that holds the lamp and the tints. */
  {
    name: 'design-dashboard',
    path: '/design',
    ready: 'text=One colour, one job',
    open: (page) =>
      page.locator('h2', { hasText: /^Dashboard$/ }).evaluate((el) => {
        el.scrollIntoView({ block: 'start' });
      }),
    opened: 'text=A glass that fills',
  },
  /* 29-1P6b: hold and flick at rest — the swipe row, the row to hold, the
     toast and the notice to throw. The gestures themselves are invisible to
     shots; this guards the pieces' looks. */
  {
    name: 'design-hold-flick',
    path: '/design',
    ready: 'text=One colour, one job',
    open: (page) =>
      page.locator('h2', { hasText: /^Hold and flick$/ }).evaluate((el) => {
        el.scrollIntoView({ block: 'start' });
      }),
    opened: 'text=Flick me sideways',
  },
  /* 29-1P8a: covers made for you. The fixture's projects all wear the
     default (a pattern from their ids, on `home`), so this is the one
     baseline that holds the other five styles. */
  {
    name: 'design-covers',
    path: '/design',
    ready: 'text=One colour, one job',
    open: (page) =>
      page.locator('h2', { hasText: /^Covers$/ }).evaluate((el) => {
        el.scrollIntoView({ block: 'start' });
      }),
    opened: 'text=Aurora',
  },
  /* 29-1P9a: the spine and the regrouped table, on pretend lists. */
  {
    name: 'design-fold-regroup',
    path: '/design',
    ready: 'text=One colour, one job',
    open: (page) =>
      page.locator('h2', { hasText: /^Fold and regroup$/ }).evaluate((el) => {
        el.scrollIntoView({ block: 'start' });
      }),
    opened: 'text=Ideas parking',
  },
  {
    name: 'design-project-header',
    path: '/design',
    ready: 'text=One colour, one job',
    open: (page) =>
      page.locator('h2', { hasText: /^Milestones and when it'll be done$/ }).evaluate((el) => {
        el.scrollIntoView({ block: 'start' });
      }),
    opened: '[data-forecast-chart]',
  },
  {
    // 29-1P9c — the task's story, every kind of moment, opened and shown in
    // full, with the steps' white "40%" above it. A pretend task.
    name: 'design-task-story',
    path: '/design',
    ready: 'text=One colour, one job',
    open: async (page, settle) => {
      await page.locator('h2', { hasText: /^The task's story$/ }).evaluate((el) => el.scrollIntoView({ block: 'start' }));
      await page.getByRole('button', { name: /^Story\s*14 moments/ }).click();
      await settle();
      await page.getByRole('button', { name: 'Show all 14' }).click();
      await settle();
    },
    opened: 'text=Made in Build',
  },
  /* 29-1P10b — a clock in flow with Wrap up, the halfway note and the away
     card, on a pretend task. The only baseline of the last two. */
  {
    name: 'design-while-you-work',
    path: '/design',
    ready: 'text=One colour, one job',
    open: (page) =>
      page.locator('h2', { hasText: /^While you work$/ }).evaluate((el) => {
        el.scrollIntoView({ block: 'start' });
      }),
    opened: 'text=Halfway. Still on',
  },
  /* 29-1P10c — the StandBy clock by day and by night, on a pretend task.
     The real layer needs a running clock on a touch tablet held sideways
     and a minute untouched, none of which the harness can hold still, so
     this is its only baseline. */
  {
    name: 'design-standby',
    path: '/design',
    ready: 'text=One colour, one job',
    open: (page) =>
      page.locator('h2', { hasText: /^StandBy$/ }).evaluate((el) => {
        el.scrollIntoView({ block: 'start' });
      }),
    opened: 'text=Night, 9pm to 5am',
  },
  /* 29-1P15b — Atlas at rest: the horizon, the ask box glowing with a draft
     in it, and "Remembered" under a reply. The only baseline of the glow
     (it needs text and the caret) and of the chip (no fixture turn saves a
     note). */
  {
    name: 'design-atlas-at-rest',
    path: '/design',
    ready: 'text=One colour, one job',
    open: async (page, settle) => {
      await page.locator('h2', { hasText: /^Atlas at rest$/ }).evaluate((el) => {
        el.scrollIntoView({ block: 'start' });
      });
      await page.getByLabel('Ask Atlas anything').click();
      await page.keyboard.type('Plan my afternoon');
      await settle();
    },
    opened: 'text=Remembered',
  },
  { name: 'settings', path: '/settings', ready: 'text=Settings' },
  /*
   * ── ITEM 13G, SECOND PASS: THE KEYS ARE ON THIS SCREEN NOW ──
   *
   * This replaces `chat-keys`, which opened the same rows as a dialog from
   * `/chat`'s instrument bar. That bar is gone and so is the dialog —
   * Shreekant moved the keys to Settings, under SimpleURL — so the shot moved
   * with them rather than being deleted: the rows, the selected state and the
   * add-key form are the same thing worth a baseline wherever they live.
   *
   * It scrolls, because the card is the second on the tab and starts below the
   * fold at both viewports. `scrollIntoView` on the heading rather than a
   * pixel offset, so the shot does not need re-measuring when the SimpleURL
   * card above it grows a row.
   */
  {
    name: 'settings-keys',
    path: '/settings',
    /* BIG-1 renamed the card: one card, three tabs (Gemini, Claude, ChatGPT).
       The shot stays on the Gemini tab, which is the one with the proxy row. */
    ready: 'h2:has-text("AI keys")',
    open: (page) =>
      page.locator('h2', { hasText: 'AI keys' }).evaluate((el) => {
        el.scrollIntoView({ block: 'start' });
      }),
    opened: 'text=Server proxy',
  },
  /*
   * Settings' sections are TABS as of the Aurora Glass rebuild, not panels
   * stacked down one scroll, so this one opens by clicking the tab rather than
   * by scrolling a heading into view. That also retires the old
   * scroll-to-heading helper and the fight it had with Playwright's
   * `scrollIntoViewIfNeeded`, which judged a half-visible panel close enough
   * and photographed it cut off.
   *
   * There were three tabs and a `settings-trash` shot until item 9C moved
   * Trash to `/trash`; the four shots below replace it, and cover more than it
   * did — it only ever photographed the list.
   */
  /*
   * OPT-8 — Settings → Atlas: the two model defaults and the voice, moved off
   * the chat. The model fixture rides on the URL because both lists are
   * fetched (`src/lib/devModelFixture.ts`, item 6: Google's endpoint and
   * Ollama's tags, neither of which survives the network rule);
   * `settings-atlas-models` opens the local picker over it, which is what
   * `chat-models` photographed at the foot of the chat list before. Opened by
   * the trigger's `title`, since its text is whichever model is the default.
   */
  {
    name: 'settings-atlas',
    path: '/settings?__dev-model-fixture__=1',
    ready: 'text=Settings',
    open: (page) => page.getByRole('tab', { name: 'Atlas' }).click(),
    opened: 'text=Default cloud model',
  },
  {
    name: 'settings-atlas-models',
    path: '/settings?__dev-model-fixture__=1',
    ready: 'text=Settings',
    open: async (page, settle) => {
      await page.getByRole('tab', { name: 'Atlas' }).click();
      await settle();
      await page.getByTitle('Choose the default local model').click();
    },
    opened: 'text=Running on your laptop, free',
  },
  {
    name: 'settings-storage',
    path: '/settings',
    ready: 'text=Settings',
    open: (page) => page.getByRole('tab', { name: 'Storage' }).click(),
    opened: 'text=Remembered timings',
  },
  /*
   * ── The App tab (APP-3) ──
   *
   * The fourth tab: which version of BASE is running, whether it works
   * offline, and whether notifications reach this device.
   *
   * What it photographs here is the **nothing-installed** state, and that is
   * the honest one for this harness rather than a limitation of it. The run
   * drives a Vite dev server with no service worker registered (registration
   * is production-only — see `src/main.tsx`), so the version reads as a dash
   * and both rows read as not-yet. That is exactly what a browser tab with no
   * cached copy shows, which is what every one of these captures is.
   *
   * It is still worth a baseline: the headline figure, the two-row Well and
   * the button row are the layout, and none of them depends on which of the
   * states is showing. A fixture that faked a registered worker would be
   * faking the one thing the item is about, and the real thing is proved in a
   * real browser instead — an installed worker cannot be photographed from a
   * dev server at all.
   */
  {
    name: 'settings-app',
    path: '/settings',
    ready: 'text=Settings',
    open: (page) => page.getByRole('tab', { name: 'App' }).click(),
    opened: 'text=Works offline',
  },
  {
    /* 29-1P11a, idea 104: his break ideas, from the Focus / break cycle's
       card (pomodoro mode, set through the live module as `focus-break`). */
    name: 'settings-break-ideas',
    path: '/settings',
    ready: 'text=Settings',
    open: async (page, settle) => {
      await page.evaluate(`(async () => {
        (await import('/src/lib/brownNoise.ts')).setNoisePrefs({ mode: 'pomodoro' });
      })()`);
      await page.getByRole('tab', { name: 'Brown noise' }).click();
      await settle();
      await page.getByRole('button', { name: 'Edit ideas' }).click();
    },
    opened: 'text=small things a break can offer',
  },
  /*
   * ── The Trash (item 9C) ──
   *
   * Four states, and the fixture reaches all four without help: `fixture.ts`
   * writes three entries — a task 2 days in, a list 7, a project 22 — which is
   * one row inside the amber week and two outside it, all three kinds at once,
   * and a real `ancestors` chain on two of them.
   *
   * The expander is the one worth guarding hardest. It is a 0fr → 1fr grid
   * morph like `/atlas-host`'s readings, AND its contents come from a live
   * `planRestore` against the store — so a regression in either the morph or
   * the plan collapses this shot back onto the closed row.
   */
  { name: 'trash', path: '/trash', ready: 'h1:has-text("Trash")' },
  {
    /* One row open. `tr-3` is the project entry, which is the interesting one:
       it carries two lists and three tasks, so "what comes back" has something
       to say beyond the title. */
    name: 'trash-expanded',
    path: '/trash',
    ready: 'h1:has-text("Trash")',
    open: (page) => page.getByRole('button', { name: 'What comes back with Consulting side line' }).click(),
    /* Every collapsed row holds this text too, so it only works because the
       harness waits for `state: 'visible'` and a 0fr row has no box. */
    opened: 'text=back exactly as they were',
  },
  {
    /* Filtered down to one kind plus a search term — the row of chips in its
       pressed state, which is the only place `--glass-fill-solid` appears on
       this screen. */
    name: 'trash-filtered',
    path: '/trash',
    ready: 'h1:has-text("Trash")',
    open: (page) => page.getByRole('button', { name: /^Lists/ }).click(),
    /* Not the row that survives the filter — it was on screen before the
       click too, so it would prove nothing. The chip's own pressed state is
       the thing that changed. */
    opened: 'button[aria-pressed="true"]',
  },
  {
    /* Empty. Not a second fixture — the search box is the cheapest way to a
       genuinely empty list, and it photographs the "nothing matches" state,
       which is the one a person actually hits. The all-empty state has no
       fixture and is covered by `trashModel.test.ts` instead. */
    name: 'trash-no-match',
    path: '/trash',
    ready: 'h1:has-text("Trash")',
    open: (page) => page.getByLabel('Search the trash').fill('nothing here'),
    opened: 'text=Nothing in the trash matches',
  },
  /*
   * ── The Archive (BUILD-11) ──
   *
   * `fixture.ts` seeds four entries across two quarters — two projects (one
   * finished, one abandoned half way) and two loose tasks — so "by when" draws
   * two shelves and "by project" three.
   */
  { name: 'archive', path: '/archive', ready: 'h1:has-text("Archive")' },
  {
    name: 'archive-by-project',
    path: '/archive',
    ready: 'h1:has-text("Archive")',
    open: (page) => page.getByRole('tab', { name: 'By project' }).click(),
    opened: 'text=Archived projects',
  },
  {
    name: 'archive-no-match',
    path: '/archive',
    ready: 'h1:has-text("Archive")',
    open: (page) => page.getByLabel('Search the archive').fill('nothing here'),
    opened: 'text=Nothing on the shelf matches',
  },
  {
    /* The empty shelf, reached the way the design says to reach it: put
       everything back. That also drives Put back four times through the real
       restore, and leaves its toast up for the last one. Each tile is named
       by its entry id: a tile lifting off keeps its button until the exit
       finishes, so "the first Put back" can be one already on its way out. */
    name: 'archive-empty',
    path: '/archive',
    ready: 'h1:has-text("Archive")',
    open: async (page, settle) => {
      for (const id of ['ar-1', 'ar-2', 'ar-3', 'ar-4']) {
        await page.locator(`[data-archive-entry="${id}"] button:has-text("Put back")`).click();
        await settle();
      }
    },
    opened: 'text=The shelf is empty.',
  },
  /*
   * BUILD-6 — the admin screen. Every fact on it is behind a route or a rule
   * the harness cannot reach, so `devAdminFixture` hands it five invented
   * accounts. The harness's stand-in user is drawn as the admin (see
   * `accountAccess.ts`). The list guards the frost "My key" state against the
   * plain one; the open account guards the read-only marker and the flat board.
   */
  { name: 'admin', path: '/admin?__dev-admin-fixture__=list', ready: 'h1:has-text("Admin")' },
  {
    name: 'admin-account',
    path: '/admin?__dev-admin-fixture__=open',
    ready: 'text=Read-only',
    opened: 'text=Their board',
  },
  { name: 'chat', path: '/chat', ready: 'h1:has-text("Atlas")' },
  /*
   * The composer with something in it. A conversation cannot be photographed —
   * every turn needs a live Gemini call and the harness aborts everything off
   * localhost — but the composer can, and it is the one part of this screen
   * that MOVES: it measures its own `scrollHeight` after each keystroke and
   * grows to fit, up to a few lines. This shot is two lines' worth, so a
   * regression that broke the growth (or the ref it is measured through) would
   * show up as a one-line box.
   */
  /*
   * ── The transcript ──
   *
   * The part of this screen UI-33 rebuilt, and the part no ordinary shot can
   * reach: a turn needs a live Gemini call and the harness aborts everything
   * off localhost. `src/lib/devChatFixture.ts` is what closes that — a literal
   * two-turn conversation handed back for this query string only, behind the
   * same folded-away `import.meta.env.DEV` guard as the auth bypass and the
   * share fixture, and proved out of `dist/` by the same build check.
   *
   * Two turns, because the screen draws reads and writes as two different
   * objects: `list_today` comes back as a stack of `TaskRow`s, and the two
   * `update_task` calls after it as the changes container that owns Revert.
   */
  {
    /* `ready` is the changes container's own footer, not the heading: the
       fixture arrives in an effect after mount, and waiting on the heading
       would photograph the empty state on a slow first paint.
       `open` scrolls that footer into view, and it is not optional. The page
       keeps the newest turn in view with `scrollTo({ behavior: 'smooth' })`,
       and a smooth scroll is driven by the same `requestAnimationFrame` the
       fake clock owns — so under the harness it never advances a frame and
       the transcript sits at the top. This walks up to the transcript's own
       scroller and puts it where the page would have left it. Not
       `scrollIntoView`: that aligns the element's own box, which leaves the
       container's bottom padding under the fold. */
    name: 'chat-turns',
    path: '/chat?__dev-chat-fixture__=1',
    ready: 'text=2 changes written',
    open: (page) => scrollTranscriptTo(page, '2 changes written', 'bottom'),
  },
  /*
   * ── The marks themselves (item 13B) ──
   *
   * Atlas writes Markdown, and until this item every one of those marks
   * reached the screen as punctuation. `?__dev-chat-fixture__=markdown` hands
   * back one reply holding all of them — heading, kicker, bold, italic, both
   * kinds of list, inline code, a fenced block, a quote, a Markdown link and a
   * bare one — so the type spec in `ui/screens.css` has baselines of its own
   * rather than being checked in the corner of a transcript.
   *
   * It is a separate fixture rather than more marks on `chat-turns`
   * deliberately. That baseline is the one anybody reads to see whether a
   * *conversation* looks right, and a conversation reaching for every mark at
   * once would stop looking like one.
   *
   * **Two shots, because the specimen does not fit.** Measured, not assumed:
   * at 1440×900 the reply is 569px inside a 511px scroller and overflows by
   * 221px, and the tablet is narrower still. (Re-measured 2026-09-24, after
   * V3: 785px of transcript in a 650px scroller on desktop, 1045 in 486 on the
   * phone, and on the tablet it fits — so there the two shots are one image,
   * and the walk finds nothing to scroll.) Trimming it to fit would mean
   * dropping about nine lines, which is most of what is being photographed —
   * so the reply stays whole and is captured at both ends instead. They
   * overlap across the lists, which is what makes them readable as one page.
   *
   * Both set the scroll explicitly, and that is not optional: the page pins
   * the newest turn to the bottom on load (item 13G — instantly, on the next
   * frame, at 120ms, and from a `ResizeObserver`), so the reply rests at its
   * bottom end and `chat-markdown` has to move it. Setting `scrollTop` by hand
   * afterwards sticks, and a trace of every write to it (2026-09-24) is why
   * that is known rather than hoped: the three timed pins have all fired well
   * before `READY_AT_MS`, and the observer only re-pins when the column
   * resizes, which nothing does after the reply lands. It is NOT the 240px
   * rule protecting the top — at 1440×900 the reply overflows by 135px, so
   * its top already counts as "near the bottom". The walk is
   * `scrollTranscriptTo`, whose note is the flake these two used to have.
   */
  {
    name: 'chat-markdown',
    path: '/chat?__dev-chat-fixture__=markdown&__dev-host-fixture__=awake&__dev-model-fixture__=1',
    ready: 'text=A kicker, not a heading',
    open: (page) => scrollTranscriptTo(page, 'A kicker, not a heading', 'top'),
  },
  /* The other end of the same reply: inline code, the fenced block with its
     language bar, and the two links. The long `select` line is the one that
     has to stay clipped at the well's right edge — if `.md-pre` ever loses its
     `overflow-x`, this is the shot that shows the transcript widening. */
  {
    name: 'chat-markdown-tail',
    path: '/chat?__dev-chat-fixture__=markdown&__dev-host-fixture__=awake&__dev-model-fixture__=1',
    ready: 'text=A kicker, not a heading',
    open: (page) => scrollTranscriptTo(page, 'A kicker, not a heading', 'bottom'),
  },
  {
    name: 'chat-composer',
    path: '/chat',
    ready: 'h1:has-text("Atlas")',
    open: (page) =>
      page
        /* ITEM 13G renamed it. The composer's field is `Message Atlas` now,
           which is the mockup's own placeholder and label — the old *"Tell it
           what to do"* went with the sentence that used to sit under it. */
        .getByLabel('Message Atlas')
        .fill(
          ['Move the Ledger review to next Monday morning', 'and queue the CA call for today'].join(
            String.fromCharCode(10),
          ),
        ),
    /* Not a `text=` selector: `fill` writes the textarea's VALUE, which is not
       text content and which no text engine can see. What it does change is
       Send — disabled while the field is empty. */
    opened: 'button[aria-label="Send"]:not([disabled])',
  },
  /*
   * ── ITEM 9D: THE ATLAS PATH, WHICH HAD NO BASELINE AT ALL ──
   *
   * Every `/chat` shot above is the **in-browser** assistant, and not by
   * choice: `onAtlas` needs a landed probe over Tailscale, the harness blocks
   * everything off the dev server's own origin, so the path that is the
   * default on Shreekant's machine was the one path this matrix could not
   * photograph. Item 9D put Atlas's tool calls on the wire and `/chat` now
   * seeds `devHostFixture` the way `/atlas-host` does, so it can.
   *
   * Three things live only in this shot. A chip for a tool the in-browser
   * agent cannot call — `remove_subtask` is one of the seven in `mcpTools` and
   * not in `fallbackTools`. A `delete_task` in the changes container, which is
   * where the registry's own `mutates` flag puts it. And that container with
   * **no Revert button**: Atlas wrote those rows and this browser's snapshot
   * ring never saw them, so the footer says where the undo really is.
   *
   * `open` is the same scroll walk `chat-turns` needs and for the same reason
   * — the page keeps the newest turn in view with a smooth scroll the fake
   * clock never advances.
   */
  /*
   * ── THE TWO MOTIONS NOTHING COULD PHOTOGRAPH ──
   *
   * Added by the animation audit. The thinking pill (motion 4 of the four this
   * item numbers) and the kept-thinking expander (motion 8) were both built and
   * both correct, and **no fixture reached either of them** — every transcript
   * here is finished turns with no reasoning attached, so neither had a
   * baseline and neither could be seen in the app without a live Atlas turn.
   * A motion nobody can get to is indistinguishable from one that was never
   * built, which is the hole the nav pill sat in for months.
   *
   * `?__dev-chat-fixture__=working` is a done turn carrying `thinking` and a
   * second turn still running.
   *
   * Two shots: closed is the resting state, and `chat-working-thought` opens
   * the reasoning so the `0fr → 1fr` morph has a baseline at its other end.
   */
  {
    name: 'chat-working',
    path: '/chat?__dev-chat-fixture__=working&__dev-host-fixture__=awake&__dev-model-fixture__=1',
    ready: 'text=Thought for 4.2s',
  },
  {
    name: 'chat-working-thought',
    path: '/chat?__dev-chat-fixture__=working&__dev-host-fixture__=awake&__dev-model-fixture__=1',
    ready: 'text=Thought for 4.2s',
    open: (page) => page.getByRole('button', { name: /Thought for/ }).click(),
    opened: 'text=The filing is the fixed date',
  },
  /*
   * ── 29-1P15d: A LONG JOB (idea 77) ──
   *
   * The same running turn, twelve seconds in: violet light drifts inside its
   * working pill and "12s" sits at the end. The count is read once under the
   * harness (`useLongJob`), so the number is the same every run.
   */
  {
    name: 'chat-long-job',
    path: '/chat?__dev-chat-fixture__=long-job&__dev-host-fixture__=awake&__dev-model-fixture__=1',
    ready: '[data-long-job]',
  },
  /*
   * ── ITEM 13G: FORTY-EIGHT ROWS, OPEN AND CLOSED ──
   *
   * The redrawn tool result is six rows and a "Show all 48" that morphs the
   * rest open — **motion 1 of the four this item numbers** — and no other
   * fixture on this screen answers with more than three tasks, so nothing here
   * drew that control at all. `?__dev-chat-fixture__=backlog` is the mockup's
   * own backlog at the size it designs against.
   *
   * **Two shots, because the two states are the claim.** Closed proves the cap
   * (six rows, then a button); open proves the 320px scroller and that 42 more
   * rows do not push the composer off the screen, which is the failure this
   * whole item exists to end. They are also the only baselines that photograph
   * the fourth column — `where`, a task's project or its list — since every
   * other fixture's rows carry no project at all.
   *
   * The scroll walk is `chat-atlas`'s, for `chat-atlas`'s reason.
   */
  {
    name: 'chat-backlog',
    path: '/chat?__dev-chat-fixture__=backlog&__dev-host-fixture__=awake&__dev-model-fixture__=1',
    ready: 'text=Show all 48',
    open: (page) => scrollTranscriptTo(page, 'Show all 48', 'bottom'),
  },
  /* The same result with the rest morphed open. `settle` between the click and
     the scroll: the expander runs on `--dur-morph`, and measuring the scroller
     while the block it sits in is still growing photographs a box in motion. */
  {
    name: 'chat-backlog-open',
    path: '/chat?__dev-chat-fixture__=backlog&__dev-host-fixture__=awake&__dev-model-fixture__=1',
    ready: 'text=Show all 48',
    opened: 'text=Show fewer',
    open: async (page, settle) => {
      await page.getByRole('button', { name: 'Show all 48' }).click();
      await settle();
      await scrollTranscriptTo(page, 'Show fewer', 'bottom');
    },
  },
  {
    name: 'chat-atlas',
    path: '/chat?__dev-chat-fixture__=atlas&__dev-host-fixture__=awake&__dev-model-fixture__=1',
    ready: 'text=2 changes written',
    open: (page) => scrollTranscriptTo(page, '2 changes written', 'bottom'),
  },
  /*
   * BUILD-16 — the question card, waiting on him, and then answered.
   *
   * Atlas stops on the design's four questions for "add a task to call the
   * CA". The card is read off the `ask_questions` call's arguments, the path a
   * reopened conversation takes, so these also hold the reload. The second
   * adds his answers turn: a receipt where his message would be, and the task
   * that came of it. Only reachable through the fixture — the card arrives
   * from a model on the laptop, over the tailnet the harness blocks.
   */
  {
    name: 'chat-ask',
    path: '/chat?__dev-chat-fixture__=ask&__dev-host-fixture__=awake&__dev-model-fixture__=1',
    ready: '[data-ask-card]:has-text("Drop everything · 9")',
    open: (page) => scrollTranscriptTo(page, 'Send answers', 'bottom'),
  },
  {
    name: 'chat-ask-answered',
    path: '/chat?__dev-chat-fixture__=ask-answered&__dev-host-fixture__=awake&__dev-model-fixture__=1',
    ready: 'text=Answered · Atlas decided the rest',
    open: (page) => scrollTranscriptTo(page, 'The two prep steps', 'bottom'),
  },
  {
    /*
     * A tool chip opened onto the call that produced it.
     *
     * UI-33's chip was a static pill whose whole detail was a `title`
     * tooltip — unreachable on a tablet, and invisible to a baseline. 9D
     * made it the mockup's expander, so the evidence is on the page: the
     * call, its arguments, the summary the tool wrote back, and how long it
     * took. Photographed on the read that returns rows, because that is the
     * chip that did not exist at all before this session: a read with rows
     * used to draw the rows *instead of* a chip.
     *
     * The 0fr → 1fr morph means a regression in the expander collapses this
     * back onto `chat-turns`, which is exactly what a baseline should catch.
     */
    name: 'chat-tool-detail',
    path: '/chat?__dev-chat-fixture__=1',
    ready: 'text=Read today’s queue',
    open: async (page) => {
      await page.getByRole('button', { name: /Read today’s queue/ }).click();
      // Back to the top: the expander pushes the transcript down, and the
      // page's own scroll-to-newest would otherwise crop the chip out.
      await page.evaluate(() => {
        document.querySelectorAll('div').forEach((el) => {
          if (el.scrollHeight > el.clientHeight + 1) el.scrollTop = 0;
        });
      });
    },
    opened: 'text=list_today({})',
  },
  /*
   * ── The catalog (item 10) ──
   *
   * Every file on that screen is a Markdown file on the laptop, fetched over
   * Tailscale, and the harness aborts everything off its own origin — so
   * `src/lib/devCatalogFixture.ts` is the sixth fixture of its kind, guarded
   * and proved out of `dist/` like the other five. Without it the screen has
   * exactly one photographable state and it is the one saying the laptop did
   * not answer.
   *
   * Two shots, because the screen has two states worth guarding and they are
   * the ones a person actually meets: a catalog with notes in it, and a closed
   * laptop. The second needs no fixture at all — the harness blocks the
   * tailnet, so the probe lands as "asleep" on its own.
   */
  {
    name: 'catalog',
    path: '/catalog?__dev-catalog-fixture__=1',
    ready: 'h1:has-text("The catalog")',
  },
  {
    /* The state Shreekant sees whenever the lid is shut, which is most of the
       time. It says which of the three things is wrong and offers the one
       action that can help, rather than drawing an empty list. */
    name: 'catalog-asleep',
    path: '/catalog',
    ready: 'text=The laptop is asleep.',
  },
  /*
   * ── Skills (item 12) ──
   *
   * `src/lib/devSkillsFixture.ts` is the seventh fixture of its kind, for
   * `/catalog`'s reason exactly: every folder on the screen is on the laptop,
   * the harness aborts everything off its own origin, and without it the only
   * photographable state is the one saying the laptop did not answer.
   *
   * Three shots rather than the catalog's two, because this screen has a third
   * state that is worth a baseline and is easy to break: a skill switched
   * **off**. Off is drawn as a dimmed row and an `archived` pill rather than a
   * hidden one — the folder is still there — and that is exactly the kind of
   * treatment a later restyle silently loses.
   */
  {
    name: 'skills',
    path: '/skills?__dev-skills-fixture__=1',
    ready: 'h1:has-text("Skills")',
  },
  {
    /* The switched-off skill, selected. `lease-terms` is the fixture's off
       one, and this is the shot that guards the dim/`archived` treatment on
       both the row and the detail header. */
    name: 'skills-off',
    path: '/skills?__dev-skills-fixture__=1',
    ready: 'h1:has-text("Skills")',
    /* The index docks at 1080 and hides behind a button below it, so the
       tablet run has to open the list before it can pick a row. Written to
       cover both widths rather than as two shots — the state being guarded is
       the off treatment, not the layout. */
    open: async (page) => {
      const opener = page.getByRole('button', { name: 'All skills' });
      if ((await opener.count()) > 0 && (await opener.first().isVisible())) await opener.first().click();
      await page.locator('button', { hasText: 'lease-terms/' }).first().click();
    },
    opened: 'h2:has-text("lease-terms")',
  },
  {
    /* The state Shreekant sees whenever the lid is shut. Needs no fixture —
       the harness blocks the tailnet, so the probe lands as "asleep" on its
       own — and it is what `/catalog` does one screen over. */
    name: 'skills-asleep',
    path: '/skills',
    ready: 'text=The laptop is asleep.',
  },
  /*
   * ── The action log (item 13, DESIGN.md §5.3) ──
   *
   * `src/lib/devLogFixture.ts` is the eighth fixture of its kind, for
   * `/catalog`'s reason exactly: every line on the screen is a JSON file on
   * the laptop, the harness aborts everything off its own origin, and without
   * it the only photographable state is the one saying the laptop did not
   * answer.
   *
   * Three shots. The first is the screen doing its job. The second is the one
   * that matters most and is the easiest to lose in a restyle: a **row that
   * went through the front door**, which must keep its amber "no undo" pill
   * and the footer saying revert cannot reach it — that difference is the
   * safety rule made visible (§5.2), not a decoration. The third is the closed
   * lid, which needs no fixture at all.
   */
  {
    name: 'log',
    path: '/log?__dev-log-fixture__=1',
    ready: 'h1:has-text("Action log")',
  },
  {
    /* The front-door turn, expanded. Its row is the fixture's `t4`, and what
       is being guarded is that an irreversible act does not look like an
       ordinary write: the pill, the footer, and the reason in the open panel
       saying the log records it but cannot recall it. */
    name: 'log-front-door',
    path: '/log?__dev-log-fixture__=1',
    ready: 'h1:has-text("Action log")',
    open: async (page) => {
      await page.locator('button', { hasText: 'Published' }).first().click();
    },
    opened: 'text=This went out of the house',
  },
  {
    /* The lid shut, which is most of the time. Needs no fixture — the harness
       blocks the tailnet, so the probe lands as "asleep" on its own. */
    name: 'log-asleep',
    path: '/log',
    ready: 'text=The laptop is asleep.',
  },
  {
    /*
     * The context slider, open (item 10, DESIGN.md §4.1).
     *
     * The one control on the instrument bar that stopped being a drawing this
     * session, and it cannot be seen any other way: the panel is closed at
     * rest and its whole point is the readout inside it. Photographed at the
     * default 64K, which is where §4.1's *"3.3 GB, all on the graphics card"*
     * comes from — a measured point, with its date beside it.
     *
     * `opened` waits on the readout rather than the panel, because the panel
     * is in the DOM at rest with `visibility: hidden`; a selector that matched
     * it would pass against a control that never opened.
     */
    name: 'chat-tuning',
    path: '/chat?__dev-chat-fixture__=atlas&__dev-host-fixture__=awake&__dev-model-fixture__=1',
    ready: 'h1:has-text("Studio lease")',
    /* ITEM 13G, second pass - it is a `Customize` dial on the composer's
       own row now, not a sliders button on a header bar that no longer
       exists, and it opens upward. */
    /* BIG-1 made Gemini the default, and the slider is a fact about a model
       on the laptop — so the shot puts gemma on the Local side and flips the
       switch to it, through the model store's own actions (OPT-8: Settings
       picks the default, the composer's switch picks the side). */
    open: async (page) => {
      await page.evaluate(async () => {
        const store = await import('/src/lib/agent/modelStore.ts');
        const models = store.useModelStore.getState();
        models.chooseDefault('local', 'ollama:gemma4:e4b');
        models.chooseSide('local');
      });
      await page.getByRole('button', { name: 'Customize' }).click();
    },
    opened: 'text=All of it on the graphics card',
  },
  {
    /*
     * The Atlas panel, open (item 13F).
     *
     * The nav dropped from eleven cells to six and Atlas's four built surfaces
     * — Skills, The catalog, Action log, Atlas host — fold in behind the Atlas
     * button. It is the only way to reach any of them now, so a shot that
     * never opens it photographs a nav with four destinations missing and
     * calls that correct.
     *
     * Both viewports earn their frame here rather than repeating one drawing:
     * on desktop the panel opens to the RIGHT of the vertical rail, on tablet
     * it opens ABOVE the floating pill and over the composer. They are two
     * different pieces of positioning, and only the second can go wrong at the
     * bottom of the window.
     *
     * `.first()` because `FloatingNav` also renders an Atlas cell on this
     * route — tucked away by a transform, which Playwright still counts as
     * visible. `ChatPage`'s own nav is first in the DOM.
     *
     * `opened` waits on a row's note rather than on the panel, for
     * `chat-tuning`'s reason one line up: the panel is in the DOM at rest
     * under `visibility: hidden`, so a selector that matched it would pass
     * against a button that never opened.
     */
    name: 'chat-atlas-panel',
    path: '/chat?__dev-chat-fixture__=atlas&__dev-host-fixture__=awake&__dev-model-fixture__=1',
    ready: 'h1:has-text("Studio lease")',
    open: (page) => page.getByRole('button', { name: 'Atlas', exact: true }).first().click(),
    opened: 'text=Every write, undoable',
  },
  /*
   * ── DOCK MODE (DESIGN-1) ──
   *
   * `design-system/screens/voice.html`, built. Four states and the blocked
   * microphone, each its own capture, because they are four different drawings
   * of one object rather than four labels on it: the orb's fill, its rings, its
   * contents and the accent ration all change between them, and a single
   * resting shot would prove none of that.
   *
   * **They are only photographable through `src/lib/devDockFixture.ts`.** Every
   * state on that screen is produced by a live microphone and a live voice; the
   * harness has neither, so without the fixture there is one capture and it is
   * the permission error. Same guard as every other fixture here, same build
   * check.
   *
   * `__dev-host-fixture__=awake` is not decoration: the header names whichever
   * assistant is actually answering, so an asleep laptop would photograph
   * "the basic assistant" — true, but not the screen this item drew.
   *
   * **The voice list has no shot, deliberately.** Its rows are whatever speech
   * engines the machine running the harness has installed — three on this
   * laptop, ninety-five on his tablet — so a baseline of it would record the
   * laptop's Windows voices and fail on any other machine. It is checked by
   * hand instead; `components/chat/VoicePicker.tsx` says what it has to do.
   */
  /* Every selector below is scoped to the dialog: the chat screen is still
     mounted behind this overlay, and Playwright counts a covered element as
     visible — a bare `text=Thinking` would match the composer's Thinking dial
     and pass before the dock had drawn anything. */
  {
    name: 'dock',
    path: '/chat?__dev-dock-fixture__=waiting&__dev-host-fixture__=awake&__dev-model-fixture__=1',
    ready: '[aria-label="Dock mode"]:has-text("then the message")',
  },
  {
    name: 'dock-hearing',
    path: '/chat?__dev-dock-fixture__=hearing&__dev-host-fixture__=awake&__dev-model-fixture__=1',
    ready: '[aria-label="Dock mode"]:has-text("Hearing you")',
  },
  {
    name: 'dock-thinking',
    path: '/chat?__dev-dock-fixture__=thinking&__dev-host-fixture__=awake&__dev-model-fixture__=1',
    ready: '[aria-label="Dock mode"]:has-text("Working")',
  },
  {
    name: 'dock-speaking',
    path: '/chat?__dev-dock-fixture__=speaking&__dev-host-fixture__=awake&__dev-model-fixture__=1',
    ready: '[aria-label="Dock mode"]:has-text("Reading it out")',
  },
  {
    name: 'dock-blocked',
    path: '/chat?__dev-dock-fixture__=blocked&__dev-host-fixture__=awake&__dev-model-fixture__=1',
    ready: '[aria-label="Dock mode"]:has-text("Microphone blocked")',
  },
  /*
   * ── THE AI PANEL (BUILD-4) ──
   *
   * `design-system/screens/ai-panel.html`, on its four surfaces: a task card,
   * a list header and the project masthead on the board, and `/scoring`. One
   * capture each, and each holds a different one of the specimen's states —
   * a write with its Undo, a question with chips, the approval, and a field
   * the answer filled — because a panel that only ever photographs empty
   * proves nothing about the three laws it exists for.
   *
   * **Only photographable through `src/lib/devPanelFixture.ts`.** Everything
   * inside the panel comes from a model on the laptop over a tailnet the
   * harness blocks. Same guard as every other fixture here, same build check.
   * Desktop docks right and tablet docks at the bottom, so the two viewports
   * are two different layouts of the host, not one layout at two sizes.
   */
  {
    name: 'project-ai-task',
    path: '/project/p-empire?__dev-panel-fixture__=task',
    ready: '[data-ai-panel]:has-text("Two steps added")',
  },
  {
    name: 'project-ai-list',
    path: '/project/p-empire?__dev-panel-fixture__=list',
    ready: '[data-ai-panel]:has-text("Review first")',
    /* The same race as `project-ai-project` below, on phone: the subject is a
       list card, the panel takes the bottom half, and where the board's two
       reveals left it depended on how far the condense had got. V3-6, V3-7
       and V3-9 each recorded this shot flipping; its baseline was the frame
       with the card's foot still under the panel, about 20px short of where
       the app's settled reveal puts it. Same answer as there. */
    open: async (page, settle) => {
      await settle();
      await page.evaluate(() =>
        document.querySelector('[data-ai-subject="true"]')?.scrollIntoView({ block: 'nearest' }));
    },
  },
  {
    name: 'project-ai-project',
    path: '/project/p-empire?__dev-panel-fixture__=project',
    ready: '[data-ai-panel]:has-text("Needs your tap")',
    /* THE SECOND REVEAL IS LOAD-BEARING HERE. ProjectView scrolls the subject
       into view at 60ms and again at 700ms, the second one meant to land after
       the masthead's `ag-condense` has finished. Both timers are the fake
       clock, so one `runFor` fires them in the same real instant — while the
       condense, a CSS animation, is still running on the wall clock with the
       masthead mid-`translateY`. Where `block: 'nearest'` left the page then
       depended on how far it had got: at HEAD with nothing changed, this shot
       flipped between the baseline and a page scrolled about a pixel further
       (1368 and 5559 cells). Only tablet, because the panel docks at the
       bottom there and covers the masthead's half. So: wait the condense out,
       then make the app's own reveal once more, now that the masthead is
       where it ends up. */
    open: async (page, settle) => {
      await settle();
      await page.evaluate(() =>
        document.querySelector('[data-ai-subject="true"]')?.scrollIntoView({ block: 'nearest' }));
    },
  },
  {
    name: 'scoring-ai',
    path: '/scoring?__dev-panel-fixture__=score',
    /* On phone the transcript overflows, and the right frame is its bottom:
       the question card's foot on screen, the filled description scrolled
       away. The panel used to pin once, before Inter swapped in and grew the
       content 71px, so most runs caught it short — and that was the baseline
       until 2026-09-24, when a run where the font won the race flagged 8382
       cells. `AIPanel` re-pins as its messages settle now. Since BUILD-16 the
       questions are one card, not chips, and "Decide for me" is its foot. */
    ready: '[data-ai-panel] [data-ask-card]:has-text("Decide for me")',
    maxCells: SCORING_CLUSTERED_CELLS,
  },
  /*
   * ── The public share view ──
   *
   * The one screen that reads nothing from the store: every byte comes from a
   * `publicShares/{id}` document and its `submissions` subcollection, both live
   * from Firestore. Seeding localStorage reaches none of it, and an offline
   * `onSnapshot` on an uncached document never calls back at all — so before
   * UI-19 this page had no baseline and no way to get one.
   *
   * `src/lib/devShareFixture.ts` is what closes that: a literal share, returned
   * for these two ids only, behind the same folded-away `import.meta.env.DEV`
   * guard as the auth bypass and proved out of `dist/` by the same build check.
   *
   * Four shots, because a share link points at one of three quite different
   * things and the outsourcing switch changes a fourth. The view-only project
   * is the link most people are sent; the outsourcing one adds the invitation
   * card and puts a worker row in each of its three states at once (submitted,
   * in progress, and one the owner has already approved); the last two are a
   * bare list and a single task, which render nothing the project view does.
   *
   * BUILD-14 redrew the page and added three: the client view (cover, names,
   * time taken, and a live timer that started 25 minutes before the frozen
   * clock), a project with nothing planned in it, and a link past its end
   * date. The outsourcing shot now holds all five of a worker's states: open,
   * claimed by this device, handed in, somebody else's, and approved.
   */
  {
    name: 'share',
    path: `/s/${DEV_SHARE_IDS.viewOnly}`,
    ready: 'text=View only. It updates as the work moves.',
  },
  {
    name: 'share-outsourcing',
    path: `/s/${DEV_SHARE_IDS.outsourcing}`,
    ready: 'text=Submit work',
  },
  {
    name: 'share-client',
    path: `/s/${DEV_SHARE_IDS.client}`,
    ready: 'text=Working now',
  },
  {
    name: 'share-empty',
    path: `/s/${DEV_SHARE_IDS.empty}`,
    ready: 'text=Nothing planned yet.',
  },
  {
    name: 'share-closed',
    path: `/s/${DEV_SHARE_IDS.closed}`,
    ready: 'text=This link has closed.',
  },
  {
    name: 'share-list',
    path: `/s/${DEV_SHARE_IDS.list}`,
    ready: 'text=Open the current account',
  },
  {
    name: 'share-task',
    path: `/s/${DEV_SHARE_IDS.task}`,
    ready: 'text=File the incorporation paperwork',
  },
];

// ─── Capture ─────────────────────────────────────────────────────────────────

async function newContext(browser: Browser, viewport: Viewport, baseUrl: string): Promise<BrowserContext> {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    hasTouch: viewport.hasTouch,
    deviceScaleFactor: 1,
    // The app is dark-only, but pinning this stops a host-level appearance
    // change from silently altering form controls and scrollbars.
    colorScheme: 'dark',
    timezoneId: TIMEZONE,
    locale: LOCALE,
    reducedMotion: 'no-preference',
  });

  // A fake clock, not merely a fixed date: it takes over `requestAnimationFrame`
  // too, which is the only way to put Framer Motion's endless loops on a
  // timeline the harness controls. It is NOT parked between `capture`'s jumps,
  // though: an installed clock keeps flowing at wall-clock speed (measured
  // 2026-09-24 — 30ms to 2.2s of drift per shot), so anything that accumulates
  // time without coming to rest lands somewhere different every run. The orb
  // is held still for that reason; see the init script below.
  await context.clock.install({ time: new Date(FROZEN_NOW) });

  /*
   * Nothing leaves the machine, and nothing else ON it is reachable either.
   * The Google Identity Services tag in index.html and every Firebase call die
   * here; both paths already handle being offline.
   *
   * The rule is the dev server's **own origin**, not "any localhost", and item
   * 6 is why: the model picker asks for the list of installed local models.
   * Allowed through, that request would succeed on a machine that had them and
   * fail on one that did not — so a `/chat` baseline would record a fact about
   * the room rather than about the code, and the diff would look exactly like a
   * real regression. `src/lib/devModelFixture.ts` is what the picker's shot
   * uses instead.
   *
   * **Item 8 made that rule matter more, not less.** The request used to go to
   * `localhost:11434` and now goes to Atlas on the laptop over Tailscale — a
   * real external HTTPS origin, so a baseline could otherwise depend on whether
   * the tailnet was up. `/chat` also probes `/health` before listing anything;
   * both die here, the app treats that as a sleeping laptop, and every shot is
   * therefore taken in the fallback state deliberately.
   */
  const devOrigin = new URL(baseUrl).origin;
  await context.route('**/*', (route) =>
    new URL(route.request().url()).origin === devOrigin ? route.continue() : route.abort(),
  );

  await context.addInitScript(
    ({ storageKey, storeJson, trashKey, trashJson, archiveKey, archiveJson, dashKey, dashJson, authKey, atlasKey, atlasUrl, stillKey, landingKey }) => {
      localStorage.setItem(storageKey, storeJson);
      // The Trash is a second persisted store under its own key — see
      // `src/store/useTrashStore.ts` for why it is not part of the first.
      localStorage.setItem(trashKey, trashJson);
      // BUILD-11's Archive is a third, for the same reason.
      localStorage.setItem(archiveKey, archiveJson);
      // BIG-6's Dashboard hours: today's override keeps the work session at
      // the fixture's four hours (`serializedDashboard` says why).
      localStorage.setItem(dashKey, dashJson);
      localStorage.setItem(authKey, '1');
      /*
       * WHERE ATLAS IS, PINNED — so a baseline cannot record whether this
       * machine has one (item 8).
       *
       * `lib/atlas/client.ts` reads this localStorage key first and falls back
       * to `VITE_ATLAS_URL`, which is a `.env` value: a run on a machine that
       * had configured Atlas would show the "asleep" subtitle, and a run on one
       * that had not would show the original line, in the same commit. That is
       * exactly the "fact about the room" the route rule above exists to keep
       * out of the baselines.
       *
       * Pinned to an address that resolves nowhere, so every `/chat` shot is
       * taken with **Atlas asleep and the in-browser fallback answering** —
       * deterministically, on any machine, tailnet or no tailnet. It is also
       * the honest state for a harness that blocks the network.
       */
      localStorage.setItem(atlasKey, atlasUrl);
      /*
       * ATLAS'S ORB, HELD STILL. This fake clock is not parked: it flows at
       * wall-clock speed between the jumps `capture` makes, so the orb's
       * shader had turned a different amount at every capture and the dock
       * shots flagged on every run. `src/lib/devStillPresence.ts` has the
       * numbers; the orb draws its state's settled frame instead.
       */
      localStorage.setItem(stillKey, '1');
      /*
       * HOME STAYS HOME AT `/`. BASE opens on the Dashboard since BIG-6, by
       * moving a cold open at `/` to `/dashboard` before the router reads the
       * address — which would photograph the Dashboard in every Home shot.
       * This device is set to open on Home instead; the Dashboard's own shots
       * open `/dashboard` directly.
       */
      localStorage.setItem(landingKey, 'home');
    },
    {
      storageKey: STORAGE_KEY, storeJson: serializedStore(),
      trashKey: TRASH_STORAGE_KEY, trashJson: serializedTrash(),
      archiveKey: ARCHIVE_STORAGE_KEY, archiveJson: serializedArchive(),
      dashKey: DASHBOARD_STORAGE_KEY, dashJson: serializedDashboard(),
      authKey: DEV_AUTH_KEY,
      atlasKey: ATLAS_URL_KEY, atlasUrl: 'https://atlas.invalid',
      stillKey: DEV_STILL_PRESENCE_KEY,
      landingKey: LANDING_KEY,
    },
  );

  return context;
}

/**
 * How long a finite animation gets to finish before the harness stops waiting
 * on it. Nothing in the app runs a finite animation longer than `--dur-sheet`
 * (680ms), so reaching this means something is wedged rather than merely slow —
 * and pressing on then leaves a capture to look at instead of a hung run.
 */
const ANIMATION_SETTLE_TIMEOUT_MS = 4_000;

/** Real-time gap between polls while waiting for animations to settle. */
const ANIMATION_POLL_MS = 16;

/**
 * Waits, in REAL time, for every finite animation on the page to finish.
 *
 * The fake clock owns `setTimeout` and `requestAnimationFrame`, so it owns
 * Framer Motion — but it does **not** own the document timeline, which is what
 * drives CSS animations and transitions. `ag-condense` and friends therefore
 * run on the wall clock no matter how the harness winds its own, and a scripted
 * interaction fired straight after the one that started them lands on whatever
 * frame the machine happened to reach.
 *
 * Usually that costs a few pixels and the comparator absorbs it. Once it did
 * much worse, which is why this exists (UI-23). `home-smart-start-held-back`
 * presses "Schedule anyway" inside a sheet whose scroller overflows its `84vh`
 * cap by 15px, and a click focuses what it presses, so Chromium scrolls that
 * button into view. How far it scrolls is measured off the button's box *as it
 * is at that instant* — and while `ag-condense` is mid-flight that box is a
 * `scale(0.94) translateY(6px)` version of the settled one, small enough to
 * already be in view. So the same click scrolled the whole sheet by 15px or by
 * nothing at all depending on how fast the machine was, and consecutive runs
 * disagreed by a 15px shift of every pixel in the dialog. It looked like a
 * rasterisation problem and was a race.
 *
 * Waiting here is allowed where winding the clock would not be (see `capture`):
 * this is a real-time wait for the DOM to stop moving, not a clock advance
 * whose size depends on how long something took. The clock stays parked
 * throughout, so nothing Framer Motion drives advances by even a frame.
 *
 * Infinite animations are skipped — the ambient backdrop drift, the pulses and
 * the shimmers never finish, and pinning those is `screenshot({ animations:
 * 'disabled' })`'s job, not this one. Polling is driven from here rather than
 * through `waitForFunction`, because that polls with the page's own `rAF` or
 * `setTimeout` and both of those are the parked fake clock.
 */
async function settleAnimations(page: Page): Promise<void> {
  const deadline = Date.now() + ANIMATION_SETTLE_TIMEOUT_MS;
  for (;;) {
    const pending = await page.evaluate(
      () =>
        document.getAnimations().filter((animation) => {
          const timing = animation.effect?.getComputedTiming();
          if (!timing) return false;
          if (timing.iterations === Infinity) return false;
          if (!Number.isFinite(Number(timing.endTime))) return false;
          // `pending` is an animation that has been started but has not been
          // given a start time yet — it has still to run, so it still counts.
          return animation.playState === 'running' || animation.playState === 'pending';
        }).length,
    );
    if (pending === 0 || Date.now() > deadline) return;
    // Node's timer, deliberately: the page's is the frozen one.
    await new Promise((resolve) => setTimeout(resolve, ANIMATION_POLL_MS));
  }
}

/**
 * The rule that keeps two runs identical: **never wind the clock by an amount
 * that depends on how long something took.**
 *
 * With the fake clock parked, `performance.now()` is a constant, so anything
 * that mounts while we are waiting in real time starts its animations at
 * exactly the parked reading — no matter how slow the machine was. Winding it
 * forward in small polling steps instead would land a mount in a different step
 * from one run to the next, and every looping animation would then be a few
 * frames out. (That is not hypothetical: it was the last source of drift left
 * after the clock was installed.)
 *
 * So each phase is: one fixed jump, then a real-time wait for the DOM, then one
 * fixed jump to the shutter mark.
 */
async function capture(page: Page, shot: Shot, baseUrl: string): Promise<Buffer> {
  let elapsed = 0;
  const advanceBy = async (ms: number) => {
    await page.clock.runFor(ms);
    elapsed += ms;
  };
  const advanceTo = (mark: number) => advanceBy(Math.max(0, mark - elapsed));
  /**
   * Handed to multi-step `open` sequences so an interaction can land before the
   * next one. Both halves matter: the fixed jump finishes everything the fake
   * clock drives, and `settleAnimations` finishes everything it does not.
   */
  const settle = async () => {
    await advanceBy(OPEN_STEP_MS);
    await settleAnimations(page);
  };

  await page.goto(`${baseUrl}${shot.path}`, { waitUntil: 'domcontentloaded' });
  await advanceBy(BOOT_MS);
  await page.waitForSelector(shot.ready, { state: 'visible', timeout: 20_000 });
  await advanceTo(READY_AT_MS);

  if (shot.open) {
    await shot.open(page, settle);
    await settle();
    if (shot.opened) await page.waitForSelector(shot.opened, { state: 'visible', timeout: 20_000 });
    await advanceTo(OPENED_AT_MS);
  }

  // A blinking caret in an auto-focused input is a guaranteed false diff.
  await page.addStyleTag({ content: '*, *::before, *::after { caret-color: transparent !important; }' });

  // Viewport-sized, never `fullPage`: nearly every screen here is an `h-screen`
  // flex column with its own inner scroll container, so a full-page capture
  // just adds empty space below the fold.
  return page.screenshot({ animations: 'disabled', caret: 'hide' });
}
// ─── Diffing ─────────────────────────────────────────────────────────────────

/**
 * Clustered changed cells above which a shot is called a regression. See
 * `imageDiff.ts` for why the count is of *clustered* cells rather than raw ones.
 *
 * Calibrated, not guessed. Across repeated no-change runs of the whole set,
 * most shots erode to zero and the worst — `/scoring`, whose native date inputs
 * render their text unstably — peaked at 178. Moving the floating nav by four
 * pixels, about the smallest regression worth catching, produced 772–1043. The
 * threshold sits in the gap.
 *
 * Raise it if a run starts crying wolf. Never raise it to silence a diff you
 * have not opened.
 */
const MAX_CLUSTERED_CELLS = 300;


type Verdict = 'match' | 'differs' | 'new' | 'written';

async function record(
  buffer: Buffer,
  viewport: string,
  name: string,
  update: boolean,
  comparator: Comparator,
  maxCells: number,
): Promise<{ verdict: Verdict; clustered?: number }> {
  const baselinePath = join(SHOTS_DIR, 'baseline', viewport, `${name}.png`);

  if (update) {
    await mkdir(dirname(baselinePath), { recursive: true });
    await writeFile(baselinePath, buffer);
    return { verdict: 'written' };
  }

  const currentPath = join(SHOTS_DIR, 'current', viewport, `${name}.png`);
  await mkdir(dirname(currentPath), { recursive: true });
  await writeFile(currentPath, buffer);

  const baseline = await readFile(baselinePath).catch(() => null);
  if (baseline === null) return { verdict: 'new' };

  const { clustered, diffPng } = await comparator.compare(baseline, buffer);
  if (clustered <= maxCells) return { verdict: 'match', clustered };

  const diffPath = join(SHOTS_DIR, 'diff', viewport, `${name}.png`);
  await mkdir(dirname(diffPath), { recursive: true });
  await writeFile(diffPath, diffPng);
  return { verdict: 'differs', clustered };
}

// ─── Run ─────────────────────────────────────────────────────────────────────

async function startDevServer(): Promise<{ server: ViteDevServer; baseUrl: string }> {
  const server = await createServer({ root: ROOT, server: { port: 0 }, logLevel: 'warn' });
  await server.listen();
  const baseUrl = server.resolvedUrls?.local[0];
  if (!baseUrl) throw new Error('Vite did not report a local URL to point the browser at.');
  return { server, baseUrl: baseUrl.replace(/\/$/, '') };
}

/**
 * Captures running at once, each in its own browser context. Safe because
 * nothing a capture does depends on wall-clock speed — see `capture` — so a
 * loaded machine changes how long a run takes, not what it photographs.
 * Measured on the Ryzen 7 260 (8 cores, 16 threads, 15 GB): see CLAUDE.md,
 * "Visual verification", for the numbers this default was picked from.
 */
const WORKERS = 8;

/**
 * `npm run shots:accept`. Promotes exactly what the last run flagged — every
 * capture with a diff beside it, and every capture with no baseline yet —
 * and nothing else. This replaces the old routine of `shots:update` (which
 * rewrites every baseline), restoring the unchanged ones by hand, and a third
 * run to prove the restore: the capture being promoted is the one whose diff
 * was just looked at.
 */
async function acceptFlagged(): Promise<void> {
  const accepted: string[] = [];
  for (const viewport of VIEWPORTS) {
    const currentDir = join(SHOTS_DIR, 'current', viewport.name);
    const files = await readdir(currentDir).catch(() => [] as string[]);
    for (const file of files) {
      const baselinePath = join(SHOTS_DIR, 'baseline', viewport.name, file);
      const exists = (path: string) => access(path).then(() => true, () => false);
      const flagged = (await exists(join(SHOTS_DIR, 'diff', viewport.name, file))) || !(await exists(baselinePath));
      if (!flagged) continue;
      await mkdir(dirname(baselinePath), { recursive: true });
      await copyFile(join(currentDir, file), baselinePath);
      accepted.push(`${viewport.name}/${file}`);
    }
  }
  if (accepted.length === 0) {
    console.log('Nothing to accept: the last run flagged no shot.');
    return;
  }
  console.log(`Accepted ${accepted.length} capture(s) as the new baseline:`);
  for (const name of accepted) console.log(`  - ${name}`);
  console.log('\nOnly these files changed in shots/baseline/. Commit them with the change.');
}

async function main(): Promise<void> {
  if (process.argv.includes('--accept')) return acceptFlagged();

  const update = process.argv.includes('--update');
  const onlyArg = process.argv.find((a) => a.startsWith('--only='));
  const only = onlyArg?.slice('--only='.length);
  const workersArg = process.argv.find((a) => a.startsWith('--workers='));
  const workerCount = workersArg ? Math.max(1, Number(workersArg.slice('--workers='.length)) || 1) : WORKERS;

  const viewportArg = process.argv.find((a) => a.startsWith('--viewport='));
  const viewportName = viewportArg?.slice('--viewport='.length);

  const shots = only ? SHOTS.filter((s) => s.name.includes(only)) : SHOTS;
  if (shots.length === 0) {
    console.error(`No shot name matches "${only}". Known: ${SHOTS.map((s) => s.name).join(', ')}`);
    process.exit(1);
  }
  const viewports = viewportName ? VIEWPORTS.filter((v) => v.name === viewportName) : VIEWPORTS;
  if (viewports.length === 0) {
    console.error(`No viewport is called "${viewportName}". Known: ${VIEWPORTS.map((v) => v.name).join(', ')}`);
    process.exit(1);
  }

  const jobs = viewports.flatMap((viewport) =>
    shots
      .filter((shot) => viewport.name !== 'phone' || shot.phone !== false)
      .map((shot) => ({ viewport, shot })),
  );

  if (!update) {
    if (only || viewportName) {
      for (const { viewport, shot } of jobs) {
        for (const dir of ['current', 'diff']) {
          await rm(join(SHOTS_DIR, dir, viewport.name, `${shot.name}.png`), { force: true });
        }
      }
    } else {
      await rm(join(SHOTS_DIR, 'current'), { recursive: true, force: true });
      await rm(join(SHOTS_DIR, 'diff'), { recursive: true, force: true });
    }
  }

  const startedAt = Date.now();
  const { server, baseUrl } = await startDevServer();
  const browser = await chromium.launch();
  const failed: (string | undefined)[] = new Array(jobs.length);
  const workers = Math.min(workerCount, jobs.length);

  console.log(
    `${update ? 'Re-baselining' : 'Capturing'} ${jobs.length} capture(s): ${shots.length} shot(s) × ${viewports.length} viewport(s), ` +
      `${workers} at a time, against ${baseUrl}\n`,
  );

  let next = 0;
  let done = 0;
  const work = async () => {
    const comparator = await Comparator.create(browser);
    while (next < jobs.length) {
      const index = next++;
      const { viewport, shot } = jobs[index];
      const label = `${viewport.name}/${shot.name}`;
      const context = await newContext(browser, viewport, baseUrl);
      const page = await context.newPage();
      let line: string;
      try {
        const buffer = await capture(page, shot, baseUrl);
        const { verdict, clustered } = await record(buffer, viewport.name, shot.name, update, comparator, shot.maxCells ?? MAX_CLUSTERED_CELLS);
        const mark = { match: 'ok  ', differs: 'DIFF', new: 'NEW ', written: 'saved' }[verdict];
        const detail = clustered === undefined ? '' : `  (${clustered} cell${clustered === 1 ? '' : 's'} moved)`;
        line = `  ${mark}  ${label}${detail}`;
        if (verdict === 'differs' || verdict === 'new') failed[index] = `${label} (${verdict})`;
      } catch (err) {
        line = `  FAIL  ${label} — ${err instanceof Error ? err.message.split('\n')[0] : err}`;
        failed[index] = `${label} (error)`;
      } finally {
        await context.close();
      }
      done++;
      console.log(`${line}  [${done}/${jobs.length}]`);
    }
  };

  try {
    await Promise.all(Array.from({ length: workers }, work));
  } finally {
    await browser.close();
    await server.close();
  }

  const seconds = Math.round((Date.now() - startedAt) / 1000);
  console.log(`\nFinished in ${Math.floor(seconds / 60)}m ${seconds % 60}s.`);

  if (update) {
    console.log(`Baselines written to shots/baseline/. Review them, then commit.`);
    return;
  }

  const failures = failed.filter((f): f is string => f !== undefined);
  if (failures.length === 0) {
    console.log('Every shot matches its baseline.');
    return;
  }

  console.log(`${failures.length} shot(s) need a look:`);
  for (const failure of failures) console.log(`  - ${failure}`);
  console.log(
    '\nshots/diff/<viewport>/<name>.png marks what moved in magenta; the full new' +
      '\ncapture is at shots/current/<viewport>/<name>.png, next to its baseline.' +
      '\nIf the change was intended, run `npm run shots:accept` — it promotes exactly the' +
      '\nflagged captures and nothing else — and commit the new baselines.',
  );
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
