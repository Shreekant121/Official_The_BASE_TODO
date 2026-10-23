import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_LISTS, useStore, type Project, type Task, type TaskList } from '../src/store/useStore';
import { useTrashStore } from '../src/store/useTrashStore';
import { DEFAULT_PROJECT_ICON } from '../src/lib/projectIcon';
import { useSnapshotStore } from '../src/store/useSnapshotStore';
import { liveAgentStore, liveSnapshotCapture } from '../src/lib/agent/liveContext';
import {
  createList,
  createProject,
  deleteList,
  deleteProject,
  updateList,
  updateProject,
} from '../src/lib/agent/tools/boardTools';
import { DRAWERS, drawerOf, frontDoorKindOf, getTool } from '../src/lib/agent/tools/index';
import type { ToolContext, ToolDef } from '../src/lib/agent/types';
import { applyUndo, beginCapture, endCapture, type UndoPayload } from '../src/lib/agent/toolServer/undo';

/**
 * BUILD-3 — ATLAS CAN SHAPE THE BOARD, AND EVERY SHAPE CAN BE TAKEN BACK.
 *
 * The item's "done when" is three claims, and this file holds each against the
 * real Zustand store, the real capture ring and the real `applyDeletion`, with
 * the undo payload round-tripped through JSON exactly as it travels to Atlas's
 * log and back — the same arrangement `batchUndo.test.ts` uses for tasks:
 *
 * - a project is created with lists, and both are renamed;
 * - Revert on each of those puts the board back, and undoing a creation sends
 *   it to the Trash rather than leaving it standing;
 * - deleting either goes to the Trash with everything inside it, is held for a
 *   tap (`frontDoor`), and Revert fetches the whole thing back.
 */

const NOW = new Date('2026-09-16T11:00:00+05:30');

const PROJECTS: Project[] = [{ id: 'p-home', name: 'Home', createdAt: 0, order: 0 }];

const LISTS: TaskList[] = [
  ...DEFAULT_LISTS,
  { id: 'l-chores', title: 'Chores', projectId: 'p-home', order: 0 },
  { id: 'l-garden', title: 'Garden', projectId: 'p-home', order: 1 },
];

const BOARD: Task[] = [
  { id: 't-bins', title: 'Take the bins out', status: 'needsAction', listId: 'l-chores', listName: 'Chores', order: 0, subtasks: [], createdAt: 1 },
  { id: 't-dishes', title: 'Dishes', status: 'needsAction', listId: 'l-chores', listName: 'Chores', order: 1, subtasks: [], createdAt: 2 },
  { id: 't-roses', title: 'Prune the roses', status: 'needsAction', listId: 'l-garden', listName: 'Garden', order: 0, subtasks: [], createdAt: 3 },
];

beforeEach(() => {
  useStore.setState({
    projects: structuredClone(PROJECTS),
    taskLists: structuredClone(LISTS),
    backlogTasks: structuredClone(BOARD),
    tasks: [],
    focusLog: [],
  });
  useTrashStore.setState({ entries: [] });
  useSnapshotStore.getState().clearTurns();
});

/** Exactly what `mcp/index.ts` builds for one call. */
function contextFor(toolName: string, preview = false): ToolContext {
  return {
    snapshotHandle: beginCapture('turn-1', toolName),
    now: NOW,
    timezone: 'Asia/Kolkata',
    store: liveAgentStore,
    snapshots: liveSnapshotCapture,
    ...(preview ? { preview: true } : {}),
  };
}

/** One call, and the token it would hand Atlas, as it comes back off disk. */
async function run(tool: ToolDef, args: Record<string, unknown>) {
  const ctx = contextFor(tool.name);
  const result = await tool.execute(args, ctx);
  const payload = endCapture(ctx.snapshotHandle);
  return { result, token: JSON.parse(JSON.stringify(payload)) as UndoPayload | null };
}

const state = () => useStore.getState();
const projectNamed = (name: string) => state().projects.find((project) => project.name === name);
const listsOf = (projectId: string) => state().taskLists.filter((list) => list.projectId === projectId);

describe('creating and renaming', () => {
  it('creates a project with its lists in one call, painted and ordered like the New Project sheet', async () => {
    const { result } = await run(createProject, {
      projects: [{ name: 'Studio Launch', lists: ['Research', 'Design', 'Ship'] }],
    });

    expect(result.ok).toBe(true);
    const project = projectNamed('Studio Launch');
    expect(project).toMatchObject({ icon: DEFAULT_PROJECT_ICON, order: 1, createdAt: NOW.getTime() });
    expect(listsOf(project!.id).map((list) => [list.title, list.order])).toEqual([
      ['Research', 0],
      ['Design', 1],
      ['Ship', 2],
    ]);
  });

  it('undoes a created project by sending it and its lists to the Trash, and says it worked', async () => {
    const { token } = await run(createProject, { projects: [{ name: 'Studio Launch', lists: ['Research', 'Design'] }] });
    expect(token?.entries).toHaveLength(3);

    const report = applyUndo(token);

    expect(report.ok).toBe(true);
    expect(projectNamed('Studio Launch')).toBeUndefined();
    expect(state().taskLists.map((list) => list.title)).not.toContain('Research');
    // The lists went with the project. They are gone because the undo worked,
    // and the sentence must not say they were skipped.
    expect(report.summary).not.toMatch(/no longer exists/);
    expect(useTrashStore.getState().entries).toHaveLength(1);
    expect(useTrashStore.getState().entries[0]).toMatchObject({ kind: 'project', title: 'Studio Launch' });
  });

  it('adds lists to an existing project, and undoing that removes only those lists', async () => {
    const { result, token } = await run(createList, { project: 'Home', titles: ['Repairs', 'Chores'] });

    expect(result.ok).toBe(true);
    expect(result.summary).toMatch(/already has a list/);
    expect(listsOf('p-home').map((list) => list.title)).toEqual(['Chores', 'Garden', 'Repairs']);

    applyUndo(token);
    expect(listsOf('p-home').map((list) => list.title)).toEqual(['Chores', 'Garden']);
    expect(state().backlogTasks).toHaveLength(3);
  });

  it('renames a project and puts the old name back on revert', async () => {
    const { result, token } = await run(updateProject, { projectIds: ['Home'], name: 'House' });

    expect(result.summary).toBe('Renamed the project "Home" to "House".');
    expect(state().projects[0]).toMatchObject({ name: 'House' });

    applyUndo(token);
    expect(state().projects[0]).toMatchObject({ name: 'Home' });
  });

  it('renames a list the way the board does — the tasks’ fallback name follows — and reverts both', async () => {
    const { token } = await run(updateList, { listIds: ['Chores'], title: 'Housework' });

    expect(state().taskLists.find((list) => list.id === 'l-chores')?.title).toBe('Housework');
    expect(state().backlogTasks.filter((task) => task.listId === 'l-chores').map((task) => task.listName)).toEqual([
      'Housework',
      'Housework',
    ]);

    applyUndo(token);
    expect(state().taskLists.find((list) => list.id === 'l-chores')?.title).toBe('Chores');
    expect(state().backlogTasks.filter((task) => task.listId === 'l-chores').map((task) => task.listName)).toEqual([
      'Chores',
      'Chores',
    ]);
  });

  it('moves a list into another project with its tasks, and back on revert', async () => {
    useStore.setState({ projects: [...state().projects, { id: 'p-work', name: 'Work', createdAt: 1, order: 1 }] });

    const { token } = await run(updateList, { listIds: ['l-garden'], project: 'Work' });
    expect(state().taskLists.find((list) => list.id === 'l-garden')).toMatchObject({ projectId: 'p-work', order: 0 });
    expect(state().backlogTasks.find((task) => task.id === 't-roses')?.listId).toBe('l-garden');

    applyUndo(token);
    expect(state().taskLists.find((list) => list.id === 'l-garden')).toMatchObject({ projectId: 'p-home', order: 1 });
  });

  it('BIG-2: creates a project inside another, moves one in and out, and reverts the move', async () => {
    const created = await run(createProject, { projects: [{ name: 'Roof', inside: 'Home' }] });
    expect(created.result.summary).toBe('Created the project "Roof" inside "Home", with no lists in it yet.');
    const roof = state().projects.find((p) => p.name === 'Roof')!;
    expect(roof.parentId).toBe('p-home');

    useStore.setState({ projects: [...state().projects, { id: 'p-work', name: 'Work', createdAt: 1, order: 1 }] });
    const { result, token } = await run(updateProject, { projectIds: ['Work'], inside: 'Home' });
    expect(result.summary).toBe('Updated "Work": moved it inside "Home".');
    expect(state().projects.find((p) => p.id === 'p-work')?.parentId).toBe('p-home');

    // A project can never go inside something it holds.
    const refused = await run(updateProject, { projectIds: ['Home'], inside: 'Work' });
    expect(refused.result.ok).toBe(false);
    expect(state().projects.find((p) => p.id === 'p-home')?.parentId).toBeUndefined();

    applyUndo(token);
    expect(state().projects.find((p) => p.id === 'p-work')?.parentId).toBeUndefined();

    const out = await run(updateProject, { projectIds: ['Roof'], inside: '' });
    expect(out.result.summary).toBe('Updated "Roof": moved it to the top level.');
    expect(state().projects.find((p) => p.id === roof.id)?.parentId).toBeUndefined();
  });

  it('never reaches a project by part of its name, and never touches a built-in list', async () => {
    const { result } = await run(updateProject, { projectIds: ['Hom'], name: 'Nope' });
    expect(result.ok).toBe(false);
    expect(state().projects[0].name).toBe('Home');

    const builtIn = await run(updateList, { listIds: ['Action Steps'], title: 'Do now' });
    expect(builtIn.result.ok).toBe(false);
    expect(builtIn.token).toBeNull();
    expect(state().taskLists.find((list) => list.id === 'action')?.title).toBe('Action Steps');
  });
});

describe('deleting', () => {
  it('both deletes wait for a tap, and are reported to Atlas as undoable rather than irreversible', () => {
    for (const name of ['delete_project', 'delete_list']) {
      const tool = getTool(name);
      expect(tool?.frontDoor).toBe(true);
      expect(frontDoorKindOf(tool!)).toBe('undoable');
      expect(drawerOf(name)).toBe('projects');
    }
    expect(frontDoorKindOf(getTool('publish_share_link')!)).toBe('irreversible');
    expect(frontDoorKindOf(getTool('create_project')!)).toBeUndefined();
    expect(DRAWERS.projects.tools).toEqual(['create_project', 'update_project', 'create_list', 'update_list', 'delete_project', 'delete_list']);
  });

  it('previews what a project delete would take and writes nothing', async () => {
    const before = structuredClone(state().backlogTasks);
    const ctx = contextFor('delete_project', true);
    const result = await deleteProject.execute({ projectIds: ['Home'] }, ctx);
    const token = endCapture(ctx.snapshotHandle);

    expect(result.ok).toBe(true);
    expect(result.summary).toBe(
      'Delete the project "Home" — its 2 lists and 3 tasks go with it. It stays in the Trash for 30 days, and Revert on the action log puts it back.',
    );
    expect(result.data).toMatchObject({ targets: [{ type: 'project', id: 'p-home', title: 'Home' }] });
    expect(token).toBeNull();
    expect(state().projects).toHaveLength(1);
    expect(state().backlogTasks).toEqual(before);
    expect(useTrashStore.getState().entries).toHaveLength(0);
  });

  it('says "no tasks" rather than "0 tasks" for a project of empty lists', async () => {
    // Seen on the first live run: "its 2 lists and 0 tasks go with it".
    await run(createProject, { projects: [{ name: 'Empty', lists: ['A', 'B'] }] });
    const ctx = contextFor('delete_project', true);
    const preview = await deleteProject.execute({ projectIds: ['Empty'] }, ctx);
    endCapture(ctx.snapshotHandle);
    expect(preview.summary).toContain('Delete the project "Empty" — its 2 lists, with no tasks in them, go with it.');

    const { result } = await run(deleteProject, { projectIds: ['Empty'] });
    expect(result.summary).toMatch(/^Deleted the project "Empty" and its 2 lists, with no tasks in them\. It stays/);
  });

  it('deletes a project with everything inside it into one Trash entry, and Revert brings all of it back', async () => {
    const { result, token } = await run(deleteProject, { projectIds: ['p-home'] });

    expect(result.ok).toBe(true);
    expect(state().projects).toHaveLength(0);
    expect(state().taskLists.map((list) => list.id)).toEqual(DEFAULT_LISTS.map((list) => list.id));
    expect(state().backlogTasks).toHaveLength(0);
    expect(useTrashStore.getState().entries).toHaveLength(1);

    const report = applyUndo(token);

    expect(report).toEqual({ ok: true, summary: 'put back "Home".' });
    expect(state().projects.map((project) => project.id)).toEqual(['p-home']);
    expect(listsOf('p-home').map((list) => list.id).sort()).toEqual(['l-chores', 'l-garden']);
    expect(state().backlogTasks.map((task) => task.id).sort()).toEqual(['t-bins', 't-dishes', 't-roses']);
    expect(useTrashStore.getState().entries).toHaveLength(0);
  });

  it('deletes a list with its tasks, and Revert brings it back into its project', async () => {
    const { result, token } = await run(deleteList, { listIds: ['Garden'] });

    expect(result.summary).toBe(
      'Deleted the list "Garden" and its 1 task. It stays in the Trash for 30 days, and Revert on the action log puts it back.',
    );
    expect(state().taskLists.some((list) => list.id === 'l-garden')).toBe(false);
    expect(state().backlogTasks.some((task) => task.id === 't-roses')).toBe(false);

    expect(applyUndo(token).ok).toBe(true);
    expect(state().taskLists.find((list) => list.id === 'l-garden')?.projectId).toBe('p-home');
    expect(state().backlogTasks.find((task) => task.id === 't-roses')?.listId).toBe('l-garden');
  });

  it('refuses a built-in list in the preview, so the tray never offers it', async () => {
    const ctx = contextFor('delete_list', true);
    const result = await deleteList.execute({ listIds: ['backburner'] }, ctx);
    endCapture(ctx.snapshotHandle);

    expect(result.ok).toBe(false);
    expect(state().taskLists.some((list) => list.id === 'backburner')).toBe(true);
  });
});
