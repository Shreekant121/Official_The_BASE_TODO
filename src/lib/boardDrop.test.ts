/**
 * Where a task lands when it is dropped on a project's board of lists.
 *
 * These are the assertions a photograph cannot make. `npm run shots` can prove
 * the board *looks* right and a real drag in a real browser can prove one drop
 * works; neither scales to "before the hovered row, after it, at the end, and
 * the same four in the list it came from". The insertion arithmetic is
 * therefore pure (`resolveBoardDrop`) and pinned here.
 */
import { describe, expect, it } from 'vitest';
import {
  mergeVisibleOrder, parseScopedItemId, resolveBoardDrop, scopedItemId, type BoardDropInput,
} from './boardDrop';

/** Two lists, three rows each. */
const BOARD = {
  todo: ['t1', 't2', 't3'],
  done: ['d1', 'd2', 'd3'],
  empty: [] as string[],
};

/**
 * A drop, with the geometry defaulting to "released above the hovered row's
 * centre". Each test states only the part it is about.
 */
function drop(over: BoardDropInput['over'], extra: Partial<BoardDropInput> = {}) {
  return resolveBoardDrop({
    itemsByContainer: BOARD,
    from: { containerId: 'todo', itemId: 't1' },
    over,
    releasedAtY: 100,
    overCenterY: 200,
    ...extra,
  });
}

describe('scoped row ids', () => {
  it('round-trips a container and an item', () => {
    const id = scopedItemId('todo', 't1');
    expect(parseScopedItemId(id)).toEqual({ containerId: 'todo', itemId: 't1' });
  });

  // The board tells a list card from a task row by whether its id is scoped,
  // so an unscoped id has to come back null rather than half-parsed.
  it('reads an unscoped id as not an item', () => {
    expect(parseScopedItemId('todo')).toBeNull();
    expect(parseScopedItemId('01234567-89ab-cdef-0123-456789abcdef')).toBeNull();
  });

  // Splits on the *first* separator: the container id is the part this needs to
  // be right about, and a uuid never contains one anyway.
  it('keeps everything after the first separator as the item id', () => {
    expect(parseScopedItemId('todo::a::b')).toEqual({ containerId: 'todo', itemId: 'a::b' });
  });

  it('refuses an id that is only a separator', () => {
    expect(parseScopedItemId('::t1')).toBeNull();
    expect(parseScopedItemId('todo::')).toBeNull();
  });
});

describe('within one list', () => {
  it('moves the row to the hovered row’s slot', () => {
    expect(drop({ containerId: 'todo', itemId: 't3' })).toEqual({
      kind: 'reorder', containerId: 'todo', orderedIds: ['t2', 't3', 't1'],
    });
  });

  it('moves it upward the same way', () => {
    expect(
      resolveBoardDrop({
        itemsByContainer: BOARD,
        from: { containerId: 'todo', itemId: 't3' },
        over: { containerId: 'todo', itemId: 't1' },
        releasedAtY: 100,
        overCenterY: 200,
      }),
    ).toEqual({ kind: 'reorder', containerId: 'todo', orderedIds: ['t3', 't1', 't2'] });
  });

  // Geometry is deliberately *not* consulted here: the sorting strategy has
  // already shown the row sitting in the hovered row's slot, and second-guessing
  // that with a midpoint test would drop it one place off what the user saw.
  it('ignores which half of the hovered row it was released over', () => {
    const below = drop({ containerId: 'todo', itemId: 't3' }, { releasedAtY: 300 });
    expect(below).toEqual({ kind: 'reorder', containerId: 'todo', orderedIds: ['t2', 't3', 't1'] });
  });

  it('does nothing when the row is dropped on itself', () => {
    expect(drop({ containerId: 'todo', itemId: 't1' })).toEqual({ kind: 'none' });
  });

  /**
   * The collision fallback resolves to the list itself whenever the only row in
   * range is the dragged one. Reading that as "send it to the bottom" would
   * move a task the user only jiggled, which is why this is a no-op and not an
   * append.
   */
  it('does nothing when released over its own list rather than a row', () => {
    expect(drop({ containerId: 'todo', itemId: null })).toEqual({ kind: 'none' });
  });
});

describe('across lists', () => {
  it('inserts before the hovered row when released above its midpoint', () => {
    expect(drop({ containerId: 'done', itemId: 'd2' }, { releasedAtY: 190, overCenterY: 200 })).toEqual({
      kind: 'move', itemId: 't1', toContainerId: 'done', beforeItemId: 'd2',
    });
  });

  it('inserts after the hovered row when released below its midpoint', () => {
    expect(drop({ containerId: 'done', itemId: 'd2' }, { releasedAtY: 210, overCenterY: 200 })).toEqual({
      kind: 'move', itemId: 't1', toContainerId: 'done', beforeItemId: 'd3',
    });
  });

  // "After the last row" has no row to be before, and that is the end of the list.
  it('appends when released below the last row', () => {
    expect(drop({ containerId: 'done', itemId: 'd3' }, { releasedAtY: 210, overCenterY: 200 })).toEqual({
      kind: 'move', itemId: 't1', toContainerId: 'done', beforeItemId: null,
    });
  });

  it('inserts at the very top when released above the first row', () => {
    expect(drop({ containerId: 'done', itemId: 'd1' }, { releasedAtY: 190, overCenterY: 200 })).toEqual({
      kind: 'move', itemId: 't1', toContainerId: 'done', beforeItemId: 'd1',
    });
  });

  it('appends when released over an empty list', () => {
    expect(drop({ containerId: 'empty', itemId: null })).toEqual({
      kind: 'move', itemId: 't1', toContainerId: 'empty', beforeItemId: null,
    });
  });

  // A row whose id the target list has never heard of — a list re-rendered
  // mid-drag, a task deleted from under the pointer. Landing it at the end
  // beats resolving to "before nothing" and silently doing nothing at all.
  it('appends when the hovered row is not in the target list', () => {
    expect(drop({ containerId: 'done', itemId: 'gone' })).toEqual({
      kind: 'move', itemId: 't1', toContainerId: 'done', beforeItemId: null,
    });
  });

  it('appends when the target list is not on the board at all', () => {
    expect(drop({ containerId: 'nosuchlist', itemId: 'x' })).toEqual({
      kind: 'move', itemId: 't1', toContainerId: 'nosuchlist', beforeItemId: null,
    });
  });
});

/**
 * "Show done" hides rows, and a reorder of what is left has to be written back
 * as a reorder of everything — `reorderBacklogTasks` deletes whatever is
 * missing from the array it is given. This is the assertion that stands
 * between that switch and silent data loss.
 */
describe('mergeVisibleOrder', () => {
  it('is the visible order itself when nothing is hidden', () => {
    expect(mergeVisibleOrder(['a', 'b', 'c'], ['c', 'a', 'b'])).toEqual(['c', 'a', 'b']);
  });

  it('keeps every hidden row, in the slot it already held', () => {
    // b and d are hidden; a, c, e were on screen and a moved to the end.
    expect(mergeVisibleOrder(['a', 'b', 'c', 'd', 'e'], ['c', 'e', 'a']))
      .toEqual(['c', 'b', 'e', 'd', 'a']);
  });

  it('leaves a list alone when the hidden rows are all of it', () => {
    expect(mergeVisibleOrder(['a', 'b'], [])).toEqual(['a', 'b']);
  });

  it('never drops a row, however the visible ones are shuffled', () => {
    const all = ['a', 'b', 'c', 'd', 'e', 'f'];
    const merged = mergeVisibleOrder(all, ['f', 'd', 'b']);
    expect([...merged].sort()).toEqual([...all].sort());
  });
});
