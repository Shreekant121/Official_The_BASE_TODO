/**
 * Dev-only fixture for the public share view, used by the screenshot harness
 * (`scripts/screenshots.ts`).
 *
 * WHY THIS EXISTS
 * ---------------
 * `pages/SharePage.tsx` is the largest screen in the app and the only one that
 * reads *nothing* from the store: every byte it renders comes from a
 * `publicShares/{shareId}` document and a `submissions` subcollection, both
 * live from Firestore. The harness aborts every request off localhost, and an
 * offline `onSnapshot` on a document that is not in cache never calls back at
 * all — so the page sits on its loading state forever and cannot be
 * photographed. Seeding localStorage, which is how every other screen is fed,
 * reaches nothing here.
 *
 * So the harness navigates to `/s/<one of the ids below>` and this module hands
 * back a literal share instead. It is a *rendering* fixture and nothing more:
 * it grants no access, reads no real document, and cannot make the page show
 * anybody's data. The worst a leak could do is render two fake projects.
 *
 * HOW IT IS KEPT OUT OF THE SHIPPED BUNDLE
 * ----------------------------------------
 * Same mechanism as `devAuth.ts`, and it is guarded the same way. The whole
 * body sits behind a bare `import.meta.env.DEV`, which Vite replaces with the
 * literal `false` for a production build; the guard folds to a constant, the
 * bundler drops everything after it, and `scripts/check-shots-bypass.mjs`
 * greps `dist/` for the marker below and fails the build if it survives.
 * **Do not read that flag into a variable first** — constant folding is the
 * whole guarantee.
 *
 * A baseline is only worth diffing if the data behind it never moves, so this
 * file is entirely literal, exactly like `scripts/fixture.ts`: fixed ids, a
 * fixed `updatedAt`, fixed deadlines, and no call to `Date.now()`.
 */
import type { PublicShareDoc } from './publicShare';
import type { ShareSubmission } from './shareSubmissions';

/**
 * WHY THE TWO IDS ARE NOT EXPORTED FROM HERE
 * ------------------------------------------
 * They live in `scripts/fixture.ts` (`DEV_SHARE_IDS`), which is harness-only
 * and never bundled. A module-level `const` in *this* file is not dead code —
 * it is initialised whether or not the guarded function below is ever
 * reachable — so the marker string survived into `dist/` and
 * `check-shots-bypass.mjs` failed the build, which is exactly the check doing
 * its job. Everything this module knows is therefore written INSIDE the
 * function, after the guard, where a production build can drop all of it.
 *
 * The cost is one duplicated prefix across the two files, and it cannot drift
 * silently: an id that stops matching makes this return `null`, the page waits
 * on a real Firestore document the harness has aborted, and the shot fails on
 * its `ready` selector.
 */

export interface DevShareFixture {
  share: PublicShareDoc;
  /** Keyed by taskId, the shape `SharePage` derives from a live subscription. */
  submissions: Record<string, ShareSubmission>;
  /** Task ids "this device" claimed — what localStorage holds for a real worker. */
  claims: string[];
  /**
   * A clock that does not move, for a share with a running timer on it. The
   * harness's fake clock flows at wall speed between its jumps, so a live
   * timer read from it lands on a different second every run.
   */
  now?: number;
}

/**
 * The fixture, or `null` for every real share id.
 *
 * Everything is built inside the function, after the guard, so a production
 * build has nothing left to reference once the guard folds away.
 */
export function devShareFixture(shareId: string): DevShareFixture | null {
  if (!import.meta.env.DEV) return null;

  /**
   * Deliberately conspicuous, so the post-build grep cannot false-positive and
   * so the id is unmistakable in a URL bar. Every fixture share id starts with
   * it; anything else falls through to the real Firestore path.
   * **Must match `DEV_SHARE_IDS` in `scripts/fixture.ts`.**
   */
  const PREFIX = '__dev-share-fixture__';
  if (!shareId.startsWith(PREFIX)) return null;
  const OUTSOURCING_ID = `${PREFIX}work`;
  const LIST_ID = `${PREFIX}list`;
  const TASK_ID = `${PREFIX}task`;
  const CLIENT_ID = `${PREFIX}client`;
  const EMPTY_ID = `${PREFIX}empty`;
  const CLOSED_ID = `${PREFIX}closed`;

  /** Fixed instant, in the harness's own timezone. Never `Date.now()`. */
  const UPDATED_AT = new Date('2026-03-12T08:05:00+05:30').getTime();
  /** 25 minutes before the harness's frozen clock (09:30 IST). */
  const RUN_STARTED = new Date('2026-03-12T09:05:00+05:30').getTime();

  const project: NonNullable<PublicShareDoc['project']> = {
    name: 'Shreekant Empire',
    description: 'The holding company — incorporation, compliance, and the first two revenue lines.',
    color: '#8b5cf6',
    icon: '🏛️',
    totalValueINR: 186_000,
    lists: [
      {
        id: 'dl-ops',
        title: 'Operations',
        valueINR: 126_000,
        taskCount: 4,
        doneCount: 1,
        tasks: [
          {
            id: 'dt-incorp',
            title: 'File the incorporation paperwork',
            description: 'Both directors have signed. The CA needs the DSC before the filing window closes.',
            status: 'in-progress',
            done: false,
            deadline: '2026-03-18T11:00',
            estimatedTime: 90,
            valueINR: 48_000,
            tags: ['compliance', 'urgent'],
            subtaskDone: 1,
            subtaskTotal: 3,
            subtasks: [
              { id: 'ds-dsc', title: 'Collect both digital signature certificates', done: true },
              {
                id: 'ds-forms',
                title: 'Fill SPICe+ Part B',
                done: false,
                deadline: '2026-03-16T10:00',
                subtasks: [
                  { id: 'ds-forms-a', title: 'Registered office proof', done: false },
                  { id: 'ds-forms-b', title: 'Director KYC attachments', done: false },
                ],
              },
              { id: 'ds-pay', title: 'Pay the filing fee', done: false },
            ],
          },
          {
            id: 'dt-bank',
            title: 'Open the current account',
            description: 'Blocked until the incorporation certificate is issued.',
            status: 'needsAction',
            done: false,
            deadline: '2026-03-27T09:00',
            estimatedTime: 45,
            valueINR: 22_000,
            tags: ['banking'],
            subtaskDone: 0,
            subtaskTotal: 0,
          },
          {
            id: 'dt-gst',
            title: 'GST registration for the studio line',
            status: 'needsAction',
            done: false,
            estimatedTime: 120,
            valueINR: 34_000,
            subtaskDone: 0,
            subtaskTotal: 0,
          },
          {
            id: 'dt-name',
            title: 'Reserve the company name',
            status: 'completed',
            done: true,
            completedAt: new Date('2026-03-09T16:00:00+05:30').getTime(),
            valueINR: 22_000,
            subtaskDone: 0,
            subtaskTotal: 0,
          },
        ],
      },
      {
        id: 'dl-brand',
        title: 'Brand & site',
        valueINR: 60_000,
        taskCount: 2,
        doneCount: 0,
        tasks: [
          {
            id: 'dt-logo',
            title: 'Redraw the mark for print',
            description: 'Vector only. The raster tile falls apart above A3.',
            status: 'needsAction',
            done: false,
            deadline: '2026-04-02T17:00',
            estimatedTime: 240,
            valueINR: 38_000,
            tags: ['design'],
            subtaskDone: 0,
            subtaskTotal: 0,
          },
          {
            id: 'dt-copy',
            title: 'Write the one-page site copy',
            status: 'needsAction',
            done: false,
            estimatedTime: 60,
            valueINR: 22_000,
            subtaskDone: 0,
            subtaskTotal: 0,
          },
        ],
      },
    ],
  };

  const base: PublicShareDoc = {
    shareId,
    type: 'project',
    ownerId: 'dev-share-fixture-owner',
    ownerName: 'Shreekant',
    title: project.name,
    subtitle: project.description,
    updatedAt: UPDATED_AT,
    project,
  };

  /*
   * The other two things a link can point at. `SharePage` renders a genuinely
   * different shape for each — a bare list pane, and a single task promoted to
   * a `Card` of its own — so both are worth a baseline rather than being
   * assumed to follow from the project view.
   *
   * Neither carries a project, which is also the point: their identity dot
   * falls back to the page's own default hue, because a list and a task have
   * no colour of their own.
   */
  if (shareId === LIST_ID) {
    const list = project.lists[0];
    return {
      share: {
        ...base,
        type: 'list',
        title: list.title,
        subtitle: 'The compliance and banking track.',
        project: undefined,
        list,
      },
      submissions: {},
      claims: [],
    };
  }

  if (shareId === TASK_ID) {
    const task = project.lists[0].tasks[0];
    return {
      share: {
        ...base,
        type: 'task',
        title: task.title,
        subtitle: undefined,
        project: undefined,
        task,
      },
      submissions: {},
      claims: [],
    };
  }

  if (shareId === OUTSOURCING_ID) {
    return {
      share: { ...base, allowContributions: true },
      /* Every state a task can be in for the worker looking at it (BUILD-14).
         Priya's submitted `dt-incorp` is somebody else's, so it reads as taken;
         `dt-logo` and `dt-bank` are this device's, one claimed and one handed
         in; `dt-name` is done, so approved; the rest are open. */
      submissions: {
        'dt-incorp': {
          taskId: 'dt-incorp',
          workerName: 'Priya',
          state: 'submitted',
          updatedAt: UPDATED_AT,
        },
        'dt-logo': {
          taskId: 'dt-logo',
          workerName: 'Arjun',
          state: 'in_progress',
          updatedAt: UPDATED_AT,
        },
        'dt-bank': {
          taskId: 'dt-bank',
          workerName: 'Arjun',
          state: 'submitted',
          updatedAt: UPDATED_AT,
        },
      },
      claims: ['dt-logo', 'dt-bank'],
    };
  }

  /*
   * The client view (BUILD-14): a cover, names, time taken, and a focus run
   * on `dt-incorp` that started 25 minutes before the frozen clock. The cover
   * is a drawn gradient, because a baseline needs pixels that never change
   * and the harness blocks every image off localhost.
   */
  if (shareId === CLIENT_ID) {
    const people: Record<string, Partial<NonNullable<PublicShareDoc['task']>>> = {
      'dt-name': { assignedToOwner: true, spentSeconds: 5400 },
      'dt-incorp': { assignedToOwner: true, spentSeconds: 8520 },
      'dt-logo': { assigneeName: 'Riya Mehta' },
    };
    const cover =
      'data:image/svg+xml,' +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400"><defs>' +
        '<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a1f4d"/>' +
        '<stop offset="0.55" stop-color="#15324a"/><stop offset="1" stop-color="#3b2a12"/></linearGradient>' +
        '</defs><rect width="1200" height="400" fill="url(#g)"/>' +
        '<circle cx="920" cy="120" r="180" fill="#8b5cf6" opacity="0.18"/></svg>',
      );
    return {
      share: {
        ...base,
        showPeople: true,
        live: {
          taskId: 'dt-incorp',
          since: RUN_STARTED,
          segmentStartedAt: RUN_STARTED,
          until: RUN_STARTED + 3 * 60 * 60 * 1000,
        },
        project: {
          ...project,
          coverUrl: cover,
          lists: project.lists.map((l) => ({ ...l, tasks: l.tasks.map((t) => ({ ...t, ...people[t.id] })) })),
        },
      },
      submissions: {},
      claims: [],
      now: new Date('2026-03-12T09:30:00+05:30').getTime(),
    };
  }

  /** A project shared before anything was planned in it. */
  if (shareId === EMPTY_ID) {
    return {
      share: {
        ...base,
        subtitle: 'Scoping is under way.',
        project: { ...project, totalValueINR: 0, lists: [] },
      },
      submissions: {},
      claims: [],
    };
  }

  /** A link past its end date: the stub `buildShareDoc` writes, and nothing else. */
  if (shareId === CLOSED_ID) {
    return {
      share: {
        shareId,
        type: 'project',
        ownerId: base.ownerId,
        ownerName: 'Shreekant',
        title: '',
        updatedAt: UPDATED_AT,
        expiresAt: new Date('2026-03-11T00:00:00+05:30').getTime(),
        expired: true,
        allowContributions: false,
      },
      submissions: {},
      claims: [],
    };
  }

  return { share: base, submissions: {}, claims: [] };
}
