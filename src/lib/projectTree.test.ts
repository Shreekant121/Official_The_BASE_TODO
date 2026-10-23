import { describe, expect, it } from 'vitest';
import type { Project, Task, TaskList } from '../store/useStore';
import {
  buildProjectTree,
  canMoveInto,
  effectiveParentId,
  flattenProjectTree,
  planProjectMove,
  projectPath,
  subtreeTasks,
} from './projectTree';

const project = (id: string, order: number, parentId?: string): Project => ({
  id, name: id.toUpperCase(), createdAt: order, order, ...(parentId ? { parentId } : {}),
});

const list = (id: string, projectId: string): TaskList =>
  ({ id, title: id, projectId, order: 0 }) as TaskList;

const task = (id: string, listId: string, extra: Partial<Task> = {}): Task =>
  ({ id, title: id, listId, status: 'needsAction', subtasks: [], ...extra }) as Task;

// mega ─┬─ a ── a1
//       └─ b
// solo
const PROJECTS = [
  project('mega', 0),
  project('solo', 1),
  project('b', 1, 'mega'),
  project('a', 0, 'mega'),
  project('a1', 0, 'a'),
];

describe('buildProjectTree', () => {
  const tree = buildProjectTree(PROJECTS);

  it('lists only the top level at null, in order', () => {
    expect(tree.childrenOf(null).map((p) => p.id)).toEqual(['mega', 'solo']);
  });

  it('lists a project\'s children in their own order', () => {
    expect(tree.childrenOf('mega').map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('walks a subtree at any depth, parents first', () => {
    expect(tree.subtreeIds('mega')).toEqual(['mega', 'a', 'a1', 'b']);
    expect(tree.subtreeIds('b')).toEqual(['b']);
    expect(tree.subtreeIds('nope')).toEqual([]);
  });

  it('gives the path from the top down to the parent', () => {
    expect(tree.ancestorsOf('a1').map((p) => p.id)).toEqual(['mega', 'a']);
    expect(tree.ancestorsOf('mega')).toEqual([]);
    expect(projectPath(tree, PROJECTS[4])).toBe('MEGA › A › A1');
  });

  it('flattens in tree order with depths', () => {
    expect(flattenProjectTree(tree).map(({ project: p, depth }) => `${depth}:${p.id}`))
      .toEqual(['0:mega', '1:a', '2:a1', '1:b', '0:solo']);
  });

  it('puts a project whose parent is gone at the top level', () => {
    const orphaned = [project('x', 0, 'deleted')];
    expect(effectiveParentId(orphaned, 'x')).toBeNull();
    expect(buildProjectTree(orphaned).childrenOf(null).map((p) => p.id)).toEqual(['x']);
  });

  it('puts both halves of a synced cycle at the top level, losing neither', () => {
    const cycle = [project('p', 0, 'q'), project('q', 1, 'p'), project('r', 2, 'p')];
    const t = buildProjectTree(cycle);
    expect(t.childrenOf(null).map((p) => p.id)).toEqual(['p', 'q']);
    // `r` hangs off `p`, which is itself drawn at the top — so r is still reachable.
    expect(t.childrenOf('p').map((p) => p.id)).toEqual(['r']);
    expect(flattenProjectTree(t)).toHaveLength(3);
  });
});

describe('moving a project', () => {
  it('refuses to move a project into itself or anything under it', () => {
    expect(canMoveInto(PROJECTS, 'mega', 'mega')).toBe(false);
    expect(canMoveInto(PROJECTS, 'mega', 'a1')).toBe(false);
    expect(planProjectMove(PROJECTS, 'mega', 'a')).toBeNull();
    expect(canMoveInto(PROJECTS, 'a1', 'solo')).toBe(true);
    expect(canMoveInto(PROJECTS, 'a1', null)).toBe(true);
  });

  it('refuses a target that does not exist', () => {
    expect(planProjectMove(PROJECTS, 'solo', 'ghost')).toBeNull();
  });

  it('moves a project last among its new siblings, taking its subtree with it', () => {
    const next = planProjectMove(PROJECTS, 'a', 'solo')!;
    const tree = buildProjectTree(next);
    expect(tree.childrenOf('solo').map((p) => p.id)).toEqual(['a']);
    expect(tree.subtreeIds('solo')).toEqual(['solo', 'a', 'a1']);
    expect(tree.childrenOf('mega').map((p) => p.id)).toEqual(['b']);

    const again = buildProjectTree(planProjectMove(next, 'b', 'solo')!);
    expect(again.childrenOf('solo').map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('removes the field to take a project to the top level, never writes undefined', () => {
    const next = planProjectMove(PROJECTS, 'a1', null)!;
    const moved = next.find((p) => p.id === 'a1')!;
    expect('parentId' in moved).toBe(false);
    expect(buildProjectTree(next).childrenOf(null).map((p) => p.id)).toEqual(['mega', 'solo', 'a1']);
  });
});

describe('subtreeTasks', () => {
  const lists = [list('l-mega', 'mega'), list('l-a1', 'a1'), list('l-b', 'b'), list('l-solo', 'solo')];
  const tasks = [
    task('t1', 'l-mega'),
    task('t2', 'l-a1'),
    // Lives in b and is also shown in a1: still one task to mega.
    task('t3', 'l-b', { sharedListIds: ['l-a1'] }),
    // Lives outside the tree and is shown in it: it counts, as it always has.
    task('t4', 'l-solo', { sharedListIds: ['l-b'] }),
    task('t5', 'l-solo'),
    task('sub', 'l-b', { parent: 't3' }),
  ];

  it('counts every task in the tree once', () => {
    const tree = buildProjectTree(PROJECTS);
    expect(subtreeTasks(tree, lists, tasks, 'mega').map((t) => t.id)).toEqual(['t1', 't2', 't3', 't4']);
    expect(subtreeTasks(tree, lists, tasks, 'a').map((t) => t.id)).toEqual(['t2', 't3']);
  });
});
