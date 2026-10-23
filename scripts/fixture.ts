/**
 * The seeded dataset every screenshot is taken against.
 *
 * A baseline is only worth diffing if the data behind it never moves, so this
 * file is entirely literal: fixed ids, fixed `createdAt` stamps, fixed
 * deadlines. Nothing calls `Date.now()` or `crypto.randomUUID()`. The harness
 * pairs it with a frozen wall clock (`FROZEN_NOW`) and a pinned timezone, so
 * every "due in 3 days" / "overdue" / priority-score readout renders the same
 * bytes next week as it does today.
 *
 * The shape written to localStorage is Zustand `persist`'s envelope —
 * `{ state, version }` under the `mutineer-os-storage` key, at the store's
 * current `version` so the migration in `useStore.ts` passes it straight
 * through untouched. The Trash is a *second* store with its own key and its
 * own version; `serializedTrash` at the bottom of this file is its equivalent.
 *
 * Coverage is deliberate rather than decorative. Between them these records
 * exercise: an empty project and a busy one, all three hardcoded default lists,
 * nested subtasks, a subtask proxy in today's queue, task dependencies (D2), a
 * custom repeat rule, tasks that satisfy `taskNeedsAttention` and tasks that
 * don't, ₹ values that roll up, links, a focus log with recorded hours,
 * and all three kinds of Trash entry at different points in their thirty days.
 */
import type { FocusLogEntry, Project, Task, TaskList } from '../src/store/useStore.ts';
import type { TrashEntry } from '../src/lib/trashModel.ts';
import type { ArchiveEntry } from '../src/lib/archiveModel.ts';

/**
 * The instant the harness pins `Date.now()` to, in the fixture's timezone.
 * Mid-month and mid-week on purpose: far enough from a month boundary or a DST
 * transition that no relative-date label sits on a knife edge.
 */
export const FROZEN_NOW = '2026-03-12T09:30:00+05:30';
export const TIMEZONE = 'Asia/Kolkata';
export const LOCALE = 'en-GB';

/** Zustand `persist` key and schema version — must track `useStore.ts`. */
export const STORAGE_KEY = 'mutineer-os-storage';
const STORAGE_VERSION = 10;

/**
 * The two share ids the public `/s/:shareId` shots open.
 *
 * That page is the one screen this file cannot reach: it reads no store at all,
 * only a `publicShares/{id}` document, and the harness is offline. Its data
 * therefore lives in `src/lib/devShareFixture.ts`, which recognises these ids
 * and hands back a literal share — behind an `import.meta.env.DEV` guard that a
 * production build folds away, and proved out of `dist/` by
 * `scripts/check-shots-bypass.mjs`.
 *
 * They are declared HERE rather than exported from that module because a
 * module-level constant there is initialised whether or not the guarded
 * function is reachable, so the string survived into the shipped bundle and
 * failed that check. This file is never bundled.
 *
 * **Must match the prefix inside `devShareFixture()`.** If they ever disagree
 * the page falls through to a real Firestore read the harness has aborted, and
 * the shot fails on its `ready` selector rather than photographing something
 * wrong.
 */
export const DEV_SHARE_IDS = {
  /** A view-only project share — the link most people are sent. */
  viewOnly: '__dev-share-fixture__view',
  /** The same project with contributions on, mid-flight. */
  outsourcing: '__dev-share-fixture__work',
  /** One list on its own, with no project behind it. */
  list: '__dev-share-fixture__list',
  /** One task on its own — the page's third and quite different shape. */
  task: '__dev-share-fixture__task',
  /** The client view: cover, names, time taken and a live focus run (BUILD-14). */
  client: '__dev-share-fixture__client',
  /** A project shared before anything was planned in it. */
  empty: '__dev-share-fixture__empty',
  /** A link past its end date. */
  closed: '__dev-share-fixture__closed',
} as const;

/**
 * The localStorage key that holds Atlas's presence orb on one settled frame
 * (`src/lib/devStillPresence.ts` says why). Declared here for the same reason
 * as the share ids above, and **must match the literal inside
 * `devStillPresence()`** — if they disagree the dock shots go back to flaking.
 */
export const DEV_STILL_PRESENCE_KEY = '__dev-still-presence__';

export const PROJECTS: Project[] = [
  {
    id: 'p-empire',
    name: 'Shreekant Empire',
    description: 'The holding company — incorporation, compliance, and the first two revenue lines.',
    // 29-1P9b (idea 156): the coral line on its chart. One task done in the
    // last two weeks puts the finish weeks after it, so the button reads late.
    finishBy: '2026-04-15',
   
    createdAt: 1_740_000_000_000,
    order: 0,
  },
  {
    id: 'p-studio',
    name: 'Studio Launch',
    description: 'Everything that has to be true before the studio opens its doors.',
   
    createdAt: 1_740_100_000_000,
    order: 1,
  },
  {
    id: 'p-personal',
    name: 'Personal',
   
    createdAt: 1_740_200_000_000,
    order: 2,
  },
];

export const TASK_LISTS: TaskList[] = [
  // The three hardcoded rows every install has (see DEFAULT_LISTS).
  { id: 'action', title: 'Action Steps' },
  { id: 'backburner', title: 'Backburner' },
  { id: 'reference', title: 'Reference Materials' },

  { id: 'l-empire-build', title: 'Build', projectId: 'p-empire', order: 0 },
  { id: 'l-empire-ops', title: 'Operations', projectId: 'p-empire', order: 1 },
  { id: 'l-empire-money', title: 'Money', projectId: 'p-empire', order: 2 },
  { id: 'l-studio-space', title: 'The Space', projectId: 'p-studio', order: 0 },
  { id: 'l-studio-launch', title: 'Launch Week', projectId: 'p-studio', order: 1 },
];

export const BACKLOG_TASKS: Task[] = [
  // ── Fully specified: scored, dated, estimated, described. These are the
  //    tasks `taskNeedsAttention` leaves alone, so the Score page skips them.
  {
    id: 't-incorporate',
    title: 'File the incorporation paperwork',
    description: 'Form INC-32 plus the MOA and AOA. The CA has the drafts; they need signing and uploading.',
    status: 'in-progress',
    priority: 'urgent',
    listId: 'l-empire-ops',
    listName: 'Operations',
    startDate: '2026-03-09T10:00',
    deadline: '2026-03-13T18:00',
    estimatedTime: 90,
    humanOverride: 9,
    valueINR: 25_000,
    // 29-1P9b (idea 155): the line's first milestone, and the next one. Not a
    // scoring field — it moves nothing in Smart Start or the score.
    milestone: true,
    createdAt: 1_740_300_000_000,
    order: 0,
    subtasks: [
      { id: 's-inc-moa', title: 'Sign the MOA', status: 'completed', allocatedTime: 900 },
      { id: 's-inc-aoa', title: 'Sign the AOA', status: 'completed', allocatedTime: 900 },
      {
        id: 's-inc-upload',
        title: 'Upload to the MCA portal',
        status: 'needsAction',
        allocatedTime: 1800,
        humanOverride: 4,
        subtasks: [
          { id: 's-inc-upload-scan', title: 'Scan the signed pages', status: 'needsAction', allocatedTime: 600 },
          { id: 's-inc-upload-dsc', title: 'Attach the digital signature', status: 'needsAction', allocatedTime: 600 },
        ],
      },
    ],
  },
  {
    id: 't-bank',
    title: 'Open the current account',
    description: 'Needs the certificate of incorporation, so it cannot start until the filing clears.',
    status: 'needsAction',
    priority: 'high',
    listId: 'l-empire-money',
    listName: 'Money',
    deadline: '2026-03-20T17:00',
    estimatedTime: 120,
    humanOverride: 6,
    // D2 — the blocker Session 6's Smart Start has to reason about.
    dependsOn: ['t-incorporate'],
    // 29-1P9b: the second milestone, waiting on the first through that link.
    milestone: true,
    valueINR: 10_000,
    createdAt: 1_740_310_000_000,
    order: 0,
    subtasks: [],
  },
  {
    id: 't-landing',
    title: 'Rewrite the landing page copy',
    description: 'Lead with the outcome, not the process. Three sections, one call to action.',
    status: 'needsAction',
    priority: 'high',
    listId: 'l-empire-build',
    listName: 'Build',
    deadline: '2026-03-16T18:00',
    estimatedTime: 150,
    humanOverride: 6,
    // **Deferred to the cap** (item 17): the row reads `Avoided ×5`, which is
    // the exit criterion *"dodging a task five times is visible on its row"*,
    // and it is the one value that also photographs the ceiling — the store
    // saturates here, so the row and the factor bar's `+5 /5` are the same
    // number rather than two readings of one count. It was 1 before, which
    // proved the field existed and nothing else about it.
    avoidedCount: 5,
    // **The one flagged emergency in the fixture** (item 17), and it is on this
    // task for three reasons that are each worth stating.
    //
    // *Live, not lapsed.* Its deadline is four days ahead of `FROZEN_NOW`, so
    // the engine counts the flag. A fixture task whose date had gone by would
    // photograph the struck-through "lapsed" mark for ever and never the state
    // the button is actually for.
    //
    // *Not a blocker.* `t-lease` was the first choice and it is a prerequisite
    // of `t-acoustics` — flagging it lifted that whole chain into Smart Start's
    // hour, so `home-smart-start-held-back` came back with **one** held-back
    // row instead of two, and the "Schedule anyway" button it exists to
    // photograph beside the taken "Scheduled" state was no longer on screen
    // anywhere in the harness. Nothing depends on this task, so the flag moves
    // its own score and no one else's rank.
    //
    // *One, deliberately.* The point of the flag is that a backlog holding six
    // of them has stopped saying anything; a fixture that photographed the
    // crowd warning would be a fixture arguing against its own feature. The
    // warning is reached by flagging a fourth task by hand.
    emergencyBoost: 3,
    // Occurrence 3 of a three-times monthly repeat, anchored on 16 January, so
    // its deadline is the anchor advanced two whole months and finishing it
    // will spawn nothing. This is what photographs the amber "Last one" chip
    // on the row and the same words under the task card's Repeat field.
    recurrence: 'custom',
    recurrenceRule: 'FREQ=MONTHLY;INTERVAL=1;COUNT=3',
    seriesId: 'series-landing',
    occurrence: 3,
    seriesAnchor: '2026-01-16T18:00',
    links: [
      { id: 'lk-landing-1', title: 'Current draft', url: 'https://example.com/draft' },
      { id: 'lk-landing-2', title: 'Competitor teardown', url: 'https://example.com/teardown' },
    ],
    valueINR: 40_000,
    createdAt: 1_740_320_000_000,
    order: 1,
    subtasks: [
      { id: 's-land-hero', title: 'Hero section', status: 'needsAction', allocatedTime: 2700 },
      { id: 's-land-proof', title: 'Proof section', status: 'needsAction', allocatedTime: 2700 },
      { id: 's-land-cta', title: 'Call to action', status: 'needsAction', allocatedTime: 1800 },
    ],
  },
  {
    id: 't-invoices',
    title: 'Chase the outstanding invoices',
    description: 'Two are past thirty days. Polite first note, then a call.',
    status: 'completed',
    priority: 'medium',
    listId: 'l-empire-money',
    listName: 'Money',
    deadline: '2026-03-10T12:00',
    estimatedTime: 45,
    humanOverride: 6,
    // The other end of the same story: occurrence 2 of a twice-daily repeat,
    // already ticked off, so the row reads "Repeat finished" rather than
    // offering a next one that is never coming.
    recurrence: 'custom',
    recurrenceRule: 'FREQ=DAILY;INTERVAL=1;COUNT=2',
    seriesId: 'series-invoices',
    occurrence: 2,
    seriesAnchor: '2026-03-09T12:00',
    completedAt: 1_773_200_000_000,
    valueINR: 85_000,
    createdAt: 1_740_330_000_000,
    order: 1,
    subtasks: [],
  },

  // ── Needs attention: each is missing at least one of score / deadline /
  //    estimate / description, so the Score page has a queue to walk.
  //    `t-audit` sorts first (earliest deadline) and carries the custom repeat
  //    rule, which is what makes the Repeat field open the recurrence modal in
  //    a single click.
  {
    id: 't-audit',
    title: 'Quarterly compliance review',
    status: 'needsAction',
    listId: 'l-empire-ops',
    listName: 'Operations',
    deadline: '2026-03-14T11:00',
    estimatedTime: 60,
    humanOverride: 5,
    // Reads "Every 2 weeks on Mon, Thu, 8x" — the same words the object form
    // produced, which is what keeps the `/scoring` baselines still.
    recurrence: 'custom',
    recurrenceRule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH;COUNT=8',
    reminderMinutes: 60,
    createdAt: 1_740_340_000_000,
    order: 2,
    subtasks: [],
    // No description — this is what keeps it in the attention queue.
  },
  {
    id: 't-lease',
    title: 'Countersign the studio lease',
    status: 'needsAction',
    priority: 'urgent',
    listId: 'l-studio-space',
    listName: 'The Space',
    deadline: '2026-03-17T16:00',
    valueINR: 180_000,
    createdAt: 1_740_350_000_000,
    order: 0,
    subtasks: [],
  },
  {
    id: 't-acoustics',
    title: 'Get the acoustic treatment quoted',
    description: 'Two vendors minimum, and ask both to price the ceiling separately.',
    status: 'needsAction',
    listId: 'l-studio-space',
    listName: 'The Space',
    dependsOn: ['t-lease'],
    createdAt: 1_740_360_000_000,
    order: 1,
    subtasks: [],
  },
  {
    id: 't-invites',
    title: 'Draft the launch-week invite list',
    status: 'needsAction',
    listId: 'l-studio-launch',
    listName: 'Launch Week',
    estimatedTime: 30,
    createdAt: 1_740_370_000_000,
    order: 0,
    subtasks: [],
  },

  // ── The three default lists, so none of them screenshots empty.
  {
    id: 't-renew-dl',
    title: 'Renew the driving licence',
    description: 'Slot booked; carry the old licence and the address proof.',
    status: 'needsAction',
    listId: 'action',
    listName: 'Action Steps',
    deadline: '2026-03-24T09:00',
    estimatedTime: 75,
    humanOverride: 5,
    createdAt: 1_740_380_000_000,
    order: 0,
    subtasks: [],
  },
  {
    id: 't-podcast',
    title: 'Pitch the podcast appearance',
    status: 'needsAction',
    listId: 'backburner',
    listName: 'Backburner',
    createdAt: 1_740_390_000_000,
    order: 0,
    subtasks: [],
  },
  {
    id: 't-tax-notes',
    title: 'Section 44AD reading notes',
    description: 'Presumptive taxation threshold and what it excludes.',
    status: 'needsAction',
    listId: 'reference',
    listName: 'Reference Materials',
    links: [{ id: 'lk-tax-1', title: 'Income Tax Act s.44AD', url: 'https://example.com/44ad' }],
    createdAt: 1_740_400_000_000,
    order: 0,
    subtasks: [],
  },
];

/**
 * Today's focus queue — the `tasks` array, a snapshot copy of chosen backlog
 * rows rather than a reference to them (see CLAUDE.md). Every entry carries an
 * `allocatedTime` so the Set Deadlines page arrives complete and Focus Mode has
 * a countdown to show; the last is a subtask proxy, the awkward case worth
 * having in a baseline.
 */
export const FOCUS_QUEUE: Task[] = [
  { ...BACKLOG_TASKS[0], allocatedTime: 5400 },
  { ...BACKLOG_TASKS[2], allocatedTime: 9000 },
  {
    id: 's-inc-upload',
    title: 'Upload to the MCA portal',
    status: 'needsAction',
    listId: 'l-empire-ops',
    listName: 'Operations',
    allocatedTime: 1800,
    humanOverride: 4,
    isSubtaskProxy: true,
    createdAt: 1_740_300_000_000,
    subtasks: [],
  },
];

/** Recorded work, so the focus log is never an empty slice in a baseline. */
export const FOCUS_LOG: FocusLogEntry[] = [
  {
    id: 'f-1',
    taskId: 't-incorporate',
    taskTitle: 'File the incorporation paperwork',
    projectId: 'p-empire',
    listId: 'l-empire-ops',
    seconds: 3300,
    startedAt: 1_773_120_000_000,
    endedAt: 1_773_123_300_000,
  },
  {
    id: 'f-2',
    taskId: 't-landing',
    taskTitle: 'Rewrite the landing page copy',
    projectId: 'p-empire',
    listId: 'l-empire-build',
    seconds: 5400,
    startedAt: 1_773_210_000_000,
    endedAt: 1_773_215_400_000,
  },
  {
    id: 'f-3',
    taskId: 't-invoices',
    taskTitle: 'Chase the outstanding invoices',
    projectId: 'p-empire',
    listId: 'l-empire-money',
    seconds: 2700,
    startedAt: 1_773_290_000_000,
    endedAt: 1_773_292_700_000,
  },
];

/** The exact string the harness writes to `localStorage[STORAGE_KEY]`. */
export function serializedStore(): string {
  return JSON.stringify({
    state: {
      sessionDuration: 14_400,
      taskTimeMemory: {
        'File the incorporation paperwork': 5400,
        'Rewrite the landing page copy': 9000,
      },
      projects: PROJECTS,
      taskLists: TASK_LISTS,
      backlogTasks: BACKLOG_TASKS,
      tasks: FOCUS_QUEUE,
      focusLog: FOCUS_LOG,
    },
    version: STORAGE_VERSION,
  });
}

// ─── The Trash ───────────────────────────────────────────────────────────────

/**
 * Zustand `persist` key and schema version for the *second* store — the Trash
 * keeps its own localStorage key and its own Firestore document, so that
 * deleting a project can never grow the one that Firebase caps at 1 MB (see
 * `src/lib/trashModel.ts`).
 */
export const TRASH_STORAGE_KEY = 'mutineer-os-trash';
const TRASH_STORAGE_VERSION = 1;

/**
 * Three deletions, spread across the thirty-day window so the panel shows a
 * different countdown on every row and all three kinds of entry at once.
 * `deletedAt` is literal epoch ms measured back from `FROZEN_NOW`
 * (1773288000000) — 2, 7 and 24 days — so "28d left" is the same string next
 * year as it is today.
 *
 * **The oldest is 24 days rather than 22, and the two days matter (item 9C).**
 * `/trash` colours a countdown amber inside a week and swaps that row's Restore
 * button to `frost`; at 22 days the entry has 8 days left, which is one day the
 * wrong side of it, so no baseline photographed either branch. At 24 it has 6,
 * and the three rows now read 28d / 23d / 6d — one amber, two not, which is the
 * distinction the countdown exists to make.
 *
 * Nothing here overlaps with the live dataset above: these are records that no
 * longer exist anywhere else, which is the whole point of them.
 */
export const TRASH_ENTRIES = [
  {
    id: 'tr-1',
    kind: 'task' as const,
    title: 'Book the photographer',
    deletedAt: 1_773_115_200_000, // 2 days before FROZEN_NOW
    projects: [],
    taskLists: [],
    backlogTasks: [
      {
        id: 't-photo',
        title: 'Book the photographer',
        description: 'Half day, interiors plus two portraits.',
        status: 'needsAction' as const,
        listId: 'l-studio-launch',
        listName: 'Launch Week',
        deadline: '2026-03-19T11:00',
        estimatedTime: 45,
        createdAt: 1_740_360_000_000,
        order: 1,
        subtasks: [],
      },
    ],
    ancestors: {
      project: PROJECTS[1],
      list: TASK_LISTS[7],
    },
    backrefs: { dependsOn: [], sharedListIds: [] },
  },
  {
    id: 'tr-2',
    kind: 'list' as const,
    title: 'Old marketing ideas',
    deletedAt: 1_772_683_200_000, // 7 days before FROZEN_NOW
    projects: [],
    taskLists: [{ id: 'l-old-marketing', title: 'Old marketing ideas', projectId: 'p-studio', order: 2 }],
    backlogTasks: [
      {
        id: 't-flyers',
        title: 'Print flyers for the launch',
        status: 'needsAction' as const,
        listId: 'l-old-marketing',
        listName: 'Old marketing ideas',
        createdAt: 1_740_365_000_000,
        order: 0,
        subtasks: [],
      },
      {
        id: 't-radio',
        title: 'Ask about local radio spots',
        status: 'needsAction' as const,
        listId: 'l-old-marketing',
        listName: 'Old marketing ideas',
        createdAt: 1_740_366_000_000,
        order: 1,
        subtasks: [],
      },
    ],
    ancestors: { project: PROJECTS[1] },
    backrefs: { dependsOn: [], sharedListIds: [] },
  },
  {
    id: 'tr-3',
    kind: 'project' as const,
    title: 'Consulting side line',
    deletedAt: 1_771_214_400_000, // 24 days before FROZEN_NOW — 6 days left, inside the amber week
    projects: [
      {
        id: 'p-consulting',
        name: 'Consulting side line',
        description: 'Wound down in February.',
       
        createdAt: 1_739_000_000_000,
        order: 3,
      },
    ],
    taskLists: [
      { id: 'l-consult-clients', title: 'Clients', projectId: 'p-consulting', order: 0 },
      { id: 'l-consult-admin', title: 'Admin', projectId: 'p-consulting', order: 1 },
    ],
    backlogTasks: [
      {
        id: 't-consult-wrap',
        title: 'Send the final invoices',
        status: 'completed' as const,
        listId: 'l-consult-admin',
        listName: 'Admin',
        createdAt: 1_739_100_000_000,
        order: 0,
        subtasks: [],
      },
      {
        id: 't-consult-handover',
        title: 'Hand over the two retainers',
        status: 'needsAction' as const,
        listId: 'l-consult-clients',
        listName: 'Clients',
        createdAt: 1_739_200_000_000,
        order: 0,
        subtasks: [],
      },
      {
        id: 't-consult-close',
        title: 'Close the separate bank account',
        status: 'needsAction' as const,
        listId: 'l-consult-admin',
        listName: 'Admin',
        createdAt: 1_739_300_000_000,
        order: 1,
        subtasks: [],
      },
    ],
    ancestors: {},
    backrefs: { dependsOn: [], sharedListIds: [] },
  },
] satisfies TrashEntry[];

/** The exact string the harness writes to `localStorage[TRASH_STORAGE_KEY]`. */
export function serializedTrash(): string {
  return JSON.stringify({
    state: { entries: TRASH_ENTRIES },
    version: TRASH_STORAGE_VERSION,
  });
}

// ─── The Archive ─────────────────────────────────────────────────────────────

/**
 * Zustand `persist` key and schema version for the *third* store — BUILD-11's
 * Archive, with its own localStorage key and its own Firestore document for
 * the Trash's reason (`src/lib/archiveModel.ts`).
 */
export const ARCHIVE_STORAGE_KEY = 'mutineer-os-archive';
const ARCHIVE_STORAGE_VERSION = 1;

/**
 * Four things put away, across two quarters so `/archive` draws two shelves
 * "by when": two projects (one finished, one abandoned half way, so the tile's
 * dots show both kinds) and two loose tasks (one from a project that is still
 * on the board, one from Action Steps, so "by project" draws three shelves).
 * `archivedAt` is literal epoch ms, noon UTC, all before `FROZEN_NOW`.
 *
 * Like the Trash's, none of these ids exists in the live dataset above — an
 * archived thing is, by definition, not on any board.
 */
export const ARCHIVE_ENTRIES = [
  {
    id: 'ar-1',
    kind: 'task' as const,
    title: 'Draft pricing page copy',
    archivedAt: 1_772_452_800_000, // 2 Mar 2026
    projects: [],
    taskLists: [],
    backlogTasks: [
      {
        id: 't-pricing-copy',
        title: 'Draft pricing page copy',
        status: 'needsAction' as const,
        listId: 'l-studio-launch',
        listName: 'Launch Week',
        estimatedTime: 45,
        createdAt: 1_767_614_400_000,
        order: 4,
        subtasks: [
          { id: 's-pricing-1', title: 'Three tiers', status: 'completed' as const },
          { id: 's-pricing-2', title: 'FAQ', status: 'needsAction' as const },
          { id: 's-pricing-3', title: 'Comparison table', status: 'needsAction' as const },
        ],
      },
    ],
    ancestors: { project: PROJECTS[1], list: TASK_LISTS[7] },
    backrefs: { dependsOn: [], sharedListIds: [] },
  },
  {
    id: 'ar-2',
    kind: 'task' as const,
    title: 'Renew trade licence',
    archivedAt: 1_770_724_800_000, // 10 Feb 2026
    projects: [],
    taskLists: [],
    backlogTasks: [
      {
        id: 't-trade-licence',
        title: 'Renew trade licence',
        status: 'needsAction' as const,
        listId: 'action',
        listName: 'Action Steps',
        estimatedTime: 30,
        createdAt: 1_765_800_000_000,
        order: 9,
        subtasks: [],
      },
    ],
    ancestors: { list: TASK_LISTS[0] },
    backrefs: { dependsOn: [], sharedListIds: [] },
  },
  {
    id: 'ar-3',
    kind: 'project' as const,
    title: 'Diwali gift boxes 2025',
    archivedAt: 1_768_392_000_000, // 14 Jan 2026
    projects: [
      {
        id: 'p-diwali',
        name: 'Diwali gift boxes 2025',
        description: 'Forty boxes for clients and suppliers.',
       
        icon: '🪔',
        createdAt: 1_756_814_400_000,
        order: 4,
      },
    ],
    taskLists: [
      { id: 'l-diwali-sourcing', title: 'Sourcing', projectId: 'p-diwali', order: 0 },
      { id: 'l-diwali-dispatch', title: 'Dispatch', projectId: 'p-diwali', order: 1 },
    ],
    backlogTasks: [
      {
        id: 't-diwali-supplier',
        title: 'Shortlist box suppliers',
        status: 'completed' as const,
        listId: 'l-diwali-sourcing',
        listName: 'Sourcing',
        createdAt: 1_756_814_400_000,
        completedAt: 1_758_369_600_000,
        order: 0,
        subtasks: [],
      },
      {
        id: 't-diwali-ribbon',
        title: 'Order ribbon and tissue',
        status: 'completed' as const,
        listId: 'l-diwali-sourcing',
        listName: 'Sourcing',
        createdAt: 1_756_814_400_000,
        completedAt: 1_759_752_000_000,
        order: 1,
        subtasks: [],
      },
      {
        id: 't-diwali-pack',
        title: 'Pack the forty boxes',
        status: 'completed' as const,
        listId: 'l-diwali-dispatch',
        listName: 'Dispatch',
        createdAt: 1_758_369_600_000,
        completedAt: 1_761_652_800_000,
        order: 0,
        subtasks: [],
      },
      {
        id: 't-diwali-courier',
        title: 'Book the courier pickups',
        status: 'completed' as const,
        listId: 'l-diwali-dispatch',
        listName: 'Dispatch',
        createdAt: 1_758_369_600_000,
        completedAt: 1_762_084_800_000,
        order: 1,
        subtasks: [],
      },
    ],
    ancestors: {},
    backrefs: { dependsOn: [], sharedListIds: [] },
  },
  {
    id: 'ar-4',
    kind: 'project' as const,
    title: 'Podcast pilot',
    archivedAt: 1_763_640_000_000, // 20 Nov 2025
    projects: [
      {
        id: 'p-podcast',
        name: 'Podcast pilot',
       
        createdAt: 1_759_752_000_000,
        order: 5,
      },
    ],
    taskLists: [{ id: 'l-pod-plan', title: 'Plan', projectId: 'p-podcast', order: 0 }],
    backlogTasks: [
      {
        id: 't-pod-name',
        title: 'Pick the show name',
        status: 'completed' as const,
        listId: 'l-pod-plan',
        listName: 'Plan',
        createdAt: 1_759_752_000_000,
        completedAt: 1_760_097_600_000,
        order: 0,
        subtasks: [],
      },
      {
        id: 't-pod-guests',
        title: 'List the first six guests',
        status: 'completed' as const,
        listId: 'l-pod-plan',
        listName: 'Plan',
        createdAt: 1_759_752_000_000,
        completedAt: 1_761_652_800_000,
        order: 1,
        subtasks: [],
      },
      {
        id: 't-pod-mic',
        title: 'Buy a second microphone',
        status: 'needsAction' as const,
        listId: 'l-pod-plan',
        listName: 'Plan',
        createdAt: 1_759_752_000_000,
        order: 2,
        subtasks: [],
      },
      {
        id: 't-pod-record',
        title: 'Record the pilot episode',
        status: 'needsAction' as const,
        listId: 'l-pod-plan',
        listName: 'Plan',
        createdAt: 1_759_752_000_000,
        order: 3,
        subtasks: [],
      },
      {
        id: 't-pod-edit',
        title: 'Edit and mix the pilot',
        status: 'needsAction' as const,
        listId: 'l-pod-plan',
        listName: 'Plan',
        createdAt: 1_759_752_000_000,
        order: 4,
        subtasks: [],
      },
    ],
    ancestors: {},
    backrefs: { dependsOn: [], sharedListIds: [] },
  },
] satisfies ArchiveEntry[];

/** The exact string the harness writes to `localStorage[ARCHIVE_STORAGE_KEY]`. */
export function serializedArchive(): string {
  return JSON.stringify({
    state: { entries: ARCHIVE_ENTRIES },
    version: ARCHIVE_STORAGE_VERSION,
  });
}

// ─── The Dashboard's hours (BIG-6, 29-1b) ────────────────────────────────────

/** `src/store/useDashboardStore.ts`'s persist key and version. */
export const DASHBOARD_STORAGE_KEY = 'base-dashboard';
const DASHBOARD_STORAGE_VERSION = 2;

/**
 * Only the hours and one hand-logged entry; the layout is left to the store's
 * default, as it was before this seed existed.
 *
 * **The override is load-bearing.** Today's hours and `sessionDuration` are
 * one number since 29-1b, and `sessionDuration` is mirrored from the
 * Dashboard's hours on every open. Without an override for `FROZEN_NOW`'s day
 * (a Thursday), the mirror would put the work session at his weekday default
 * of 12 hours, and every Set Deadlines and New Session baseline — taken
 * against the 4-hour window above — would move, some losing the overrun
 * they exist to photograph.
 */
export function serializedDashboard(): string {
  return JSON.stringify({
    state: {
      hours: {
        weekly: [21_600, 43_200, 43_200, 43_200, 43_200, 43_200, 21_600],
        overrides: { '2026-03-12': 14_400 },
      },
      timeLog: [
        { id: 'h-1', day: '2026-03-12', seconds: 2_700, label: 'Calls with the accountant', projectId: 'p-empire', at: 1_773_287_000_000 },
      ],
    },
    version: DASHBOARD_STORAGE_VERSION,
  });
}
