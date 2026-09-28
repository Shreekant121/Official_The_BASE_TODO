/**
 * Dev-only fixture for `/log`, used by the screenshot harness
 * (`scripts/screenshots.ts`).
 *
 * WHY THIS EXISTS
 * ---------------
 * Every line on that screen is a JSON file on Shreekant's laptop, fetched from
 * Atlas over Tailscale, and the harness aborts everything off its own origin.
 * Without this there is exactly one photographable state — "the laptop is
 * asleep" — and the screen has no baseline showing a single entry.
 *
 * It is a *rendering* fixture: it contacts no laptop, writes nothing, and
 * `LogPage` hides Revert entirely while it is in force, because a revert with
 * no Atlas behind it would be a button that lies. **The eighth of its kind**,
 * after `devAuth`, `devShareFixture`, `devChatFixture`, `devModelFixture`,
 * `devHostFixture`, `devCatalogFixture` and `devSkillsFixture`, and it is kept
 * out of the shipped bundle the same way: every branch behind a bare
 * `import.meta.env.DEV`, which Vite folds to `false` in a production build,
 * and `scripts/check-shots-bypass.mjs` greps `dist/` for the marker. **Do not
 * read that flag into a variable first**, and **do not lift anything below to
 * module scope** — a module-level `const` is initialised whether or not the
 * guarded function is reachable, which is how `devShareFixture`'s marker
 * survived into `dist/` the first time.
 *
 * WHAT THE ENTRIES ARE, AND WHY THEY ARE THE MOCKUP'S
 * -----------------------------------------------------
 * `design-system/screens/log.html`'s own seeded turns, re-shaped into what
 * Atlas actually returns: raw tool calls, because this screen renders its rows
 * with `describeToolCall` rather than printing a sentence somebody wrote. That
 * is the point of drawing it with the design's content — the baseline can be
 * diffed against the mockup by eye.
 *
 * **The mail rows are gone and that is not a trim.** There is no mail until
 * item 22, the filter row is built from the drawers that actually appear, and
 * seeding a `mail` drawer would photograph a filter chip for a capability that
 * does not exist. What replaces them is the one thing item 13 *did* ship
 * through the front door: a published share link, `frontDoor: true`, drawn
 * with its "no undo" pill and the footer that says revert cannot reach it.
 *
 * The five turns cover what the screen has to be able to draw: a turn with
 * several writes and a live Revert, a read-only turn, a turn already reverted,
 * a front-door act tapped through, and a turn Atlas escalated. Yesterday's
 * section exists so the day grouping has something to group.
 */
import type { AtlasLogDay, AtlasLogEntry, AtlasLogIndex, AtlasLogTurn } from './atlas/client';

type EntrySeed = Omit<AtlasLogEntry, 'id' | 'undoneAt' | 'noUndoReason'> &
  Partial<Pick<AtlasLogEntry, 'undoneAt' | 'noUndoReason'>>;

export function devLogFixture(): AtlasLogIndex | null {
  if (!import.meta.env.DEV) return null;
  if (!/__dev-log-fixture__/.test(window.location.search)) return null;

  /*
   * Timestamps as literals around `FROZEN_NOW` — `scripts/fixture.ts` pins the
   * harness's clock to 12 March 2026 — so a capture does not depend on the day
   * it was taken, and so "today" in the fixture is the day the app thinks it
   * is. The screen names its first section from `today` below rather than from
   * this browser's clock, which is what makes that possible at all.
   */
  const TODAY = '2026-03-12';
  const YESTERDAY = '2026-03-11';

  let counter = 0;
  const entry = (seed: EntrySeed): AtlasLogEntry => {
    counter += 1;
    return { id: `e${counter}`, undoneAt: null, noUndoReason: null, ...seed };
  };

  const turns: (Omit<AtlasLogTurn, 'entries'> & { entries: AtlasLogEntry[] })[] = [
    {
      id: 't1',
      at: `${TODAY}T14:22:00+05:30`,
      actor: 'atlas',
      ask: 'Add a task to chase Rahul on invoice #114, due Thursday 11am, and put it on today.',
      conversationId: 'c1',
      conversationTitle: 'Empire invoices — Rahul',
      model: 'gemma4:e4b',
      provider: 'ollama',
      costRupees: 0,
      revertedAt: null,
      entries: [
        entry({
          at: `${TODAY}T14:22:04+05:30`,
          tool: 'create_task',
          drawer: 'tasks',
          /* ITEM 13D: every tool takes a list, and the log draws its rows with
             the same `describeToolCall` the transcript uses — so these are the
             batched shapes, and `durationMs` is the number the log used to
             throw away on the way in. */
          args: { tasks: [{ title: 'Chase Rahul on invoice #114', list: 'Action Steps', deadline: 'Thursday 11am' }] },
          ok: true,
          summary: 'Created "Chase Rahul on invoice #114" in Action Steps.',
          data: { done: 1, tasks: [{ listName: 'Action Steps', deadline: '2026-03-19T11:00' }] },
          durationMs: 3,
          wrote: true,
          frontDoor: false,
          undoable: true,
        }),
        entry({
          at: `${TODAY}T14:22:05+05:30`,
          tool: 'update_task',
          drawer: 'tasks',
          args: { taskIds: ['task-9f31c2'], allocatedTime: 15 },
          ok: true,
          summary: 'Updated "Chase Rahul on invoice #114": allocatedTime.',
          data: { done: 1, tasks: [{ taskId: 'task-9f31c2', changed: ['allocatedTime'], unwritable: [] }] },
          durationMs: 2,
          wrote: true,
          frontDoor: false,
          undoable: true,
        }),
        entry({
          at: `${TODAY}T14:22:06+05:30`,
          tool: 'add_to_today',
          drawer: 'queue',
          args: { taskIds: ['task-9f31c2'] },
          ok: true,
          summary: 'Added "Chase Rahul on invoice #114" to today\u2019s queue at position 3.',
          data: { done: 1, tasks: [{ taskId: 'task-9f31c2', alreadyQueued: false, position: 3, completed: false }] },
          durationMs: 1,
          wrote: true,
          frontDoor: false,
          undoable: true,
        }),
      ],
    },
    {
      id: 't2',
      at: `${TODAY}T13:58:00+05:30`,
      actor: 'atlas',
      ask: "What's overdue in Shreekant Empire?",
      conversationId: 'c1',
      conversationTitle: 'Empire invoices — Rahul',
      model: 'gemini-flash-latest',
      provider: 'gemini',
      costRupees: 1.2,
      revertedAt: null,
      entries: [
        entry({
          at: `${TODAY}T13:58:02+05:30`,
          tool: 'search_tasks',
          drawer: 'tasks',
          args: { query: 'invoice', project: 'Shreekant Empire' },
          durationMs: 6,
          ok: true,
          summary: 'Found 2 matches of 34 scanned.',
          data: { totalMatches: 2 },
          wrote: false,
          frontDoor: false,
          undoable: false,
        }),
        entry({
          at: `${TODAY}T13:58:40+05:30`,
          tool: 'read_note',
          drawer: 'memory',
          args: { path: 'people/rahul-mehta.md' },
          durationMs: 5,
          ok: true,
          summary: 'Read people/rahul-mehta.md — 1,412 bytes, last edited by hand on 19 Aug.',
          wrote: false,
          frontDoor: false,
          undoable: false,
        }),
      ],
    },
    {
      id: 't3',
      at: `${TODAY}T11:04:00+05:30`,
      actor: 'atlas',
      ask: 'Turn the two things from that email into tasks.',
      conversationId: 'c2',
      conversationTitle: 'Morning triage',
      model: 'gemma4:e4b',
      provider: 'ollama',
      costRupees: 0,
      revertedAt: `${TODAY}T11:19:00+05:30`,
      entries: [
        entry({
          at: `${TODAY}T11:04:31+05:30`,
          tool: 'create_task',
          drawer: 'tasks',
          args: { tasks: [{ title: 'Send the signed NDA back to Anita' }] },
          ok: true,
          summary: 'Created "Send the signed NDA back to Anita" in Action Steps.',
          data: { done: 1, tasks: [{ listName: 'Action Steps' }] },
          durationMs: 4,
          wrote: true,
          frontDoor: false,
          undoable: false,
          undoneAt: `${TODAY}T11:19:00+05:30`,
        }),
        entry({
          at: `${TODAY}T11:04:32+05:30`,
          tool: 'create_task',
          drawer: 'tasks',
          args: { tasks: [{ title: 'Confirm the studio walkthrough slot' }] },
          ok: true,
          summary: 'Created "Confirm the studio walkthrough slot" in Action Steps.',
          data: { done: 1, tasks: [{ listName: 'Action Steps' }] },
          durationMs: 3,
          wrote: true,
          frontDoor: false,
          undoable: false,
          undoneAt: `${TODAY}T11:19:00+05:30`,
        }),
      ],
    },
    {
      id: 't4',
      at: `${TODAY}T09:12:00+05:30`,
      actor: 'you',
      ask: null,
      conversationId: 'c3',
      conversationTitle: 'Studio lease terms',
      model: null,
      provider: null,
      costRupees: 0,
      revertedAt: null,
      entries: [
        entry({
          at: `${TODAY}T09:12:40+05:30`,
          tool: 'publish_share_link',
          drawer: 'system',
          args: { ids: ['proj-studio'], type: 'project' },
          ok: true,
          summary: 'Published "Studio Launch" — 3 lists and 14 tasks — at /s/9c2f41ba7d1e. Anyone with that link can read it.',
          data: {
            done: 1,
            targets: [
              {
                type: 'project',
                id: 'proj-studio',
                title: 'Studio Launch',
                extent: '3 lists and 14 tasks',
                shareId: '9c2f41ba7d1e',
                path: '/s/9c2f41ba7d1e',
                alreadyPublished: false,
              },
            ],
          },
          durationMs: 12,
          wrote: true,
          frontDoor: true,
          undoable: false,
          noUndoReason: 'This went out of the house. The log records it; it cannot recall it.',
        }),
      ],
    },
  ];

  const yesterday: AtlasLogTurn[] = [
    {
      id: 't5',
      at: `${YESTERDAY}T17:40:00+05:30`,
      actor: 'atlas',
      ask: 'Delete the duplicate lease task.',
      conversationId: 'c3',
      conversationTitle: 'Studio lease terms',
      model: 'gemma4:e4b',
      provider: 'ollama',
      costRupees: 0,
      revertedAt: null,
      entries: [
        entry({
          at: `${YESTERDAY}T17:41:02+05:30`,
          tool: 'delete_task',
          drawer: 'tasks',
          args: { taskIds: ['task-1a09'] },
          ok: true,
          summary: 'Deleted "Sign the lease". It is in the Trash for 30 days — restore_from_trash puts it back.',
          data: {
            done: 1,
            entryIds: ['e-1a09'],
            tasks: [{ taskId: 'task-1a09', entryId: 'e-1a09', title: 'Sign the lease', subtaskCount: 0 }],
          },
          durationMs: 9,
          wrote: true,
          frontDoor: false,
          undoable: true,
        }),
      ],
    },
  ];

  const days: AtlasLogDay[] = [
    { day: TODAY, turns },
    { day: YESTERDAY, turns: yesterday },
  ];

  const todayEntries = turns.flatMap((turn) => turn.entries);

  return {
    days,
    today: TODAY,
    counts: {
      entries: todayEntries.length,
      undoable: todayEntries.filter((item) => item.undoable).length,
      spent: turns.reduce((total, turn) => total + (turn.costRupees ?? 0), 0),
      frontDoor: [...todayEntries, ...yesterday.flatMap((turn) => turn.entries)].filter((item) => item.frontDoor).length,
    },
    undoRetentionDays: 30,
  };
}
