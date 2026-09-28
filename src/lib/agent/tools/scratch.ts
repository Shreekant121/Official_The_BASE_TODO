import type { Project, Task, TaskList } from '../../../store/useStore';
import type { TurnHandle } from '../../../store/useSnapshotStore';
import type { TrashEntry } from '../../trashModel';
import type { AgentStore, AgentStoreState, SnapshotCapture, ToolArgs, ToolContext } from '../types';
import { runTool, toToolDeclarations, allTools } from './index';

/**
 * Dev harness: drives every registered tool against an in-memory fake store,
 * with no Zustand, no React, no browser and no model involved. Not imported by
 * the app — run it directly:
 *
 *   npx tsx src/lib/agent/tools/scratch.ts
 *
 * It exists to prove three things a type-checker cannot: that each tool does
 * what its description claims, that every mutation snapshots what it is about
 * to touch *before* touching it, and that the destructive boundary (D3) holds.
 */

const TIMEZONE = 'Asia/Kolkata';
/** 2026-08-07 15:12 in Asia/Kolkata. Pinned so the output is reproducible. */
const NOW = new Date('2026-08-07T09:42:00.000Z');

const PROJECTS: Project[] = [
  { id: 'p-empire', name: 'Shreekant Empire', color: '#7c3aed', createdAt: 0, order: 0 },
];

const LISTS: TaskList[] = [
  { id: 'action', title: 'Action Steps' },
  { id: 'backburner', title: 'Backburner' },
  { id: 'reference', title: 'Reference Materials' },
  { id: 'l-empire-build', title: 'Build', projectId: 'p-empire' },
];

const BACKLOG: Task[] = [
  {
    id: 't-ca',
    title: 'File the CA paperwork',
    status: 'needsAction',
    listId: 'action',
    listName: 'Action Steps',
    deadline: '2026-08-05T18:00',
    estimatedTime: 45,
    subtasks: [
      { id: 's-ca-docs', title: 'Collect last quarter receipts', status: 'needsAction' },
      { id: 's-ca-sign', title: 'Sign form 26AS', status: 'needsAction' },
    ],
    createdAt: 1,
  },
  {
    id: 't-landing',
    title: 'Rewrite the landing page copy',
    status: 'in-progress',
    listId: 'l-empire-build',
    listName: 'Build',
    deadline: '2026-08-09T18:00',
    subtasks: [],
    createdAt: 2,
  },
  {
    id: 't-invoices',
    title: 'Chase outstanding invoices',
    status: 'needsAction',
    listId: 'l-empire-build',
    listName: 'Build',
    subtasks: [],
    createdAt: 3,
  },
  {
    id: 't-reading',
    title: 'Read the context engineering article',
    status: 'completed',
    listId: 'backburner',
    listName: 'Backburner',
    completedAt: 100,
    subtasks: [],
    createdAt: 4,
  },
];

interface Capture {
  tool: string;
  taskId: string;
  /** The entity as it stood at capture time — `null` when it did not exist yet. */
  prior: Task | null;
}

function createHarness() {
  const state: AgentStoreState = {
    projects: structuredClone(PROJECTS),
    taskLists: structuredClone(LISTS),
    backlogTasks: structuredClone(BACKLOG),
    tasks: [],
  };

  const trash: TrashEntry[] = [];
  const captures: Capture[] = [];
  let currentTool = '(none)';

  const findAnywhere = (id: string): Task | null =>
    state.backlogTasks.find((t) => t.id === id) ??
    state.tasks.find((t) => t.id === id) ??
    (state.backlogTasks.flatMap((t) => t.subtasks ?? []).find((s) => s.id === id) as Task | undefined) ??
    null;

  const store: AgentStore = {
    getState: () => state,
    addBacklogTask: (task) => {
      state.backlogTasks = [task, ...state.backlogTasks];
    },
    updateBacklogTask: (id, updates) => {
      const top = state.backlogTasks.find((t) => t.id === id);
      if (top) {
        Object.assign(top, updates);
        return;
      }
      for (const task of state.backlogTasks) {
        const sub = task.subtasks?.find((s) => s.id === id);
        if (sub) Object.assign(sub, updates);
      }
    },
    updateFocusTask: (id, updates) => {
      const queued = state.tasks.find((t) => t.id === id);
      if (queued) Object.assign(queued, updates);
    },
    setFocusQueue: (tasks) => {
      state.tasks = tasks;
    },

    /* Item 13's two container writes, for `shareTools.ts`. A plain assign, as
       everything in this harness is: what the tools need is that the field
       comes back on the next read. */
    updateTaskList: (id, updates) => {
      const list = state.taskLists.find((l) => l.id === id);
      if (list) Object.assign(list, updates);
    },
    updateProject: (id, updates) => {
      const project = state.projects.find((p) => p.id === id);
      if (project) Object.assign(project, updates);
    },

    /*
     * The fake's deletion is a plain removal, not `cascadeDelete` — this
     * harness exists to exercise the *tools*, and reproducing the cascade here
     * would mean a second implementation of it to keep in step with the real
     * one. What the tools need from a store is that a delete removes the task
     * and produces a restorable entry; that is what this does.
     */
    deleteBacklogTask: (id) => {
      const task = state.backlogTasks.find((t) => t.id === id);
      if (!task) return;
      state.backlogTasks = state.backlogTasks.filter((t) => t.id !== id);
      state.tasks = state.tasks.filter((t) => t.id !== id);
      trash.unshift({
        id: crypto.randomUUID(),
        kind: 'task',
        title: task.title,
        // `NOW`, not the wall clock: the harness's output is meant to be
        // reproducible, and `daysLeft` is measured against `ctx.now`.
        deletedAt: NOW.getTime(),
        projects: [],
        taskLists: [],
        backlogTasks: [task],
        ancestors: {},
        backrefs: { dependsOn: [], sharedListIds: [] },
      });
    },
    /* BUILD-3's project and list surface. Plain inserts and a plain removal,
       for the reason the task delete above gives. */
    addProject: (project) => {
      state.projects = [...state.projects, project];
    },
    addTaskList: (list) => {
      state.taskLists = [...state.taskLists, list];
    },
    renameTaskList: (id, title) => {
      const list = state.taskLists.find((l) => l.id === id);
      if (list) list.title = title;
    },
    deleteProject: (id) => {
      const project = state.projects.find((p) => p.id === id);
      if (!project) return;
      const lists = state.taskLists.filter((l) => l.projectId === id);
      const listIds = new Set(lists.map((l) => l.id));
      const tasks = state.backlogTasks.filter((t) => !!t.listId && listIds.has(t.listId));
      state.projects = state.projects.filter((p) => p.id !== id);
      state.taskLists = state.taskLists.filter((l) => !listIds.has(l.id));
      state.backlogTasks = state.backlogTasks.filter((t) => !tasks.includes(t));
      trash.unshift({
        id: crypto.randomUUID(), kind: 'project', title: project.name, deletedAt: NOW.getTime(),
        projects: [project], taskLists: lists, backlogTasks: tasks, ancestors: {}, backrefs: { dependsOn: [], sharedListIds: [] },
      });
    },
    deleteTaskList: (id) => {
      const list = state.taskLists.find((l) => l.id === id);
      if (!list) return;
      const tasks = state.backlogTasks.filter((t) => t.listId === id);
      state.taskLists = state.taskLists.filter((l) => l.id !== id);
      state.backlogTasks = state.backlogTasks.filter((t) => !tasks.includes(t));
      trash.unshift({
        id: crypto.randomUUID(), kind: 'list', title: list.title, deletedAt: NOW.getTime(),
        projects: [], taskLists: [list], backlogTasks: tasks, ancestors: {}, backrefs: { dependsOn: [], sharedListIds: [] },
      });
    },

    trashEntries: () => trash,
    restoreFromTrash: (entryId) => {
      const index = trash.findIndex((entry) => entry.id === entryId);
      if (index === -1) return null;
      const [entry] = trash.splice(index, 1);
      for (const task of entry.backlogTasks) {
        if (!state.backlogTasks.some((t) => t.id === task.id)) state.backlogTasks.push(task);
      }
      return { next: { projects: state.projects, taskLists: state.taskLists, backlogTasks: state.backlogTasks }, reroutedTaskIds: [] };
    },
  };

  const snapshots: SnapshotCapture = {
    captureTask: (_handle, taskId) => {
      const prior = findAnywhere(taskId);
      captures.push({ tool: currentTool, taskId, prior: prior ? structuredClone(prior) : null });
    },
    captureList: () => {},
    captureProject: () => {},
  };

  const handle: TurnHandle = { id: 'turn-scratch', label: 'scratch run', startedAt: NOW.getTime() };
  const ctx: ToolContext = { snapshotHandle: handle, now: NOW, timezone: TIMEZONE, store, snapshots };

  return {
    state,
    captures,
    ctx,
    setTool: (name: string) => {
      currentTool = name;
    },
  };
}

const harness = createHarness();

function show(value: unknown): string {
  return JSON.stringify(value, null, 2)
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n');
}

async function call(name: string, args: ToolArgs): Promise<unknown> {
  harness.setTool(name);
  const before = harness.captures.length;
  const result = await runTool(name, args, harness.ctx);
  const captured = harness.captures.slice(before);

  console.log(`\n── ${name}(${JSON.stringify(args)})`);
  console.log(`   ok: ${result.ok}`);
  console.log(`   summary: ${result.summary}`);
  if (result.data !== undefined) console.log(show(result.data));
  for (const capture of captured) {
    const prior = capture.prior
      ? `title="${capture.prior.title}" status=${capture.prior.status} deadline=${capture.prior.deadline ?? '—'}`
      : 'nothing (task did not exist yet — a revert reports it as created)';
    console.log(`   snapshot captured before write: ${capture.taskId} → ${prior}`);
  }
  return result.data;
}

function heading(text: string) {
  console.log(`\n\n════ ${text} ${'═'.repeat(Math.max(0, 60 - text.length))}`);
}

async function main() {
  heading('registry');
  console.log(`   ${allTools.length} tools: ${allTools.map((t) => t.name).join(', ')}`);
  console.log(`   mutating: ${allTools.filter((t) => t.mutates).map((t) => t.name).join(', ')}`);
  console.log(`   turn clock: ${NOW.toISOString()} in ${TIMEZONE}`);

  heading('search_tasks');
  await call('search_tasks', { query: 'CA' });
  await call('search_tasks', { query: 'landing page copy' });
  await call('search_tasks', { project: 'Shreekant Empire' });
  await call('search_tasks', { overdue: true });
  await call('search_tasks', { hasDeadline: false });
  await call('search_tasks', { status: 'completed' });
  await call('search_tasks', { query: 'quarterly tax return' });
  await call('search_tasks', { list: 'Nonexistent List' });

  heading('get_task');
  await call('get_task', { taskIds: ['t-ca'] });
  await call('get_task', { taskIds: ['s-ca-sign'] });
  await call('get_task', { taskIds: ['not-a-real-id'] });
  // ITEM 13D - several at once, and a batch that is half wrong.
  await call('get_task', { taskIds: ['t-ca', 't-landing', 'not-a-real-id'] });
  // The singular a model reaches for anyway: read as a one-element list.
  await call('get_task', { taskId: 't-invoices' });

  heading('create_task');
  const created = (await call('create_task', {
    tasks: [{ title: 'Book the auditor call', deadline: 'tomorrow', estimatedTime: 30, priority: 'high' }],
  })) as { tasks: { id: string }[] };
  await call('create_task', { tasks: [{ title: 'Draft Q3 plan', list: 'Build', deadline: '2026-08-20T09:30' }] });
  await call('create_task', { tasks: [{ title: 'Bad date', deadline: 'next thursday-ish' }] });
  await call('create_task', { title: 'Wrong arg name', dueDate: '2026-08-20' });
  // ITEM 13D - three in one call: a bare string, a filed one, and a bad list.
  await call('create_task', { tasks: ['Buy milk', { title: 'Buy bread', list: 'Backburner' }, { title: 'Nowhere', list: 'No Such List' }] });

  heading('update_task');
  await call('update_task', { taskIds: ['t-invoices'], deadline: '2026-08-14', priority: 'urgent' });
  await call('update_task', { taskIds: ['t-landing'], clear: ['deadline'] });
  await call('update_task', { taskIds: ['s-ca-docs'], title: 'Collect FY26 Q1 receipts', description: 'not storable on a subtask' });
  await call('update_task', { taskIds: ['t-invoices'] });
  await call('update_task', { taskIds: ['t-invoices'], status: 'completed' });
  // ITEM 13D - one change, a whole list of tasks. And a rename, which is the
  // one field a batch refuses because it would name them all the same thing.
  await call('update_task', { taskIds: ['t-invoices', 't-landing'], priority: 'low' });
  await call('update_task', { taskIds: ['t-invoices', 't-landing'], title: 'Same name for both' });

  heading('complete_task');
  // ITEM 13D - "I finished these" is one call, and a bad id in it costs only
  // itself. The old shape was one call each: twelve thinks for twelve tasks.
  await call('complete_task', { taskIds: ['t-ca'] });
  await call('complete_task', { taskIds: ['t-ca'] });
  await call('complete_task', { taskIds: ['t-invoices', 'not-a-real-id', 't-landing'] });
  await call('complete_task', { taskIds: ['nothing', 'nothing-either'] });

  heading('queue tools (D15 — the focus queue is not the backlog)');
  await call('list_today', {});
  // ITEM 13D - three into the queue in one call, at three positions. Reading
  // the queue once and appending to that copy would have queued only the last.
  await call('add_to_today', { taskIds: ['t-landing', created.tasks[0].id, 's-ca-sign'] });
  await call('add_to_today', { taskIds: ['t-landing'] });
  await call('list_today', {});
  await call('remove_from_today', { taskIds: ['t-landing', 't-invoices'] });
  await call('list_today', {});

  heading('item 9 — the rest of the task detail card');
  await call('update_task', {
    taskIds: ['t-landing'],
    assignee: 'Priya',
    allocatedTime: 90,
    reminderMinutes: 30,
    recurrenceRule: 'FREQ=WEEKLY;BYDAY=mo,th',
    links: [{ title: 'Current copy', url: 'https://example.com/landing' }, { url: 'https://example.com/brief' }],
    hiddenFromShare: true,
  });
  await call('update_task', { taskIds: ['t-landing'], recurrenceRule: 'every other tuesday' });
  await call('update_task', { taskIds: ['t-landing'], links: [{ title: 'No address' }] });
  await call('update_task', { taskIds: ['t-landing'], clear: ['recurrenceRule', 'assignee'] });

  heading('item 9 — dependencies, and the three ways they are refused');
  await call('update_task', { taskIds: ['t-invoices'], dependsOn: ['t-landing'] });
  await call('update_task', { taskIds: ['t-invoices'], dependsOn: ['t-invoices'] });
  await call('update_task', { taskIds: ['t-invoices'], dependsOn: ['t-nonexistent'] });
  await call('update_task', { taskIds: ['t-landing'], dependsOn: ['t-invoices'] });

  heading('item 9 — subtasks, nested');
  // ITEM 13D - "break this into steps" is one call. It used to be one per step,
  // each a whole round trip to use the id the previous one had just returned.
  const steps = (await call('add_subtask', {
    parentId: 't-invoices',
    steps: ['Pull the ledger', 'Chase the two oldest', { title: 'Write it up', deadline: 'tomorrow' }],
  })) as { subtasks: { subtaskId: string }[] };
  const step = steps.subtasks[0];
  await call('add_subtask', { parentId: step.subtaskId, steps: [{ title: 'Export as CSV', deadline: 'tomorrow' }] });
  await call('add_subtask', { parentId: 'not-a-real-id', steps: ['Orphan'] });
  await call('list_subtasks', { taskIds: ['t-invoices'] });
  await call('update_subtask', { subtaskIds: [step.subtaskId], status: 'completed', humanOverride: 7 });
  await call('update_subtask', { subtaskIds: steps.subtasks.map((entry) => entry.subtaskId), status: 'completed' });
  await call('update_subtask', { subtaskIds: [step.subtaskId], clear: ['deadline'] });
  await call('list_subtasks', { taskIds: ['t-invoices'] });
  await call('remove_subtask', { subtaskIds: steps.subtasks.map((entry) => entry.subtaskId) });
  await call('list_subtasks', { taskIds: ['t-invoices'] });

  heading('item 9 — D3 reversed: delete goes to the Trash, and comes back');
  const deleted = (await call('delete_task', { taskIds: ['t-reading'] })) as { entryIds: string[] };
  await call('list_trash', {});
  // A step is not a task, so this one is refused with the right tool named -
  // and in a batch it fails alone rather than taking a good id down with it.
  await call('delete_task', { taskIds: ['s-ca-sign'] });
  await call('restore_from_trash', { entryIds: ['not-an-entry'] });
  await call('restore_from_trash', { entryIds: deleted.entryIds });
  await call('list_trash', {});

  heading('BUILD-3 — projects and lists');
  const launch = (await call('create_project', {
    projects: [{ name: 'Studio Launch', lists: ['Research', 'Design', 'research'], color: 'violet' }, 'Shreekant Empire'],
  })) as { projects: { id: string; lists: { id: string }[] }[] };
  await call('create_list', { project: 'Studio Launch', titles: ['Ship', 'Design'] });
  await call('create_list', { project: 'Launch', titles: ['Nowhere'] });
  await call('update_project', { projectIds: ['Studio Launch'], name: 'Studio Launch v2', description: 'The autumn one' });
  await call('update_project', { projectIds: ['p-empire', 'Studio Launch v2'], name: 'Same for both' });
  await call('update_list', { listIds: ['Research'], title: 'Discovery' });
  await call('update_list', { listIds: ['action'], title: 'Do now' });
  await call('update_list', { listIds: ['Discovery', 'Ship'], project: 'Shreekant Empire' });
  await call('create_task', { tasks: [{ title: 'Interview five users', list: 'Design' }] });
  // The front door's preview: what the approval card would say, nothing written.
  harness.ctx.preview = true;
  await call('delete_project', { projectIds: [launch.projects[0].id, 'No Such Project'] });
  await call('delete_list', { listIds: ['Backburner'] });
  harness.ctx.preview = false;
  await call('delete_list', { listIds: ['Discovery', 'Reference Materials'] });
  await call('delete_project', { projectIds: [launch.projects[0].id] });
  await call('list_trash', {});

  heading('final store state');
  for (const task of harness.state.backlogTasks) {
    console.log(
      `   ${task.id.padEnd(12)} ${task.status.padEnd(12)} ${(task.deadline ?? '—').padEnd(18)} ${task.title}`,
    );
  }
  console.log(`   focus queue: ${harness.state.tasks.map((t) => t.title).join(' | ') || '(empty)'}`);
  console.log(`   snapshots captured this run: ${harness.captures.length} (${harness.captures.map((c) => c.taskId).join(', ')})`);

  heading('tool declarations (what the model is told, before the adapter touches them)');
  console.log(show(toToolDeclarations().map((d) => ({ name: d.name, parameters: Object.keys(d.parameters.properties ?? {}) }))));
  console.log('\n   full declaration for create_task:');
  console.log(show(toToolDeclarations().find((d) => d.name === 'create_task')));
}

main().catch((err) => {
  console.error(err);
});
