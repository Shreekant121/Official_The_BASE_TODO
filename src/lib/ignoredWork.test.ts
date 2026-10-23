/**
 * **Ignored work (BIG-3)** — the rule, and every engine that reads it.
 *
 * His calls, 2026-09-29: invisible to the queue, never offered by Smart Start,
 * never in Needs Attention, fully visible on its own board, no deadline maths;
 * ignoring a project takes everything inside it at any depth; and marking work
 * ignored takes it out of today's queue at once. The screens only filter on
 * these answers, so the answers are what is pinned here.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { ignoredWork, ignoreSentence, isOwnSwitch } from './ignoredWork';
import { scoreAll } from './priority';
import { buildSmartQueue, planStartNow } from './smartStart';
import { planDeadlineCascade } from './deadlineMath';
import { useStore, type Project, type Task, type TaskList } from '../store/useStore';

const NOW = Date.UTC(2026, 2, 12, 9, 0);
const UTC = { timeZone: 'UTC' } as const;

function project(id: string, over: Partial<Project> = {}): Project {
  return { id, name: id, createdAt: 0, order: 0, ...over };
}
function list(id: string, projectId: string, over: Partial<TaskList> = {}): TaskList {
  return { id, title: id, projectId, ...over };
}
function task(id: string, listId: string, over: Partial<Task> = {}): Task {
  return { id, title: id, status: 'needsAction', listId, ...over };
}

/* Mega › Inner › l-inner, plus a live project beside it. */
const PROJECTS = [project('mega'), project('inner', { parentId: 'mega' }), project('live')];
const LISTS = [list('l-mega', 'mega'), list('l-inner', 'inner'), list('l-live', 'live')];

describe('what counts as ignored', () => {
  it('a project ignores everything inside it, at any depth, subtasks included', () => {
    const tasks = [
      task('deep', 'l-inner', { subtasks: [{ id: 's1', title: 's1', subtasks: [{ id: 's2', title: 's2' }] }] }),
      task('top', 'l-mega'),
      task('free', 'l-live'),
    ];
    const work = ignoredWork(tasks, LISTS, [{ ...PROJECTS[0], ignored: true }, PROJECTS[1], PROJECTS[2]]);
    expect([...work.ids].sort()).toEqual(['deep', 's1', 's2', 'top']);
    // The outermost switch is the one named — it is the one to turn off.
    const reason = work.reasonOf(tasks[0])!;
    expect(reason.kind === 'project' && reason.project.id).toBe('mega');
    expect(ignoreSentence(reason, { kind: 'task', id: 'deep' })).toBe('Ignored because the project "mega" is');
  });

  it('a project inside an ignored one is held by the one above, not its own switch', () => {
    const work = ignoredWork([], LISTS, [{ ...PROJECTS[0], ignored: true }, PROJECTS[1], PROJECTS[2]]);
    const reason = work.projectReason('inner')!;
    expect(isOwnSwitch(reason, { kind: 'project', id: 'inner' })).toBe(false);
    expect(isOwnSwitch(reason, { kind: 'project', id: 'mega' })).toBe(true);
    expect(work.projectReason('live')).toBeUndefined();
  });

  it('a list and a task can be ignored on their own', () => {
    const tasks = [task('a', 'l-live'), task('b', 'l-live', { ignored: true }), task('c', 'l-inner')];
    const work = ignoredWork(tasks, [LISTS[0], { ...LISTS[1], ignored: true }, LISTS[2]], PROJECTS);
    expect([...work.ids].sort()).toEqual(['b', 'c']);
    expect(work.reasonOf(tasks[1])).toEqual({ kind: 'task' });
    expect(work.reasonOf(tasks[2])?.kind).toBe('list');
    expect(work.has(tasks[0])).toBe(false);
  });

  it('a task shared INTO an ignored list is still offered through its own', () => {
    const tasks = [task('a', 'l-live', { sharedListIds: ['l-inner'] })];
    const work = ignoredWork(tasks, [LISTS[0], { ...LISTS[1], ignored: true }, LISTS[2]], PROJECTS);
    expect(work.has(tasks[0])).toBe(false);
  });

  it("a queue copy's own flag is not believed — the backlog decides", () => {
    // A copy taken while ignored must not stay ignored after the switch goes off.
    const work = ignoredWork([task('a', 'l-live')], LISTS, PROJECTS);
    expect(work.has({ ...task('a', 'l-live'), ignored: true } as Task)).toBe(false);
  });

  it('survives a project cycle two devices synced', () => {
    const cyclic = [project('x', { parentId: 'y', ignored: true }), project('y', { parentId: 'x' })];
    const work = ignoredWork([task('t', 'lx')], [list('lx', 'x')], cyclic);
    expect(work.has(task('t', 'lx'))).toBe(true);
    expect(work.projectReason('y')).toBeUndefined();
  });
});

describe('the score', () => {
  const tasks = [
    task('blocker', 'l-live', { deadline: '2026-03-12T17:00', estimatedTime: 60 }),
    task('ignored', 'l-live', {
      deadline: '2026-03-12T12:00', humanOverride: 9, emergencyBoost: 5, dependsOn: ['blocker'],
    }),
  ];
  const all = scoreAll(tasks, NOW, { ...UTC, ignored: new Set(['ignored']) });

  it('is zero and never red on ignored work', () => {
    const s = all.get('ignored')!;
    expect(s).toMatchObject({ score: 0, redAlert: false, W: 0, ignored: true });
  });

  it('lends nothing to what it waits on, and is not counted as blocked', () => {
    const b = all.get('blocker')!;
    expect(b.blockedCount).toBe(0);
    expect(b.conductivity.from).toBeNull();
    expect(b.ignored).toBe(false);
    const unignored = scoreAll(tasks, NOW, UTC).get('blocker')!;
    expect(unignored.blockedCount).toBe(1);
  });
});

describe('Smart Start', () => {
  const tasks = [
    task('free', 'l-live', { estimatedTime: 30, humanOverride: 1 }),
    task('ignored', 'l-live', { estimatedTime: 30, humanOverride: 9 }),
    task('waits', 'l-live', { estimatedTime: 30, humanOverride: 5, dependsOn: ['ignored'] }),
  ];
  const ignored = new Set(['ignored']);

  it('never offers ignored work, and holds back what waits on it', () => {
    const { queue, heldBack } = buildSmartQueue(8, tasks, { ignored });
    expect(queue.map((t) => t.id)).toEqual(['free']);
    expect(heldBack.map((h) => h.task.id)).toEqual(['waits']);
    expect(heldBack[0].blockers.map((b) => b.id)).toEqual(['ignored']);
  });

  it('even the cold-start fallback cannot land on it', () => {
    const { queue } = buildSmartQueue(0, [tasks[1]], { ignored });
    expect(queue).toEqual([]);
  });

  it("Start now on a blocked task does not offer an ignored prerequisite", () => {
    const plan = planStartNow(tasks, 'waits', ignored);
    expect(plan).toMatchObject({ kind: 'blocked', startable: [] });
    // His own press on the ignored task itself still starts it.
    expect(planStartNow(tasks, 'ignored', ignored).kind).toBe('start');
  });
});

describe('deadline maths', () => {
  const chain = [
    { id: 'a', title: 'a', deadline: '2026-03-20T17:00' },
    { id: 'b', title: 'b', deadline: '2026-03-12T17:00', dependsOn: ['a'] },
    // Exactly a day after b, so only a push through b can move it.
    { id: 'c', title: 'c', deadline: '2026-03-13T17:00', dependsOn: ['b'] },
  ];

  it('never pushes ignored work', () => {
    const plan = planDeadlineCascade(chain, { ...UTC, ignored: new Set(['b']) });
    expect(plan.patches.map((p) => p.taskId)).toEqual([]);
  });

  it('and ignored work pushes nothing downstream', () => {
    const plan = planDeadlineCascade(chain, { ...UTC, ignored: new Set(['a']) });
    expect(plan.patches.map((p) => p.taskId)).toEqual([]);
    // The control: the same chain, nothing ignored, moves both.
    expect(planDeadlineCascade(chain, UTC).patches.map((p) => p.taskId)).toEqual(['b', 'c']);
  });
});

describe('turning the switch (the store)', () => {
  beforeEach(() => {
    useStore.setState({
      projects: structuredClone(PROJECTS),
      taskLists: structuredClone(LISTS),
      backlogTasks: [
        task('deep', 'l-inner', { subtasks: [{ id: 'sub', title: 'sub' }] }),
        task('free', 'l-live'),
      ],
      tasks: [
        task('deep', 'l-inner'),
        task('free', 'l-live'),
        // A subtask stand-in carries its root's list.
        { ...task('sub', 'l-inner'), isSubtaskProxy: true },
      ],
    });
  });

  it("takes everything it covers out of today's queue at once", () => {
    useStore.getState().setIgnored({ kind: 'project', id: 'mega' }, true);
    const s = useStore.getState();
    expect(s.projects.find((p) => p.id === 'mega')?.ignored).toBe(true);
    expect(s.tasks.map((t) => t.id)).toEqual(['free']);
  });

  it('a task switched off leaves the queue, and switching it back puts nothing back', () => {
    const { setIgnored } = useStore.getState();
    setIgnored({ kind: 'task', id: 'free' }, true);
    expect(useStore.getState().tasks.map((t) => t.id)).toEqual(['deep', 'sub']);
    setIgnored({ kind: 'task', id: 'free' }, false);
    const s = useStore.getState();
    expect(s.tasks.map((t) => t.id)).toEqual(['deep', 'sub']);
    // Cleared by removing the key, never by writing false.
    expect('ignored' in s.backlogTasks.find((t) => t.id === 'free')!).toBe(false);
  });

  it('a list ignores its tasks and their stand-ins', () => {
    useStore.getState().setIgnored({ kind: 'list', id: 'l-inner' }, true);
    expect(useStore.getState().tasks.map((t) => t.id)).toEqual(['free']);
  });
});
