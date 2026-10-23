/**
 * Dev-only fixture for the Notifications screen, used by the screenshot
 * harness (`scripts/screenshots.ts`).
 *
 * WHY THIS EXISTS
 * ---------------
 * DESIGN-2 rebuilt this screen around **what fires today**, and the seeded
 * dataset has nothing that does. `scripts/fixture.ts` pins the clock at
 * 2026-03-12T09:30 and its nearest deadlines are the 13th, the 14th and a
 * completed one on the 10th — so the section the whole item is about would be
 * photographed empty, and its three states would have no baseline at all.
 *
 * **The obvious fix is the wrong one.** Dating a shared-fixture task today
 * would not add a row, it would move the app: a deadline hours away puts a
 * task in the priority engine's danger zone, which reshuffles `/scoring`,
 * `/home`, Smart Start and the nav badges. DESIGN-2's "done when" says the
 * notifications captures are re-baselined *only*, and that is the right
 * instinct — a screen's fixture should not be able to rewrite every other
 * screen's baseline.
 *
 * So these tasks are handed to `NotificationsPage` alone and never reach the
 * store. Nothing else in the app can see them.
 *
 * **It seeds tasks, not rows.** That distinction is the item's "invent
 * nothing" rule kept rather than dodged: what is photographed is
 * `firingToday` doing its real arithmetic on real `Task` objects — the
 * deadline, the estimate, the subtraction, the three states, the project and
 * list lookups. A fixture that handed the page a list of finished rows would
 * photograph a drawing of the screen instead of the screen.
 *
 * The times are the mockup's own shape moved onto the harness's frozen clock,
 * so the two can be read side by side: one already missed, the next one due,
 * two later in the day.
 *
 * The **eleventh** of its kind, after `devAuth`, `devShareFixture`,
 * `devChatFixture`, `devModelFixture`, `devHostFixture`, `devCatalogFixture`,
 * `devSkillsFixture`, `devLogFixture`, `devDockFixture` and
 * `devServiceWorker`, and it is kept out of the shipped bundle the same way:
 * every branch behind a bare `import.meta.env.DEV`, which Vite folds to
 * `false` in a production build, and `scripts/check-shots-bypass.mjs` greps
 * `dist/` for the marker. **Do not read that flag into a variable first**,
 * and **do not lift anything below to module scope** — a module-level `const`
 * is initialised whether or not the guarded function is reachable, which is
 * how `devShareFixture`'s marker survived into `dist/` the first time.
 */
import type { Task } from '../store/useStore';
import type { PushLog } from './pushPlan';
import type { BaseEvent } from './events/events';

/**
 * Both variants seed the timeline; what they differ on is **the browser's
 * notification permission**, which is the half of this screen no harness can
 * drive in either direction.
 *
 * Headless Chromium reports `Notification.permission` as `denied` out of the
 * box, so without this the blocked card would sit on top of *every* capture —
 * including the one the item is actually about — and the allowed state would
 * have no baseline at all. `today` therefore pins **granted** and `blocked`
 * pins **denied**, so each is photographed deliberately rather than inherited
 * from what Chromium happens to default to. A permission is the browser's to
 * give, it is spent once, and a denial cannot be un-denied from code.
 */
export type NotificationsFixture = 'today' | 'blocked' | 'delivered';

export function devNotificationsFixture(): NotificationsFixture | null {
  if (!import.meta.env.DEV) return null;
  const match = /__dev-notifications-fixture__=([a-z]+)/.exec(window.location.search);
  if (match === null) return null;
  return match[1] === 'blocked' ? 'blocked' : match[1] === 'delivered' ? 'delivered' : 'today';
}

/**
 * Four tasks that fire on the harness's frozen day, against the seeded
 * projects and lists so the project name on each row is resolved by the same
 * lookup a real task goes through.
 *
 * Ids carry a `dev-` prefix: they are never written, but a collision with a
 * seeded id would silently shadow a real task in any list keyed by id.
 */
export function devFiringTasks(): Task[] {
  if (!import.meta.env.DEV) return [];
  /* `delivered` (BUILD-5) adds two rows that fired earlier this morning, so
     the sender's states have something to be drawn on. The other variants
     keep exactly the four they were photographed with. */
  const delivered: Task[] =
    devNotificationsFixture() === 'delivered'
      ? [
          {
            id: 'dev-fire-invoice',
            title: 'Send the February invoice',
            status: 'needsAction',
            listId: 'l-empire-ops',
            listName: 'Operations',
            order: 4,
            // Fires 08:45; went out on time.
            deadline: '2026-03-12T09:15',
            estimatedTime: 30,
          },
          {
            id: 'dev-fire-ca',
            title: 'Shortlist the CA',
            status: 'needsAction',
            listId: 'l-empire-ops',
            listName: 'Operations',
            order: 5,
            // Fires 09:20; snoozed at 09:28, back at 09:33.
            deadline: '2026-03-12T09:45',
            estimatedTime: 25,
          },
        ]
      : [];
  return [
    ...delivered,
    {
      id: 'dev-fire-pitch',
      title: 'Draft the pitch outline',
      status: 'needsAction',
      listId: 'l-empire-build',
      listName: 'Build',
      order: 0,
      // Fires 08:00 — an hour and a half before the frozen now, so it is
      // missed, which is the state that has to be visible without waiting.
      deadline: '2026-03-12T09:00',
      estimatedTime: 60,
    },
    {
      id: 'dev-fire-filing',
      title: 'Draft the incorporation filing',
      status: 'needsAction',
      listId: 'l-empire-ops',
      listName: 'Operations',
      order: 1,
      // Fires 10:15 — the next one, 45 minutes out.
      deadline: '2026-03-12T11:00',
      estimatedTime: 45,
    },
    {
      id: 'dev-fire-landlord',
      title: 'Reply to the landlord',
      status: 'needsAction',
      listId: 'l-studio-space',
      listName: 'The Space',
      order: 2,
      // Fires 13:15.
      deadline: '2026-03-12T14:15',
      estimatedTime: 60,
    },
    {
      id: 'dev-fire-lease',
      title: 'Sign the lease',
      status: 'needsAction',
      listId: 'l-studio-space',
      listName: 'The Space',
      order: 3,
      // Fires 20:30. Far enough out to prove the list is not just "the next
      // two things".
      deadline: '2026-03-12T21:00',
      estimatedTime: 30,
    },
  ];
}

/**
 * 29-2c2: two events whose alerts ring on the frozen day, handed to the page
 * alone like the tasks above, so `eventAlertsToday` does its real arithmetic.
 * A birthday all day with "On the day" (rings 08:00, before the frozen now) and
 * a call at 12:00 with "1 hour before" (rings 11:00).
 */
export function devFiringEvents(): BaseEvent[] {
  if (!import.meta.env.DEV) return [];
  return [
    { id: 'dev-event-riya', title: "Riya's birthday", start: '2026-03-12', alerts: [0], colour: 'rose', createdAt: 0 },
    { id: 'dev-event-call', title: 'Investor call', start: '2026-03-12T12:00', alerts: [60], location: 'Zoom', createdAt: 0 },
  ];
}

/**
 * What the sender would have logged by the frozen 09:30, for `delivered`
 * (BUILD-5): the pitch missed and counted in the 08:12 summary, the invoice
 * sent at 08:45, the CA snoozed, and (29-2c2) the birthday sent at 08:00. Keys
 * and instants are the sender's own (`logKey`), so `withDelivery` does its
 * real matching on them.
 */
export function devPushLog(): PushLog | null {
  if (!import.meta.env.DEV || devNotificationsFixture() !== 'delivered') return null;
  const at = (wall: string) => Date.parse(`2026-03-12T${wall}:00+05:30`);
  const birthday = { taskId: 'event:dev-event-riya', eventId: 'dev-event-riya', minutesBefore: 0, at: at('08:00'), title: "Riya's birthday", estimateMinutes: 0 };
  const entry = (taskId: string, fire: string, title: string, estimateMinutes: number) => ({
    taskId,
    at: at(fire),
    title,
    estimateMinutes,
  });
  const pitch = entry('dev-fire-pitch', '08:00', 'Draft the pitch outline', 60);
  const invoice = entry('dev-fire-invoice', '08:45', 'Send the February invoice', 30);
  const ca = entry('dev-fire-ca', '09:20', 'Shortlist the CA', 25);
  return {
    entries: {
      [`${pitch.taskId}@${pitch.at}`]: { ...pitch, outcome: 'missed', summaryAt: at('08:12') },
      [`${invoice.taskId}@${invoice.at}`]: { ...invoice, outcome: 'sent', sentAt: at('08:45') },
      [`${ca.taskId}@${ca.at}`]: { ...ca, outcome: 'sent', sentAt: at('09:20'), snoozeUntil: at('09:33') },
      [`${birthday.taskId}@${birthday.at}`]: { ...birthday, outcome: 'sent', sentAt: at('08:00') },
    },
  };
}
