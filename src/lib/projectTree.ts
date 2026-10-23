/**
 * Projects inside projects (BIG-2) — the one answer to "where does this
 * project sit?", pure and tested.
 *
 * A project names its parent with `Project.parentId` and nothing else: there
 * is no child list to keep in step, so a move is one field on one record and
 * two devices can never disagree about who holds whom. Everything here derives
 * the tree from that one field, and **every reader goes through
 * `effectiveParentId`**, never the raw field, because the raw field can lie:
 *
 *   - its parent may be gone — deleted, archived, or not yet synced to this
 *     device — and a project whose parent is missing is top-level, not lost;
 *   - two devices can each move one project into the other before either sees
 *     the other's write, and the synced document then holds a cycle. A project
 *     whose chain of parents comes back round to itself is top-level too, so
 *     both show on Home and neither vanishes.
 *
 * Tasks still belong to exactly one list and a list to exactly one project, so
 * nothing here can make a screen count a task twice: a roll-up is a filter
 * over the backlog against the subtree's list ids, never a sum of per-project
 * counts. `subtreeTasks` is that filter, and the one every roll-up uses.
 */
import type { Project, Task, TaskList } from '../store/useStore';

export interface ProjectTree {
  /** Each project's parent as it is actually drawn, or null for top level. */
  parentOf: (id: string) => string | null;
  /** A project's direct children in their drawn order; `null` for Home's row. */
  childrenOf: (id: string | null) => Project[];
  /** The project and everything under it, at any depth, parents first. */
  subtreeIds: (id: string) => string[];
  /** The chain from the top level down to the project's parent. Empty at the top. */
  ancestorsOf: (id: string) => Project[];
}

/**
 * The parent a project really has: its `parentId` if that resolves to a live
 * project and following parents upwards never returns to it, otherwise null.
 */
export function effectiveParentId(projects: readonly Project[], id: string): string | null {
  const byId = new Map(projects.map((p) => [p.id, p]));
  return resolveParent(byId, id);
}

function resolveParent(byId: ReadonlyMap<string, Project>, id: string): string | null {
  const parentId = byId.get(id)?.parentId;
  if (!parentId || !byId.has(parentId)) return null;
  // Only a cycle through this project itself unseats it. A project hanging off
  // a cycle it is not part of keeps its parent: the cycle's members are drawn
  // at the top level, so it is still reachable under one of them.
  const seen = new Set<string>();
  let cursor: string | undefined = parentId;
  while (cursor) {
    if (cursor === id) return null;
    if (seen.has(cursor)) break;
    seen.add(cursor);
    const next: string | undefined = byId.get(cursor)?.parentId;
    cursor = next && byId.has(next) ? next : undefined;
  }
  return parentId;
}

const byOrder = (a: Project, b: Project) => a.order - b.order || a.createdAt - b.createdAt;

export function buildProjectTree(projects: readonly Project[]): ProjectTree {
  const byId = new Map(projects.map((p) => [p.id, p]));
  const parent = new Map<string, string | null>();
  const children = new Map<string | null, Project[]>();
  for (const p of projects) {
    const parentId = resolveParent(byId, p.id);
    parent.set(p.id, parentId);
    const siblings = children.get(parentId);
    if (siblings) siblings.push(p);
    else children.set(parentId, [p]);
  }
  for (const siblings of children.values()) siblings.sort(byOrder);

  const childrenOf = (id: string | null) => children.get(id) ?? [];

  return {
    parentOf: (id) => parent.get(id) ?? null,
    childrenOf,
    subtreeIds: (id) => {
      if (!byId.has(id)) return [];
      const out: string[] = [];
      const walk = (at: string) => {
        out.push(at);
        for (const child of childrenOf(at)) walk(child.id);
      };
      walk(id);
      return out;
    },
    ancestorsOf: (id) => {
      const chain: Project[] = [];
      let cursor = parent.get(id) ?? null;
      while (cursor) {
        const p = byId.get(cursor);
        if (!p) break;
        chain.unshift(p);
        cursor = parent.get(cursor) ?? null;
      }
      return chain;
    },
  };
}

/** Every project a project may move into: not itself and nothing under it. */
export function canMoveInto(projects: readonly Project[], id: string, targetId: string | null): boolean {
  if (targetId === null) return true;
  if (targetId === id || !projects.some((p) => p.id === targetId)) return false;
  return !buildProjectTree(projects).subtreeIds(id).includes(targetId);
}

/**
 * The projects array with `id` moved under `targetId` (null for the top
 * level), placed last among its new siblings. Returns null when the move would
 * put a project inside itself or inside something it holds, or names nothing.
 *
 * Only the moved project changes. Its old siblings keep their `order` values —
 * a gap in a sort key sorts exactly as no gap does.
 */
export function planProjectMove(
  projects: readonly Project[],
  id: string,
  targetId: string | null,
): Project[] | null {
  const moving = projects.find((p) => p.id === id);
  if (!moving || !canMoveInto(projects, id, targetId)) return null;
  const tree = buildProjectTree(projects);
  const siblings = tree.childrenOf(targetId).filter((p) => p.id !== id);
  const order = siblings.reduce((max, p) => Math.max(max, p.order), -1) + 1;
  const { parentId: _dropped, ...rest } = moving;
  void _dropped;
  const moved: Project = targetId === null ? { ...rest, order } : { ...rest, parentId: targetId, order };
  return projects.map((p) => (p.id === id ? moved : p));
}

/** A subtree's list ids — the lists of the project and of everything under it. */
export function subtreeListIds(
  tree: ProjectTree,
  lists: readonly TaskList[],
  projectId: string,
): Set<string> {
  const ids = new Set(tree.subtreeIds(projectId));
  return new Set(lists.filter((l) => l.projectId && ids.has(l.projectId)).map((l) => l.id));
}

/**
 * The top-level tasks a project's card counts: every task living in, or shared
 * into, a list anywhere in its subtree. One filter over the backlog, so a task
 * shared into two lists of the same tree is still one task.
 */
export function subtreeTasks(
  tree: ProjectTree,
  lists: readonly TaskList[],
  tasks: readonly Task[],
  projectId: string,
): Task[] {
  const listIds = subtreeListIds(tree, lists, projectId);
  return tasks.filter(
    (t) =>
      !t.parent &&
      ((!!t.listId && listIds.has(t.listId)) || (t.sharedListIds ?? []).some((id) => listIds.has(id))),
  );
}

/** "Mega › Project" — a project named with the path to it, for pickers and search. */
export function projectPath(tree: ProjectTree, project: Project, separator = ' › '): string {
  return [...tree.ancestorsOf(project.id).map((p) => p.name), project.name].join(separator);
}

/**
 * Every project in tree order with its depth — the order a picker lists them
 * in, parents first, each one's children under it.
 */
export function flattenProjectTree(tree: ProjectTree): { project: Project; depth: number }[] {
  const out: { project: Project; depth: number }[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const p of tree.childrenOf(parentId)) {
      out.push({ project: p, depth });
      walk(p.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/** "Its 2 projects and 14 tasks" — what an archive or a delete takes along. */
export function goesWith(projects: number, tasks: number): string {
  const parts = [
    ...(projects > 0 ? [`${projects} project${projects === 1 ? '' : 's'}`] : []),
    `${tasks} task${tasks === 1 ? '' : 's'}`,
  ];
  return `Its ${parts.join(' and ')}`;
}
