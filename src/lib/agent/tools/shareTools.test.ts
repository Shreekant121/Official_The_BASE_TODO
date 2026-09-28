/**
 * The share tools, and the guard that makes the front door structural
 * (item 13, DESIGN.md §5.2).
 *
 * The safety claim is not that these tools behave well — Atlas holds
 * `publish_share_link` before it ever runs. It is that **the holding cannot be
 * forgotten**: the tool declares `frontDoor`, the registry throws at import if
 * an irreversible name is registered without it, and the preview path writes
 * nothing while still saying what it would do.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  allTools,
  fallbackTools,
  frontDoorTools,
  IRREVERSIBLE_TOOL_NAMES,
  mcpTools,
} from './index';
import { publishShareLink, revokeShareLink } from './shareTools';
import type { AgentStore, AgentStoreState, ToolContext } from '../types';
import type { Project, Task, TaskList } from '../../../store/useStore';

const NOW = new Date('2026-03-12T09:30:00+05:30');

function harness(over: Partial<AgentStoreState> = {}) {
  const state: AgentStoreState = {
    projects: [{ id: 'p1', name: 'Studio Launch', color: '#8b5cf6', createdAt: 1, order: 0 } as Project],
    taskLists: [{ id: 'l1', title: 'Build', projectId: 'p1', order: 0 } as TaskList],
    backlogTasks: [
      { id: 't1', title: 'Sign the lease', status: 'needsAction', listId: 'l1', listName: 'Build', order: 0, subtasks: [] } as Task,
    ],
    tasks: [],
    ...over,
  };

  const store: AgentStore = {
    getState: () => state,
    addBacklogTask: (task) => {
      state.backlogTasks = [task, ...state.backlogTasks];
    },
    updateBacklogTask: (id, updates) => {
      const found = state.backlogTasks.find((task) => task.id === id);
      if (found) Object.assign(found, updates);
    },
    updateFocusTask: () => {},
    setFocusQueue: () => {},
    updateTaskList: (id, updates) => {
      const found = state.taskLists.find((list) => list.id === id);
      if (found) Object.assign(found, updates);
    },
    updateProject: (id, updates) => {
      const found = state.projects.find((project) => project.id === id);
      if (found) Object.assign(found, updates);
    },
    deleteBacklogTask: () => {},
    trashEntries: () => [],
    restoreFromTrash: () => null,
    addProject: () => {},
    addTaskList: () => {},
    renameTaskList: () => {},
    deleteProject: () => {},
    deleteTaskList: () => {},
  };

  const ctx = (preview = false): ToolContext => ({
    snapshotHandle: { id: 'turn', label: 'test', startedAt: NOW.getTime() },
    now: NOW,
    timezone: 'Asia/Kolkata',
    store,
    ...(preview ? { preview: true } : {}),
    snapshots: { captureTask: () => {}, captureList: () => {}, captureProject: () => {} },
  });

  return { state, ctx };
}

describe('the registry guard', () => {
  it('marks publish as a front-door act and revoke as an ordinary one', () => {
    // Shreekant's call, with the alternative in front of him: taking a link
    // down only ever reduces what is visible.
    expect(publishShareLink.frontDoor).toBe(true);
    expect(revokeShareLink.frontDoor).toBeUndefined();
    // BUILD-3 put the project and list deletes behind the same door — for
    // their reach, not their permanence (`CASCADING_DELETE_TOOL_NAMES`).
    expect(frontDoorTools.map((tool) => tool.name)).toEqual(['delete_project', 'delete_list', 'publish_share_link']);
  });

  it('lists every irreversible name it knows about, including ones with no tool yet', () => {
    // `send_email` is on the list ahead of item 22's tool, so that session
    // inherits the protection rather than having to remember it.
    expect(IRREVERSIBLE_TOOL_NAMES).toContain('publish_share_link');
    expect(IRREVERSIBLE_TOOL_NAMES).toContain('send_email');
    expect(IRREVERSIBLE_TOOL_NAMES).not.toContain('revoke_share_link');
  });

  it('serves both share tools over MCP and neither to the in-browser fallback', () => {
    /*
     * The front door lives in Atlas. The in-browser agent has no tray and no
     * interception, so `publish_share_link` there would simply publish — the
     * one act with no undo, performed by the labelled basic assistant with
     * nothing standing in front of it.
     */
    expect(mcpTools.map((tool) => tool.name)).toContain('publish_share_link');
    expect(fallbackTools.map((tool) => tool.name)).not.toContain('publish_share_link');
    expect(fallbackTools.map((tool) => tool.name)).not.toContain('revoke_share_link');
    expect(allTools.filter((tool) => tool.frontDoor === true)).toHaveLength(3);
    // The same reasoning covers BUILD-3's deletes: with no tray, a held delete
    // on the browser path would simply delete.
    for (const tool of allTools.filter((candidate) => candidate.frontDoor === true)) {
      expect(fallbackTools).not.toContain(tool);
    }
  });
});

describe('the preview', () => {
  let bench: ReturnType<typeof harness>;
  beforeEach(() => {
    bench = harness();
  });

  it('says what it would publish, and writes nothing', async () => {
    const result = await publishShareLink.execute({ id: 'p1', type: 'project' }, bench.ctx(true));

    expect(result.ok).toBe(true);
    expect(result.summary).toContain('Studio Launch');
    // The extent is the half a person needs to agree: how much would be visible.
    expect(result.summary).toContain('1 list');
    expect(result.summary).toContain('1 task');
    // Nothing minted, nothing written.
    expect(bench.state.projects[0].shareId).toBeUndefined();
  });

  it('refuses an id that names nothing, before it ever reaches the tray', async () => {
    const result = await publishShareLink.execute({ id: 'nope' }, bench.ctx(true));
    expect(result.ok).toBe(false);
    /*
     * ITEM 13D changed what this may say. It used to assert the summary quoted
     * the bad id back — which 13C had already settled it must not: this
     * sentence is the approval card and the chip, both of which are Shreekant's
     * screen. The id is still in `data`, where the model reads it.
     */
    expect(result.summary).not.toContain('nope');
    expect(result.summary).toContain('task, list or project');
  });
});

describe('publishing and revoking', () => {
  let bench: ReturnType<typeof harness>;
  beforeEach(() => {
    bench = harness();
  });

  it('mints a share id on the entity and reports the path', async () => {
    const result = await publishShareLink.execute({ id: 't1', type: 'task' }, bench.ctx());

    expect(result.ok).toBe(true);
    const shareId = bench.state.backlogTasks[0].shareId;
    expect(shareId).toBeTruthy();
    expect(result.summary).toContain(`/s/${shareId}`);
  });

  it('is idempotent — a second publish keeps the existing link', async () => {
    await publishShareLink.execute({ id: 't1', type: 'task' }, bench.ctx());
    const first = bench.state.backlogTasks[0].shareId;

    const again = await publishShareLink.execute({ id: 't1', type: 'task' }, bench.ctx());

    expect(bench.state.backlogTasks[0].shareId).toBe(first);
    expect(again.summary).toContain('already published');
    const targets = (again.data as { targets: { alreadyPublished?: boolean }[] }).targets;
    expect(targets).toHaveLength(1);
    expect(targets[0].alreadyPublished).toBe(true);
  });

  it('clears the field with undefined, never an empty string', async () => {
    /*
     * `withPatch` in the store is what makes clearing work at all — CLAUDE.md
     * is explicit that a hand-written empty value is what Firestore rejects,
     * and that every later edit then silently stops syncing.
     */
    await publishShareLink.execute({ id: 't1', type: 'task' }, bench.ctx());
    const result = await revokeShareLink.execute({ id: 't1', type: 'task' }, bench.ctx());

    expect(result.ok).toBe(true);
    expect(bench.state.backlogTasks[0].shareId).toBeUndefined();
    // And it does not pretend revoking un-reads the page.
    expect(result.summary).toContain('already read it');
  });

  it('says there is nothing to take down rather than failing', async () => {
    const result = await revokeShareLink.execute({ id: 't1', type: 'task' }, bench.ctx());
    expect(result.ok).toBe(true);
    expect(result.summary).toContain('no public link');
  });

  it('works out what an id names when the type is left off', async () => {
    const result = await publishShareLink.execute({ id: 'l1' }, bench.ctx());
    expect(result.ok).toBe(true);
    expect(bench.state.taskLists[0].shareId).toBeTruthy();
  });
});
