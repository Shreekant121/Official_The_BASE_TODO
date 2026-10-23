import { describe, expect, it } from 'vitest';
import { MAGNET, SNAP_MIN, columnAt, dragRefusal, droppedDeadline, edgeScroll, magnetPull, refusalWords, snapStart } from './snapDrag';

describe('which blocks move', () => {
  it('moves an open task, never a finished one or one following an event', () => {
    expect(dragRefusal({ status: 'todo' })).toBeNull();
    expect(dragRefusal({ status: 'in-progress' })).toBeNull();
    expect(dragRefusal({ status: 'completed' })).toBe('done');
    expect(dragRefusal({ status: 'todo', eventId: 'ev1' })).toBe('event');
  });
});

describe('the slots', () => {
  it('pulls the top to the nearest quarter', () => {
    expect(snapStart(15 * 60 + 7)).toBe(15 * 60);
    expect(snapStart(15 * 60 + 8)).toBe(15 * 60 + 15);
    expect(snapStart(15 * 60 - 7)).toBe(15 * 60);
  });

  it('keeps the slot inside the day', () => {
    expect(snapStart(-40)).toBe(0);
    expect(snapStart(24 * 60 + 30)).toBe(24 * 60 - SNAP_MIN);
  });
});

describe('the magnet', () => {
  it('does not pull at half a slot away, and pulls most on the slot', () => {
    expect(magnetPull(600 - 7.5, 600)).toBe(600 - 7.5);
    expect(magnetPull(600, 600)).toBe(600);
    const near = magnetPull(598, 600);
    expect(near).toBeGreaterThan(598);
    expect(near).toBeLessThan(600);
  });

  it('pulls harder the nearer it is', () => {
    const far = magnetPull(594, 600) - 594;
    const close = magnetPull(598, 600) - 598;
    expect(close / 2).toBeGreaterThan(far / 6);
    expect(magnetPull(599, 600)).toBeCloseTo(599 + (1 - 1 / 7.5) * MAGNET, 6);
  });
});

describe('the deadline a drop leaves', () => {
  it('is the block\'s end: an hour from 3pm is due at 4pm', () => {
    expect(droppedDeadline('2026-03-12', 15 * 60, 60)).toBe('2026-03-12T16:00');
    expect(droppedDeadline('2026-03-12', 15 * 60, 25)).toBe('2026-03-12T15:25');
  });

  it('rounds a length to the minute', () => {
    expect(droppedDeadline('2026-03-12', 9 * 60, 22.6)).toBe('2026-03-12T09:23');
  });

  it('runs into the next day past midnight, month and year included', () => {
    expect(droppedDeadline('2026-03-12', 23 * 60 + 45, 60)).toBe('2026-03-13T00:45');
    expect(droppedDeadline('2026-12-31', 23 * 60, 60)).toBe('2027-01-01T00:00');
  });
});

describe('the column under the finger', () => {
  it('finds the day of a week, clamped to its ends', () => {
    expect(columnAt(50, 0, 700, 7)).toBe(0);
    expect(columnAt(350, 0, 700, 7)).toBe(3);
    expect(columnAt(-20, 0, 700, 7)).toBe(0);
    expect(columnAt(900, 0, 700, 7)).toBe(6);
    expect(columnAt(900, 0, 700, 1)).toBe(0);
  });
});

describe('scrolling at the edges', () => {
  it('is still in the middle, up near the top, down near the bottom', () => {
    expect(edgeScroll(300, 0, 600, 60, 12)).toBe(0);
    expect(edgeScroll(30, 0, 600, 60, 12)).toBe(-6);
    expect(edgeScroll(0, 0, 600, 60, 12)).toBe(-12);
    expect(edgeScroll(590, 0, 600, 60, 12)).toBeCloseTo(10, 6);
    expect(edgeScroll(700, 0, 600, 60, 12)).toBe(12);
  });
});

describe('what a block that will not move says', () => {
  it('names the event it follows, or says it is finished', () => {
    expect(refusalWords('event', 'Mumbai Marathon')).toBe('Moves with Mumbai Marathon');
    expect(refusalWords('event')).toBe('Moves with its event');
    expect(refusalWords('done')).toBe('Finished, so it stays');
  });
});
