import { afterEach, describe, expect, it, vi } from 'vitest';
import { relationsOf, useWireStore, wirePath, WIRE_DWELL_MS } from './blockWires';
import type { Task } from '../store/useStore';

const task = (id: string, extra: Partial<Task> = {}): Task => ({ id, title: id, status: 'todo', ...extra } as Task);

describe('relationsOf (idea 164)', () => {
  const backlog = [
    task('paperwork'),
    task('account', { dependsOn: ['paperwork', 'done-one', 'missing'] }),
    task('done-one', { status: 'completed' }),
    task('deck', { dependsOn: ['paperwork'] }),
    task('closed', { status: 'completed', dependsOn: ['paperwork'] }),
  ];

  it('a blocked task wires to each unfinished task it waits on, and nothing else', () => {
    expect(relationsOf(backlog, 'account')).toEqual([{ blocker: 'paperwork', blocked: 'account' }]);
  });

  it('a blocker wires out to every unfinished task waiting on it', () => {
    expect(relationsOf(backlog, 'paperwork')).toEqual([
      { blocker: 'paperwork', blocked: 'account' },
      { blocker: 'paperwork', blocked: 'deck' },
    ]);
  });

  it('a finished task draws nothing, either way', () => {
    expect(relationsOf(backlog, 'closed')).toEqual([]);
    expect(relationsOf(backlog, 'done-one')).toEqual([]);
    expect(relationsOf(backlog, 'nobody')).toEqual([]);
  });
});

describe('wirePath (idea 164)', () => {
  const left = { left: 0, top: 0, right: 200, bottom: 60 };
  const right = { left: 300, top: 120, right: 500, bottom: 180 };

  it('side by side, it runs between the facing edges', () => {
    const w = wirePath(left, right);
    expect(w.d.startsWith('M194 30 ')).toBe(true);
    expect(w.end).toEqual({ x: 306, y: 150 });
    expect(w.label).toEqual({ x: 250, y: 90 });
  });

  it('runs the other way when the blocker is on the right', () => {
    const w = wirePath(right, left);
    expect(w.d.startsWith('M306 150 ')).toBe(true);
    expect(w.end).toEqual({ x: 194, y: 30 });
  });

  it('in one column, it leaves and re-enters on the right and bows out past both', () => {
    const below = { left: 0, top: 200, right: 200, bottom: 260 };
    const w = wirePath(left, below);
    expect(w.d.startsWith('M194 30 ')).toBe(true);
    expect(w.end).toEqual({ x: 194, y: 230 });
    expect(w.label.x).toBeGreaterThan(200);
  });

  it('bows left instead when the right bow would leave the screen (List view rows)', () => {
    const row1 = { left: 150, top: 0, right: 1380, bottom: 60 };
    const row2 = { left: 150, top: 200, right: 1380, bottom: 260 };
    const w = wirePath(row1, row2, 1440);
    expect(w.d.startsWith('M156 30 ')).toBe(true);
    expect(w.end).toEqual({ x: 156, y: 230 });
    expect(w.label.x).toBeLessThan(150);
  });
});

describe('useWireStore', () => {
  afterEach(() => { useWireStore.getState().clear(); vi.useRealTimers(); });

  it('draws only after the pointer rests, and a quick pass draws nothing', () => {
    vi.useFakeTimers();
    const s = useWireStore.getState();
    s.point('a');
    s.leave('a');
    vi.advanceTimersByTime(WIRE_DWELL_MS + 10);
    expect(useWireStore.getState().at).toBe(null);
    s.point('a');
    vi.advanceTimersByTime(WIRE_DWELL_MS + 10);
    expect(useWireStore.getState().at).toBe('a');
  });

  it('a tap pins it past the pointer leaving, and a second tap clears it', () => {
    const s = useWireStore.getState();
    s.pin('a');
    s.leave('a');
    expect(useWireStore.getState().at).toBe('a');
    s.pin('a');
    expect(useWireStore.getState().at).toBe(null);
  });
});
