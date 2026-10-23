import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STACK, MAX_STACK_PAGES, blockLook, clampSize, columnsFor, defaultLayout, dropIndexAt, moveBlock, packBlocks,
  resizedSize, rowsUsed, stackPageAt, stackPages,
  type BlockSettings, type DashboardBlock, type GridMetrics,
} from './layout';

const block = (id: string, w: number, h: number, kind: DashboardBlock['kind'] = 'today'): DashboardBlock => ({ id, kind, w, h });

describe('blockLook', () => {
  it('is glass in the block’s own colour until he picks otherwise', () => {
    expect(blockLook({ kind: 'next-deadline' })).toEqual({ look: 'glass', colour: 'sky' });
    expect(blockLook({ kind: 'overdue', settings: { look: 'tint' } })).toEqual({ look: 'tint', colour: 'coral' });
    expect(blockLook({ kind: 'today', settings: { look: 'full', colour: 'violet' } })).toEqual({ look: 'full', colour: 'violet' });
  });

  it('draws a value it does not know as the default, not as nothing', () => {
    const odd = { look: 'neon', colour: 'magenta' } as unknown as BlockSettings;
    expect(blockLook({ kind: 'hours-today', settings: odd })).toEqual({ look: 'glass', colour: 'teal' });
  });

  it('keeps the one-thing block glass: it is all hero picture', () => {
    expect(blockLook({ kind: 'one-thing', settings: { look: 'full', colour: 'rose' } })).toEqual({ look: 'glass', colour: 'rose' });
  });
});

/* Four 100px columns, 100px rows, 10px gaps: column c starts at c*110. */
const M4: GridMetrics = { columns: 4, cell: 100, row: 100, gap: 10 };

describe('packBlocks', () => {
  it('fills rows left to right in list order', () => {
    const p = packBlocks([block('a', 2, 2), block('b', 2, 1), block('c', 1, 1), block('d', 1, 1)], 4);
    expect(p).toEqual([
      { id: 'a', x: 0, y: 0, w: 2, h: 2 },
      { id: 'b', x: 2, y: 0, w: 2, h: 1 },
      { id: 'c', x: 2, y: 1, w: 1, h: 1 },
      { id: 'd', x: 3, y: 1, w: 1, h: 1 },
    ]);
  });

  it('lets a later small block fill a gap a big one left', () => {
    const p = packBlocks([block('a', 3, 1), block('b', 2, 1), block('c', 1, 1)], 4);
    expect(p.find((q) => q.id === 'c')).toEqual({ id: 'c', x: 3, y: 0, w: 1, h: 1 });
    expect(p.find((q) => q.id === 'b')).toEqual({ id: 'b', x: 0, y: 1, w: 2, h: 1 });
  });

  it('draws a block no wider than the screen has columns, keeping its height', () => {
    const p = packBlocks([block('a', 4, 2), block('b', 1, 1)], 2);
    expect(p).toEqual([
      { id: 'a', x: 0, y: 0, w: 2, h: 2 },
      { id: 'b', x: 0, y: 2, w: 1, h: 1 },
    ]);
    expect(rowsUsed(p)).toBe(3);
  });

  it('stacks everything in one column on a phone, in order', () => {
    const p = packBlocks(defaultLayout(() => Math.random().toString(36)), 1);
    expect(p.every((q) => q.x === 0 && q.w === 1)).toBe(true);
    expect(p.map((q) => q.y)).toEqual([...p.map((q) => q.y)].sort((a, b) => a - b));
  });
});

describe('moveBlock', () => {
  const list = [block('a', 1, 1), block('b', 1, 1), block('c', 1, 1)];
  it('moves forward and back', () => {
    expect(moveBlock(list, 'a', 2).map((b) => b.id)).toEqual(['b', 'c', 'a']);
    expect(moveBlock(list, 'c', 0).map((b) => b.id)).toEqual(['c', 'a', 'b']);
  });
  it('clamps an index past the end', () => {
    expect(moveBlock(list, 'a', 99).map((b) => b.id)).toEqual(['b', 'c', 'a']);
  });
  it('leaves the list alone for an unknown id', () => {
    expect(moveBlock(list, 'zz', 0).map((b) => b.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('dropIndexAt', () => {
  const list = [block('a', 1, 1), block('b', 1, 1), block('c', 1, 1), block('d', 1, 1)];

  it('reads the held block\'s own cell as "stay"', () => {
    expect(dropIndexAt(list, 'a', 50, 50, M4)).toBeNull();
  });

  it('puts it before a block when the pointer is on that block\'s leading half', () => {
    // over c (x 220..320), leading half
    expect(dropIndexAt(list, 'a', 240, 50, M4)).toBe(1); // others = b,c,d → before c
  });

  it('puts it after a block when the pointer is on the trailing half', () => {
    expect(dropIndexAt(list, 'a', 300, 50, M4)).toBe(2); // after c
  });

  it('sends it to the end over empty space below everything', () => {
    expect(dropIndexAt(list, 'a', 50, 300, M4)).toBe(3);
  });

  it('refuses a point off the side of the grid', () => {
    expect(dropIndexAt(list, 'a', 500, 50, M4)).toBeNull();
    expect(dropIndexAt(list, 'a', -5, 50, M4)).toBeNull();
  });

  it('does not flicker: after the move, the pointer rests on the ghost', () => {
    const index = dropIndexAt(list, 'a', 300, 50, M4)!;
    const moved = moveBlock(list, 'a', index);
    expect(dropIndexAt(moved, 'a', 300, 50, M4)).toBeNull();
  });
});

describe('resizedSize', () => {
  it('snaps as the pointer passes the middle of a cell', () => {
    expect(resizedSize('today', { w: 1, h: 1 }, 54, 0, M4)).toEqual({ w: 1, h: 1 });
    expect(resizedSize('today', { w: 1, h: 1 }, 56, 0, M4)).toEqual({ w: 2, h: 1 });
    expect(resizedSize('today', { w: 1, h: 1 }, 0, 170, M4)).toEqual({ w: 1, h: 3 });
  });

  it('never goes below the kind\'s minimum or past the grid', () => {
    expect(resizedSize('one-thing', { w: 2, h: 2 }, -400, -400, M4)).toEqual({ w: 2, h: 2 });
    expect(resizedSize('today', { w: 2, h: 1 }, 900, 900, M4)).toEqual({ w: 4, h: 3 });
  });

  it('keeps the stored width when only the height moved on a narrow screen', () => {
    const narrow: GridMetrics = { ...M4, columns: 2 };
    expect(resizedSize('today', { w: 4, h: 1 }, 0, 120, narrow)).toEqual({ w: 4, h: 2 });
    expect(resizedSize('today', { w: 4, h: 1 }, -110, 0, narrow)).toEqual({ w: 1, h: 1 });
  });
});

describe('the rest', () => {
  it('clampSize holds each kind to its minimum', () => {
    expect(clampSize('one-thing', 1, 1)).toEqual({ w: 2, h: 2 });
    expect(clampSize('overdue', 9, 9)).toEqual({ w: 4, h: 3 });
  });

  it('columnsFor: four, two, one', () => {
    expect(columnsFor(1100)).toBe(4);
    expect(columnsFor(760)).toBe(2);
    expect(columnsFor(350)).toBe(1);
  });

  it('the default layout leads with the one thing', () => {
    let n = 0;
    const d = defaultLayout(() => `id${n++}`);
    expect(d[0].kind).toBe('one-thing');
    expect(new Set(d.map((b) => b.id)).size).toBe(d.length);
  });
});

describe('the Stack (idea 133)', () => {
  it('starts as his three: the one thing, the hours, today', () => {
    expect(stackPages({})).toEqual([...DEFAULT_STACK]);
    expect(DEFAULT_STACK.map((p) => p.kind)).toEqual(['one-thing', 'hours-today', 'today']);
  });

  it('turns to the last page that has started, and is still on the evening page before dawn', () => {
    const pages = stackPages({});
    expect(stackPageAt(pages, 9)).toBe(0);
    expect(stackPageAt(pages, 12)).toBe(1);
    expect(stackPageAt(pages, 16)).toBe(1);
    expect(stackPageAt(pages, 22)).toBe(2);
    expect(stackPageAt(pages, 2)).toBe(2);
  });

  it('drops pages it cannot draw: unknown kinds, a stack in a stack, a bad hour, a second page at one hour', () => {
    const pages = stackPages({
      settings: {
        pages: [
          { kind: 'today', from: 20 },
          { kind: 'stack', from: 8 },
          { kind: 'no-such-block' as never, from: 9 },
          { kind: 'overdue', from: 24 },
          { kind: 'runway', from: 7 },
          { kind: 'overdue', from: 7 },
        ],
      } as BlockSettings,
    });
    expect(pages).toEqual([{ kind: 'runway', from: 7 }, { kind: 'today', from: 20 }]);
  });

  it('falls back to the default when nothing usable is left, and holds five at most', () => {
    expect(stackPages({ settings: { pages: [{ kind: 'stack', from: 3 }] } })).toEqual([...DEFAULT_STACK]);
    const many = Array.from({ length: 9 }, (_, i) => ({ kind: 'today' as const, from: i }));
    expect(stackPages({ settings: { pages: many } })).toHaveLength(MAX_STACK_PAGES);
  });

  it('is at least two by two, so its one-thing page has room', () => {
    expect(clampSize('stack', 1, 1)).toEqual({ w: 2, h: 2 });
  });
});
