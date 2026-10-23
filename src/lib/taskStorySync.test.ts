/**
 * The browser's story recorder against the real store (29-1P9c). Firestore is
 * replaced by a map, so what is asserted is what would be written: one line
 * per change he makes, Atlas's marked, and nothing for the cloud's copy
 * arriving — the device that made a change records it, never the one that
 * receives it.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const written = new Map<string, { events: unknown[] }>();

vi.mock('./firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...path: string[]) => path.join('/'),
  runTransaction: async (_db: unknown, run: (tx: unknown) => Promise<void>) => run({
    get: async (ref: string) => ({ data: () => written.get(ref) }),
    set: (ref: string, data: { events: unknown[] }) => { written.set(ref, data); },
  }),
  setDoc: async () => {},
  arrayUnion: (...v: unknown[]) => v,
  deleteDoc: async (ref: string) => { written.delete(ref); },
  onSnapshot: () => () => {},
}));

import { useStore, type Task } from '../store/useStore';
import { asAtlas, withoutStory } from '../store/storyActor';
import { flushStory, installStoryRecorder, setStoryOwner } from './taskStorySync';

const task = (over: Partial<Task> = {}): Task => ({
  id: 't1', title: 'Write the proposal', status: 'needsAction', listId: 'l1', order: 0, createdAt: 1, ...over,
});

const story = () => (written.get('users/u1/story/t1')?.events ?? []) as { k: string; by?: string }[];

/** Lets the press's microtask close, then sends what it queued. */
async function settle() {
  await Promise.resolve();
  flushStory();
  await new Promise((r) => setTimeout(r, 0));
}

beforeAll(() => {
  installStoryRecorder();
  setStoryOwner('u1');
});

beforeEach(() => {
  written.clear();
  withoutStory(() => useStore.setState({ projects: [], taskLists: [{ id: 'l1', title: 'Build' }, { id: 'l2', title: 'Doing' }], backlogTasks: [task()], tasks: [] }));
});

describe('taskStorySync: the recorder', () => {
  it('writes what his edit changed to that task\'s own document', async () => {
    useStore.getState().updateBacklogTask('t1', { title: 'Write the proposal v2', description: 'Two pages' });
    await settle();
    expect(story().map((e) => e.k)).toEqual(['title', 'edit']);
    expect(story().some((e) => e.by)).toBe(false);
  });

  it('one press and the writes it sets off are one diff', async () => {
    const s = useStore.getState();
    s.updateBacklogTask('t1', { listId: 'l2' });
    s.updateBacklogTask('t1', { status: 'completed' });
    await settle();
    expect(story().map((e) => e.k)).toEqual(['done', 'moved']);
  });

  it('says Atlas did what Atlas did', async () => {
    await asAtlas(async () => { useStore.getState().updateBacklogTask('t1', { assignee: 'Priya' }); });
    await settle();
    expect(story()).toEqual([expect.objectContaining({ k: 'assigned', to: 'Priya', by: 'atlas' })]);
  });

  it('records nothing when the cloud\'s copy is adopted', async () => {
    withoutStory(() => useStore.setState({ backlogTasks: [task({ title: 'Changed on the tablet' })] }));
    await settle();
    expect(written.size).toBe(0);
  });

  it('records a task Atlas made with a raw setState, which wrapping actions would miss', async () => {
    useStore.setState((s) => ({ backlogTasks: [...s.backlogTasks, task({ id: 't2', createdAt: Date.now() })] }));
    await settle();
    expect(written.get('users/u1/story/t2')?.events).toEqual([expect.objectContaining({ k: 'made', list: 'Build' })]);
  });

  it('records nothing signed out, so nothing lands in the next account', async () => {
    setStoryOwner(null);
    useStore.getState().updateBacklogTask('t1', { description: 'x' });
    await Promise.resolve();
    setStoryOwner('u1');
    flushStory();
    await new Promise((r) => setTimeout(r, 0));
    expect(written.size).toBe(0);
  });
});
