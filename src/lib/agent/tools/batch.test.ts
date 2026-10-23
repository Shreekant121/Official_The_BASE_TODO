/**
 * Every tool acts on many things (item 13D).
 *
 * WHAT THIS FILE IS FOR, AND WHAT IT DELIBERATELY IS NOT
 * -------------------------------------------------------
 * **The measure is round trips, not milliseconds.** Every tool body here is an
 * in-memory store read and already takes single-digit ms, so a timing budget
 * would be a test that can never fail. What is worth asserting is the thing
 * that actually changed: *"mark these five as done"* is **one call**, a call
 * with two bad ids among ten still completes the eight, and the failure says
 * what to do instead of *"try again"*.
 *
 * The board below is Shreekant's, the same one `taskTools.test.ts` uses and for
 * the same reason: an answer of "not found" here is a failure rather than a
 * fixture gap. Two tasks are called "Send 30 emails" on purpose — that is why
 * ids cannot leave the tool result, and why a batch's sentence has to name
 * titles while its `data` names ids.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { addToToday, listToday, removeFromToday } from './queueTools';
import { completeTask, createTask, getTask, updateTask } from './taskTools';
import { addSubtask, listSubtasks, removeSubtask, updateSubtask } from './subtaskTools';
import { deleteTask } from './trashTools';
import { allTools } from './index';
import type { AgentStore, AgentStoreState, ToolContext, ToolResult } from '../types';
import type { Task, TaskList, Project } from '../../../store/useStore';
import type { TrashEntry } from '../../trashModel';

const NOW = new Date('2026-09-08T11:00:00+05:30');
const TIMEZONE = 'Asia/Kolkata';

const TASKS: Array<[id: string, title: string, listId: string]> = [
  ['t-oil', 'Oil Hair', 'l-selfcare'],
  ['t-repair', 'Repair the chair', 'l-selfcare'],
  ['t-ca', 'Email the CA', 'l-admin'],
  ['t-website', 'Maintain the website', 'l-content'],
  ['t-waitlist', 'Get waitlist', 'l-marketing'],
  ['t-emails-level', 'Send 30 emails', 'l-marketing'],
  ['t-books', 'Books to read', 'l-skills'],
];

function harness() {
  const state: AgentStoreState = {
    projects: [{ id: 'p-level', name: 'Level Ai', createdAt: 1, order: 0 } as Project],
    taskLists: [
      { id: 'l-selfcare', title: 'Self Care', order: 0 } as TaskList,
      { id: 'l-admin', title: 'Admin', order: 1 } as TaskList,
      { id: 'l-content', title: 'Website Content', order: 2 } as TaskList,
      { id: 'l-marketing', title: 'Marketing', projectId: 'p-level', order: 3 } as TaskList,
      { id: 'l-skills', title: 'Learning', order: 4 } as TaskList,
      { id: 'action', title: 'Action Steps', order: 5 } as TaskList,
    ],
    backlogTasks: TASKS.map(([id, title, listId], order) => ({
      id,
      title,
      status: 'needsAction',
      listId,
      order,
      subtasks: [],
    }) as Task),
    tasks: [],
  };

  const trash: TrashEntry[] = [];
  /** Every id a tool captured before writing, in order. The undo payload, in miniature. */
  const captured: string[] = [];

  const store: AgentStore = {
    getState: () => ({ ...state, backlogTasks: [...state.backlogTasks], tasks: [...state.tasks] }),
    addBacklogTask: (task) => {
      state.backlogTasks = [task, ...state.backlogTasks];
    },
    updateBacklogTask: (id, updates) => {
      state.backlogTasks = state.backlogTasks.map((task) => (task.id === id ? { ...task, ...updates } : task));
    },
    updateFocusTask: (id, updates) => {
      state.tasks = state.tasks.map((task) => (task.id === id ? { ...task, ...updates } : task));
    },
    setFocusQueue: (tasks) => {
      state.tasks = tasks;
    },
    updateTaskList: () => {},
    updateProject: () => {},
    deleteBacklogTask: (id) => {
      const task = state.backlogTasks.find((candidate) => candidate.id === id);
      if (!task) return;
      state.backlogTasks = state.backlogTasks.filter((candidate) => candidate.id !== id);
      trash.push({ id: `e-${id}`, kind: 'task', title: task.title, deletedAt: NOW.getTime(), backlogTasks: [task] } as TrashEntry);
    },
    trashEntries: () => trash,
    restoreFromTrash: () => null,
    addProject: () => {},
    addTaskList: () => {},
    renameTaskList: () => {},
    deleteProject: () => {},
    deleteTaskList: () => {},
  };

  const ctx: ToolContext = {
    snapshotHandle: { id: 'turn-1' } as ToolContext['snapshotHandle'],
    now: NOW,
    timezone: TIMEZONE,
    store,
    snapshots: {
      captureTask: (_handle, taskId) => captured.push(taskId),
      captureList: () => {},
      captureProject: () => {},
      captureEvent: () => {},
    },
  };

  return { ctx, state, captured, trash };
}

function dataOf<T>(result: ToolResult): T {
  return result.data as T;
}

// ── One call, one think ─────────────────────────────────────────────────────

describe('"mark these five as done" is one call', () => {
  it('completes every id it was given', async () => {
    const { ctx, state } = harness();

    const result = await completeTask.execute(
      { taskIds: ['t-oil', 't-repair', 't-ca', 't-website', 't-waitlist'] },
      ctx,
    );

    expect(result.ok).toBe(true);
    expect(state.backlogTasks.filter((task) => task.status === 'completed')).toHaveLength(5);
    expect(dataOf<{ done: number }>(result).done).toBe(5);
  });

  it('names them in the sentence, so the chip reads as five and not as one', async () => {
    const { ctx } = harness();
    const result = await completeTask.execute({ taskIds: ['t-oil', 't-repair'] }, ctx);
    expect(result.summary).toContain('Oil Hair');
    expect(result.summary).toContain('Repair the chair');
  });

  it('creates several tasks in one call, each filed where it was told', async () => {
    const { ctx, state } = harness();

    const result = await createTask.execute(
      { tasks: [{ title: 'Buy milk' }, { title: 'Buy bread', list: 'Admin' }, 'Buy eggs'] },
      ctx,
    );

    expect(result.ok).toBe(true);
    expect(dataOf<{ done: number }>(result).done).toBe(3);
    const titles = state.backlogTasks.map((task) => task.title);
    expect(titles).toEqual(expect.arrayContaining(['Buy milk', 'Buy bread', 'Buy eggs']));
    // A bare string is a title — the shape most of these calls actually have.
    expect(state.backlogTasks.find((task) => task.title === 'Buy eggs')).toBeDefined();
    expect(state.backlogTasks.find((task) => task.title === 'Buy bread')?.listId).toBe('l-admin');
  });

  it('adds several steps under one parent in one call, in the order given', async () => {
    const { ctx, state } = harness();

    const result = await addSubtask.execute(
      { parentId: 't-ca', steps: ['Collect receipts', 'Sign form 26AS', { title: 'Post it' }] },
      ctx,
    );

    expect(result.ok).toBe(true);
    const steps = state.backlogTasks.find((task) => task.id === 't-ca')?.subtasks ?? [];
    expect(steps.map((step) => step.title)).toEqual(['Collect receipts', 'Sign form 26AS', 'Post it']);
  });

  it('queues several tasks at increasing positions, not all at the first one', async () => {
    /*
     * The bug this exists to stop is specific and silent. `setFocusQueue`
     * replaces the whole array, so a batch that read the queue once and
     * appended to that copy would have every task land at position 1 and each
     * write throw away the one before it: four ids in, one task queued, and a
     * cheerful summary saying four.
     */
    const { ctx, state } = harness();

    const result = await addToToday.execute({ taskIds: ['t-oil', 't-ca', 't-website'] }, ctx);

    expect(result.ok).toBe(true);
    expect(state.tasks.map((task) => task.id)).toEqual(['t-oil', 't-ca', 't-website']);
    const queued = await listToday.execute({}, ctx);
    expect(dataOf<{ queue: unknown[] }>(queued).queue).toHaveLength(3);
  });

  it('applies one change to a whole list of tasks', async () => {
    const { ctx, state } = harness();

    const result = await updateTask.execute({ taskIds: ['t-oil', 't-ca'], deadline: '2026-09-11' }, ctx);

    expect(result.ok).toBe(true);
    for (const id of ['t-oil', 't-ca']) {
      expect(state.backlogTasks.find((task) => task.id === id)?.deadline).toContain('2026-09-11');
    }
  });
});

// ── Partial success ─────────────────────────────────────────────────────────

describe('a batch with bad ids does the rest and says which failed', () => {
  it('completes the good ones and reports the bad ones', async () => {
    const { ctx, state } = harness();

    const result = await completeTask.execute(
      { taskIds: ['t-oil', 'not-a-task', 't-ca', 'also-not-a-task', 't-website'] },
      ctx,
    );

    // Three landed. All-or-nothing would have spent the whole round trip on
    // one bad id, which is the worst possible use of the one just saved.
    expect(result.ok).toBe(true);
    expect(state.backlogTasks.filter((task) => task.status === 'completed').map((task) => task.id)).toEqual([
      't-oil',
      't-ca',
      't-website',
    ]);

    const data = dataOf<{ done: number; failed: { id: string; reason: string }[] }>(result);
    expect(data.done).toBe(3);
    expect(data.failed.map((failure) => failure.id)).toEqual(['not-a-task', 'also-not-a-task']);
    expect(result.summary).toContain('2 did not happen');
  });

  it('fails the call only when nothing at all landed', async () => {
    const { ctx } = harness();
    const result = await completeTask.execute({ taskIds: ['nope', 'also-nope'] }, ctx);

    expect(result.ok).toBe(false);
    // "Completed 0 tasks" reads as a success at a glance and is not one.
    expect(result.summary).toContain('Nothing changed');
  });

  it('diagnoses rather than inviting a retry of the same id', async () => {
    const { ctx } = harness();
    const result = await completeTask.execute({ taskIds: ['t-oil', 'nope'] }, ctx);

    // Shreekant's rule: "ask it to think what could be wrong". A wrong id
    // retried ten times fails ten times; the fix is another search.
    expect(result.summary).toContain('search by name');
    expect(result.summary).not.toContain('try again');
  });

  it('keeps failing ids out of the sentence and in the data', async () => {
    /*
     * ITEM 13C's RULE, WHICH A BATCH MAKES EASY TO BREAK.
     *
     * `summary` is what `components/chat/TurnBlock.tsx` renders as the chip's detail line, so an
     * id quoted there is an id on Shreekant's screen. The model still needs to
     * know *which* of the ids it sent came back empty, or it cannot do anything
     * useful about it — so the two halves are split rather than one of them
     * dropped.
     */
    const { ctx } = harness();
    const results = [
      await completeTask.execute({ taskIds: ['t-oil', 'secret-id-1'] }, ctx),
      await updateTask.execute({ taskIds: ['t-ca', 'secret-id-2'], emergencyBoost: 3 }, ctx),
      await deleteTask.execute({ taskIds: ['t-books', 'secret-id-3'] }, ctx),
      await addToToday.execute({ taskIds: ['t-repair', 'secret-id-4'] }, ctx),
      await getTask.execute({ taskIds: ['t-website', 'secret-id-5'] }, ctx),
      await removeSubtask.execute({ subtaskIds: ['secret-id-6'] }, ctx),
    ];

    for (const [index, result] of results.entries()) {
      expect(result.summary).not.toContain(`secret-id-${index + 1}`);
      for (const [id] of TASKS) expect(result.summary).not.toContain(id);
    }
    // …and it is in the data, which is what the model reads.
    const failed = dataOf<{ failed: { id: string }[] }>(results[0]).failed;
    expect(failed.map((failure) => failure.id)).toEqual(['secret-id-1']);
  });

  it('reports a partly-impossible batch honestly rather than as a clean success', async () => {
    const { ctx, state } = harness();
    await addSubtask.execute({ parentId: 't-ca', steps: ['Collect receipts'] }, ctx);
    const stepId = (state.backlogTasks.find((task) => task.id === 't-ca')?.subtasks ?? [])[0].id;

    // A step is not a task, so it cannot go to the Trash — one of the two is a
    // real deletion and the other is a refusal with the right tool named.
    const result = await deleteTask.execute({ taskIds: ['t-books', stepId] }, ctx);

    expect(result.ok).toBe(true);
    expect(result.summary).toContain('Books to read');
    expect(result.summary).toContain('remove_subtask');
  });
});

// ── The singular a model reaches for anyway ─────────────────────────────────

describe('the singular still works, because refusing it costs a round trip', () => {
  it('reads taskId as a one-element taskIds', async () => {
    const { ctx, state } = harness();
    const result = await completeTask.execute({ taskId: 't-oil' }, ctx);

    expect(result.ok).toBe(true);
    expect(state.backlogTasks.find((task) => task.id === 't-oil')?.status).toBe('completed');
  });

  it('does the same for every other singular a model might reach for', async () => {
    const { ctx, state } = harness();

    expect((await getTask.execute({ taskId: 't-ca' }, ctx)).ok).toBe(true);
    expect((await addToToday.execute({ taskId: 't-ca' }, ctx)).ok).toBe(true);
    expect((await removeFromToday.execute({ taskId: 't-ca' }, ctx)).ok).toBe(true);
    expect((await createTask.execute({ task: { title: 'From a singular' } }, ctx)).ok).toBe(true);
    expect((await addSubtask.execute({ parentId: 't-ca', step: 'One step' }, ctx)).ok).toBe(true);
    expect(state.backlogTasks.find((task) => task.title === 'From a singular')).toBeDefined();

    const stepId = (state.backlogTasks.find((task) => task.id === 't-ca')?.subtasks ?? [])[0].id;
    expect((await updateSubtask.execute({ subtaskId: stepId, status: 'completed' }, ctx)).ok).toBe(true);
    expect((await listSubtasks.execute({ taskId: 't-ca' }, ctx)).ok).toBe(true);
    expect((await removeSubtask.execute({ subtaskId: stepId }, ctx)).ok).toBe(true);
  });

  it('still refuses a key that is not a parameter at all', async () => {
    const { ctx } = harness();
    const result = await completeTask.execute({ taskIdentifier: 't-oil' }, ctx);

    // The landing pad is one rule about plurals, not a licence to guess.
    expect(result.ok).toBe(false);
    expect(result.summary).toContain('has no parameter');
  });

  it('reads a stringified list as one id rather than failing on it', async () => {
    const { ctx, state } = harness();
    const result = await completeTask.execute({ taskIds: 't-oil' }, ctx);
    expect(result.ok).toBe(true);
    expect(state.backlogTasks.find((task) => task.id === 't-oil')?.status).toBe('completed');
  });

  it('collapses a duplicate rather than treating it as an error', async () => {
    const { ctx } = harness();
    const result = await completeTask.execute({ taskIds: ['t-oil', 't-oil'] }, ctx);
    expect(dataOf<{ done: number }>(result).done).toBe(1);
  });
});

// ── The ceiling ─────────────────────────────────────────────────────────────

describe('the cap refuses rather than silently truncating', () => {
  it('says how to split the call instead of doing half of it', async () => {
    const { ctx, state } = harness();
    const before = state.backlogTasks.filter((task) => task.status === 'completed').length;

    const result = await completeTask.execute(
      { taskIds: Array.from({ length: 51 }, (_, index) => `t-${index}`) },
      ctx,
    );

    expect(result.ok).toBe(false);
    expect(result.summary).toContain('batches of 50');
    // Nothing at all was written, which is the whole point of a refusal.
    expect(state.backlogTasks.filter((task) => task.status === 'completed')).toHaveLength(before);
  });

  it('caps whole-task reads far lower, because a full task is not a row', async () => {
    const { ctx } = harness();
    const result = await getTask.execute({ taskIds: Array.from({ length: 11 }, (_, index) => `t-${index}`) }, ctx);

    expect(result.ok).toBe(false);
    expect(result.summary).toContain('at most 10');
  });
});

// ── Uniformly ───────────────────────────────────────────────────────────────

describe('every tool that names things takes a list of them', () => {
  it('declares no bare singular id parameter anywhere on the surface', () => {
    /*
     * The settled rule, asserted rather than trusted: *"not the ones where it
     * matters — a surface where some tools batch and some do not is one the
     * model has to remember correctly, and it will not."*
     *
     * `parentId` on `add_subtask` is the one deliberate exception and is named
     * here so that adding a second one is a decision rather than a slip: the
     * many-things in that call are the steps being created, and every step in
     * one call goes under the same parent.
     *
     * BUILD-17 made it three, on the same reasoning: `move_task`'s
     * `beforeTaskId` and `afterTaskId`. The many-things there are the tasks
     * being moved, and they travel as one block beside ONE task — "put these
     * beside those" has no meaning. They end in `Id` rather than being called
     * `before`/`after` so `mcp/consistency.ts`'s `idsIn` guards them.
     *
     * 29-2d1 made it four: `update_task`'s `eventId`. The many-things are the
     * tasks, and "these are due before the marathon" names one event for all
     * of them. It keeps the name every event tool gives that id.
     */
    const singularIds = (allowed: Set<string>): string[] =>
      allTools.flatMap((tool) =>
        Object.entries(tool.parametersSchema.properties ?? {})
          .filter(([key, schema]) => !allowed.has(key) && /(^|[a-z])[iI]d$/.test(key) && schema.type === 'string')
          .map(([key]) => `${tool.name}.${key}`),
      );

    expect(singularIds(new Set(['parentId', 'beforeTaskId', 'afterTaskId', 'eventId']))).toEqual([]);
    // …and the check can actually fail: allow nothing and the one deliberate
    // exception is what it finds. Without this line a broken pattern would
    // pass this test silently for ever.
    expect(singularIds(new Set())).toEqual(['update_task.eventId', 'move_task.beforeTaskId', 'move_task.afterTaskId', 'add_subtask.parentId']);
  });

  it('gives every batching tool the same failure vocabulary', async () => {
    const { ctx } = harness();
    const calls: ToolResult[] = [
      await completeTask.execute({ taskIds: ['nope'] }, ctx),
      await deleteTask.execute({ taskIds: ['nope'] }, ctx),
      await addToToday.execute({ taskIds: ['nope'] }, ctx),
      await getTask.execute({ taskIds: ['nope'] }, ctx),
      await listSubtasks.execute({ taskIds: ['nope'] }, ctx),
    ];

    for (const result of calls) {
      expect(result.ok).toBe(false);
      expect(result.summary).toContain('Nothing changed');
    }
  });
});

// ── The snapshot, which is what makes one undo possible ─────────────────────

describe('a batch captures every item it touched, into one turn', () => {
  let bench: ReturnType<typeof harness>;
  beforeEach(() => {
    bench = harness();
  });

  it('captures each task before writing it, and only the ones it wrote', async () => {
    /*
     * The capture is the undo. `mcp/undo.ts` opens one capture per *tool call*
     * and lifts the entries out afterwards, so a batch of five puts five
     * entries in one payload and Shreekant gets one Revert — which is the
     * settled rule, and `mcp/batchUndo.test.ts` proves it end to end against
     * the real store. What this asserts is the half that lives in the tools:
     * that every item snapshots before it is touched (D6), including the fourth
     * one in a batch.
     */
    await completeTask.execute({ taskIds: ['t-oil', 'not-a-task', 't-ca', 't-website'] }, bench.ctx);

    expect(bench.captured).toEqual(['t-oil', 't-ca', 't-website']);
  });

  it('captures nothing for a batch that could not do anything', async () => {
    await completeTask.execute({ taskIds: ['nope', 'also-nope'] }, bench.ctx);
    // An undo offering to reverse a change that never happened is worse than
    // no undo at all — `endCapture` returns null on an empty turn.
    expect(bench.captured).toEqual([]);
  });
});

// ── Fields beside the list (FIX-13) ─────────────────────────────────────────

describe('fields sent beside the list rather than inside an entry', () => {
  /*
   * gemma4:e4b's call from FIX-12's check, verbatim but for the title. Before
   * FIX-13 this was refused with "Accepted parameters: tasks", and the retry
   * that refusal invited was the bare title — a task made with no deadline.
   */
  const GEMMA_CALL = {
    deadline: '2026-09-09T17:00',
    emergencyBoost: 3,
    estimatedTime: 20,
    humanOverride: 6,
    tasks: [{ title: 'Call the plumber' }],
  };

  it('reads them as the one task\'s, and says so', async () => {
    const { ctx, state } = harness();
    const result = await createTask.execute(GEMMA_CALL, ctx);

    expect(result.ok).toBe(true);
    const made = state.backlogTasks.find((task) => task.title === 'Call the plumber');
    expect(made).toMatchObject({ deadline: '2026-09-09T17:00', emergencyBoost: 3, estimatedTime: 20, humanOverride: 6 });
    expect(result.summary).toContain('"deadline", "emergencyBoost", "estimatedTime" and "humanOverride" were sent beside "tasks"');
    expect(dataOf<{ movedIntoEntry: string[] }>(result).movedIntoEntry).toEqual(['deadline', 'emergencyBoost', 'estimatedTime', 'humanOverride']);
  });

  it('does the same for a bare-string entry, a singular, and no list at all', async () => {
    const { ctx, state } = harness();

    expect((await createTask.execute({ tasks: 'Buy milk', list: 'Admin' }, ctx)).ok).toBe(true);
    expect((await createTask.execute({ task: { title: 'Buy bread' }, deadline: '2026-09-10' }, ctx)).ok).toBe(true);
    expect((await createTask.execute({ title: 'Buy eggs', estimatedTime: 5 }, ctx)).ok).toBe(true);

    expect(state.backlogTasks.find((task) => task.title === 'Buy milk')?.listId).toBe('l-admin');
    expect(state.backlogTasks.find((task) => task.title === 'Buy bread')?.deadline).toContain('2026-09-10');
    expect(state.backlogTasks.find((task) => task.title === 'Buy eggs')?.estimatedTime).toBe(5);
  });

  it('refuses them beside several tasks, makes nothing, and says where they go', async () => {
    /*
     * The safer half of the decision. A deadline beside three tasks may be one
     * task's or all three's; copying it onto each invents two deadlines, and a
     * refusal costs one round trip.
     */
    const { ctx, state } = harness();
    const before = state.backlogTasks.length;

    const result = await createTask.execute({ deadline: '2026-09-09', tasks: ['Buy milk', 'Buy bread', 'Buy eggs'] }, ctx);

    expect(result.ok).toBe(false);
    expect(state.backlogTasks).toHaveLength(before);
    expect(refusalParts(result.summary)).toEqual({ names: true, counts: true, nests: true });
  });

  it('refuses the same field sent twice with two values rather than picking one', async () => {
    const { ctx, state } = harness();
    const before = state.backlogTasks.length;

    const result = await createTask.execute({ deadline: '2026-09-09', tasks: [{ title: 'Buy milk', deadline: '2026-09-12' }] }, ctx);

    expect(result.ok).toBe(false);
    expect(result.summary).toContain('"deadline" was sent twice');
    expect(state.backlogTasks).toHaveLength(before);
    // The same value twice is not a contradiction.
    expect((await createTask.execute({ deadline: '2026-09-09', tasks: [{ title: 'Buy milk', deadline: '2026-09-09' }] }, ctx)).ok).toBe(true);
  });

  it('closes the same hole in add_subtask\'s steps', async () => {
    const { ctx, state } = harness();

    const one = await addSubtask.execute({ parentId: 't-ca', deadline: '2026-09-09T17:00', allocatedTime: 15, steps: ['Collect receipts'] }, ctx);
    expect(one.ok).toBe(true);
    expect(one.summary).toContain('sent beside "steps"');
    const steps = () => state.backlogTasks.find((task) => task.id === 't-ca')?.subtasks ?? [];
    expect(steps()[0]).toMatchObject({ title: 'Collect receipts', deadline: '2026-09-09T17:00', allocatedTime: 15 });

    const several = await addSubtask.execute({ parentId: 't-ca', allocatedTime: 15, steps: ['Sign form', 'Post it'] }, ctx);
    expect(several.ok).toBe(false);
    expect(several.summary).toContain('nothing was made');
    expect(steps()).toHaveLength(1);
  });

  it('reads a null inside an entry as left out, as it is at the top level', async () => {
    // gemma's two-task call, run 3 of FIX-13's check.
    const { ctx, state } = harness();
    const result = await createTask.execute(
      { tasks: [{ title: 'Buy printer ink', estimatedTime: 10 }, { title: 'Renew the domain', estimatedTime: null, humanOverride: 7 }] },
      ctx,
    );
    expect(result.ok).toBe(true);
    expect(dataOf<{ done: number }>(result).done).toBe(2);
    expect(state.backlogTasks.find((task) => task.title === 'Renew the domain')?.humanOverride).toBe(7);
  });

  it('still refuses a key that is no task field at all', async () => {
    const { ctx } = harness();
    const result = await createTask.execute({ dead_line: '2026-09-09', tasks: ['Buy milk'] }, ctx);
    expect(result.ok).toBe(false);
    expect(result.summary).toContain('has no parameter "dead_line"');
  });

  it('leaves the tools that apply one change to many ids alone', async () => {
    // update_task's fields ARE top-level; only a creator's list opts in.
    const { ctx, state } = harness();
    expect((await updateTask.execute({ taskIds: ['t-oil'], estimatedTime: 10 }, ctx)).summary).not.toContain('sent beside');
    expect(state.backlogTasks.find((task) => task.id === 't-oil')?.estimatedTime).toBe(10);
  });
});

/** What a several-entries refusal has to say: the field, why it cannot be placed, and the shape that works. */
function refusalParts(summary: string) {
  return {
    names: summary.includes('"deadline"'),
    counts: summary.includes('3 entries'),
    nests: summary.includes('{"tasks": [{"title": "…", "deadline": …}'),
  };
}
