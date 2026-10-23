import { describe, expect, it } from 'vitest';
import {
  COVER_MIN_AGE_MS, collectCoverIds, collectInlineCovers, coverRef, planCoverSweep,
  releasedCovers, rewriteInlineCovers, withResolvedShareCover,
} from './coverRef';

const PIC_A = 'data:image/jpeg;base64,AAAA';
const PIC_B = 'data:image/jpeg;base64,BBBB';

describe('collecting covers', () => {
  it('finds inline pictures however deep, on imageUrl only', () => {
    const state = {
      projects: [{ id: 'p1', imageUrl: PIC_A }, { id: 'p2' }],
      backlogTasks: [{ id: 't1', subtasks: [{ id: 's1', imageUrl: PIC_B }] }],
      tasks: [{ id: 't1', imageUrl: PIC_A }],
      notes: { description: PIC_B },
    };
    expect(collectInlineCovers(state)).toEqual(new Set([PIC_A, PIC_B]));
  });

  it('finds pointers across the store, the Trash and the Archive', () => {
    const store = { projects: [{ imageUrl: coverRef('a') }] };
    const trash = [{ payload: { project: { imageUrl: coverRef('b') } } }];
    const archive = [{ tasks: [{ imageUrl: PIC_A }] }];
    expect(collectCoverIds(store, trash, archive)).toEqual(new Set(['a', 'b']));
  });

  it('ignores functions in the store and survives a cycle', () => {
    const cyclic: Record<string, unknown> = { imageUrl: coverRef('x'), fn: () => {} };
    cyclic.self = cyclic;
    expect(collectCoverIds(cyclic)).toEqual(new Set(['x']));
  });
});

describe('rewriteInlineCovers', () => {
  const refs = new Map([[PIC_A, coverRef('a')]]);

  it('swaps a known picture for its pointer, at any depth', () => {
    const tasks = [{ id: 't', subtasks: [{ id: 's', imageUrl: PIC_A }] }];
    const out = rewriteInlineCovers(tasks, refs);
    expect(out[0].subtasks[0].imageUrl).toBe('cover:a');
    expect(tasks[0].subtasks[0].imageUrl).toBe(PIC_A);
  });

  it('leaves a picture it was not given', () => {
    const p = [{ imageUrl: PIC_B }];
    expect(rewriteInlineCovers(p, refs)).toBe(p);
  });

  it('returns the same objects where nothing changed', () => {
    const untouched = { id: 'u', name: 'x' };
    const projects = [untouched, { id: 'c', imageUrl: PIC_A }];
    const out = rewriteInlineCovers(projects, refs);
    expect(out).not.toBe(projects);
    expect(out[0]).toBe(untouched);
    const none = [{ id: 'n' }];
    expect(rewriteInlineCovers(none, refs)).toBe(none);
  });
});

describe('planCoverSweep', () => {
  const now = 100 * COVER_MIN_AGE_MS;

  it('deletes a stored picture nothing points at', () => {
    expect(planCoverSweep({ old: { createdAt: 1 } }, new Set(), now)).toEqual(['old']);
  });

  it('never touches a picture in use', () => {
    expect(planCoverSweep({ live: { createdAt: 1 } }, new Set(['live']), now)).toEqual([]);
  });

  it('spares one uploaded moments ago, which another device may be about to point at', () => {
    const index = { fresh: { createdAt: now - COVER_MIN_AGE_MS + 1 } };
    expect(planCoverSweep(index, new Set(), now)).toEqual([]);
  });
});

describe('releasedCovers', () => {
  it('is the covers that went out of use, with no wait', () => {
    expect(releasedCovers(new Set(['old', 'kept']), new Set(['kept', 'new']))).toEqual(['old']);
  });

  it('keeps a picture two projects share when one of them changes cover', () => {
    const before = collectCoverIds({ projects: [{ imageUrl: coverRef('same') }, { imageUrl: coverRef('same') }] });
    const after = collectCoverIds({ projects: [{ imageUrl: coverRef('new') }, { imageUrl: coverRef('same') }] });
    expect(releasedCovers(before, after)).toEqual([]);
  });
});

describe('withResolvedShareCover', () => {
  it('publishes the picture, never the pointer', async () => {
    const doc = { shareId: 's', project: { name: 'P', coverUrl: coverRef('a') } };
    const out = await withResolvedShareCover(doc, async (id) => (id === 'a' ? PIC_A : undefined));
    expect(out.project.coverUrl).toBe(PIC_A);
    expect(doc.project.coverUrl).toBe('cover:a');
  });

  it('drops a cover it cannot find rather than publishing a pointer', async () => {
    const doc = { project: { name: 'P', coverUrl: coverRef('gone') } };
    const out = await withResolvedShareCover(doc, async () => { throw new Error('offline'); });
    expect(out.project).not.toHaveProperty('coverUrl');
  });

  it('passes an inline cover and a task share straight through', async () => {
    const inline = { project: { coverUrl: PIC_A } };
    expect(await withResolvedShareCover(inline, async () => undefined)).toBe(inline);
    const task: { task: { title: string }; project?: { coverUrl?: string } } = { task: { title: 't' } };
    expect(await withResolvedShareCover(task, async () => undefined)).toBe(task);
  });
});
