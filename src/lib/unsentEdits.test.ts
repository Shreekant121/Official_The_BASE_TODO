import { beforeEach, describe, expect, it } from 'vitest';
import { forgetUnsent, mainUnsent, resetUnsentForTests, trashUnsent, type Slices } from './unsentEdits';

const UNSENT_KEY = 'base-unsent-edits';

type Rec = { id: string; title: string };
const r = (id: string, title = id): Rec => ({ id, title });

function slices(backlog: Rec[], extra: Partial<Slices> = {}): Slices {
  return {
    taskLists: [],
    backlogTasks: backlog as unknown as Slices['backlogTasks'],
    tasks: [],
    sessionDuration: 14400,
    taskTimeMemory: {},
    projects: [],
    ...extra,
  };
}

function memoryKv() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    m,
  };
}

const titles = (s: Slices) => (s.backlogTasks as unknown as Rec[]).map((t) => `${t.id}:${t.title}`);

/** The device's edits, recorded the way `firestoreSync` records them, then merged onto `cloud`. */
function editThenReopen(base: Slices, edits: ((s: Slices) => Slices)[], cloud: Slices) {
  const kv = memoryKv();
  let state = base;
  for (const edit of edits) {
    const next = edit(state);
    mainUnsent.track('u1', state, next, kv);
    state = next;
  }
  resetUnsentForTests(); // the tab dies
  const unsent = mainUnsent.read('u1', kv);
  expect(unsent).not.toBeNull();
  return mainUnsent.merge(cloud, state, unsent!);
}

const rename = (id: string, title: string) => (s: Slices) =>
  slices((s.backlogTasks as unknown as Rec[]).map((t) => (t.id === id ? r(id, title) : t)));

describe('unsentEdits (FIX-15)', () => {
  beforeEach(() => resetUnsentForTests());

  it('keeps an offline change when the cloud did not move (the reproduced loss)', () => {
    const base = slices([r('a'), r('b')]);
    const out = editThenReopen(base, [rename('a', 'ticked offline')], base);
    expect(titles(out)).toEqual(['a:ticked offline', 'b:b']);
  });

  it('keeps the laptop work done meanwhile: only the records changed here are laid over', () => {
    const base = slices([r('a'), r('b'), r('c')]);
    const cloud = slices([r('a'), r('b', 'laptop edit'), r('c'), r('d', 'added on laptop')]);
    const out = editThenReopen(base, [rename('a', 'tablet edit')], cloud);
    expect(titles(out)).toEqual(['a:tablet edit', 'b:laptop edit', 'c:c', 'd:added on laptop']);
  });

  it('adds what was added here after the record it followed, and drops what was deleted here', () => {
    const base = slices([r('a'), r('b'), r('c')]);
    const add = (s: Slices) => {
      const list = [...(s.backlogTasks as unknown as Rec[])];
      list.splice(1, 0, r('new'));
      return slices(list);
    };
    const del = (s: Slices) => slices((s.backlogTasks as unknown as Rec[]).filter((t) => t.id !== 'c'));
    const cloud = slices([r('a'), r('b', 'laptop edit'), r('c')]);
    const out = editThenReopen(base, [add, del], cloud);
    expect(titles(out)).toEqual(['a:a', 'new:new', 'b:laptop edit']);
  });

  it('does not bring back what the laptop deleted', () => {
    const base = slices([r('a'), r('b')]);
    const cloud = slices([r('b')]);
    const out = editThenReopen(base, [rename('b', 'tablet edit')], cloud);
    expect(titles(out)).toEqual(['b:tablet edit']);
  });

  it('keeps a drag made here, with records added elsewhere slotted in', () => {
    const base = slices([r('a'), r('b'), r('c')]);
    const drag = (s: Slices) => {
      const [a, b, c] = s.backlogTasks as unknown as Rec[];
      return slices([c, a, b]);
    };
    const cloud = slices([r('a'), r('x', 'laptop'), r('b'), r('c')]);
    const out = editThenReopen(base, [drag], cloud);
    expect(titles(out)).toEqual(['c:c', 'a:a', 'x:laptop', 'b:b']);
  });

  it('takes a plain value only if it changed here', () => {
    const base = slices([r('a')]);
    const cloud = slices([r('a')], { sessionDuration: 3600, taskTimeMemory: { a: 9 } });
    const out = editThenReopen(base, [(s) => ({ ...s, taskTimeMemory: { a: 25 } })], cloud);
    expect(out.taskTimeMemory).toEqual({ a: 25 });
    expect(out.sessionDuration).toBe(3600);
  });

  it('forgets the list once the cloud confirms a save, unless something changed after it was sent', () => {
    const kv = memoryKv();
    const s0 = slices([r('a')]);
    const s1 = rename('a', 'one')(s0);
    mainUnsent.track('u1', s0, s1, kv);
    const sent = mainUnsent.seq('u1', kv);
    const s2 = rename('a', 'two')(s1);
    mainUnsent.track('u1', s1, s2, kv);
    mainUnsent.confirmed('u1', sent, kv);
    expect(kv.m.has(UNSENT_KEY)).toBe(true);
    mainUnsent.confirmed('u1', mainUnsent.seq('u1', kv), kv);
    expect(kv.m.has(UNSENT_KEY)).toBe(false);
  });

  it('records nothing for a change outside the synced slices, and nothing for another account', () => {
    const kv = memoryKv();
    const s = slices([r('a')]);
    mainUnsent.track('u1', s, { ...s }, kv);
    expect(kv.m.has(UNSENT_KEY)).toBe(false);
    mainUnsent.track('u1', s, rename('a', 'x')(s), kv);
    expect(mainUnsent.read('u1', kv)).not.toBeNull();
    expect(mainUnsent.read('u2', kv)).toBeNull();
    forgetUnsent(kv);
    expect(mainUnsent.read('u1', kv)).toBeNull();
  });

  it('keeps a Trash entry made offline, beside the ones the laptop added', () => {
    // A delete moves the task from data/main to data/trash: keeping only the
    // first half would lose the task outright.
    const kv = memoryKv();
    type Trash = Parameters<typeof trashUnsent.merge>[1];
    const t = (...ids: string[]) => ({ entries: ids.map((id) => r(id)) }) as unknown as Trash;
    const after = t('deleted offline', 'old');
    trashUnsent.track('u1', t('old'), after, kv);
    resetUnsentForTests();
    const out = trashUnsent.merge(t('laptop deleted', 'old'), after, trashUnsent.read('u1', kv)!);
    expect(out.entries.map((e) => e.id)).toEqual(['deleted offline', 'laptop deleted', 'old']);
  });
});
