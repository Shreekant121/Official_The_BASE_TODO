import { describe, expect, it } from 'vitest';
import { isBackburnerTitle, isProjectBackburner, splitParked } from './backburner';

describe('a project’s Backburner (idea 91)', () => {
  it('is any spelling of the name', () => {
    for (const t of ['Backburner', 'backburner', 'BACKBURNER', '\u{1F9CA} Backburner', 'Back-burner', ' back burner ']) {
      expect(isBackburnerTitle(t)).toBe(true);
    }
  });

  it('is not a name that merely contains it, nor nothing', () => {
    for (const t of ['Backburner ideas', 'Old backburner', 'Burner', '', undefined]) {
      expect(isBackburnerTitle(t)).toBe(false);
    }
  });

  it('must be inside a project: the shared Backburner is not one', () => {
    expect(isProjectBackburner({ title: 'Backburner', projectId: 'p1' })).toBe(true);
    expect(isProjectBackburner({ title: 'Backburner', projectId: undefined })).toBe(false);
  });

  it('splits a board in its own order', () => {
    const lists = [
      { id: 'a', title: 'Build', projectId: 'p1' },
      { id: 'b', title: 'Backburner', projectId: 'p1' },
      { id: 'c', title: 'Ops', projectId: 'p1' },
    ];
    const { board, parked } = splitParked(lists);
    expect(board.map((l) => l.id)).toEqual(['a', 'c']);
    expect(parked.map((l) => l.id)).toEqual(['b']);
  });
});
