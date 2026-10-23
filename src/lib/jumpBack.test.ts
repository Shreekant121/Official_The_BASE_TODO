import { describe, expect, it } from 'vitest';
import {
  JUMP_KEEP, noteScroll, noteTask, shownSpots, visit, whenLabel, whereLine, type JumpSpot,
} from './jumpBack';

const TZ = 'Asia/Kolkata';
/* Thursday 12 March 2026, 10:00 in Kolkata. */
const NOW = Date.parse('2026-03-12T04:30:00Z');
const MIN = 60_000;
const DAY = 86_400_000;

describe('jump back in: what is remembered (idea 154)', () => {
  it('puts the project just opened first, keeping where he was in it', () => {
    let spots: JumpSpot[] = [];
    spots = visit(spots, 'a', 1);
    spots = noteTask(spots, 'a', { id: 't1', listId: 'l1' }, 2);
    spots = noteScroll(spots, 'a', 420.6);
    spots = visit(spots, 'b', 3);
    spots = visit(spots, 'a', 4);
    expect(spots.map((s) => s.projectId)).toEqual(['a', 'b']);
    expect(spots[0]).toEqual({ projectId: 'a', at: 4, taskId: 't1', listId: 'l1', scrollTop: 421 });
  });

  it('moves a project to the front when a task in it is opened or ticked', () => {
    let spots = visit(visit([], 'a', 1), 'b', 2);
    spots = noteTask(spots, 'a', { id: 't9' }, 5);
    expect(spots[0]).toMatchObject({ projectId: 'a', at: 5, taskId: 't9' });
    expect(spots[0].listId).toBeUndefined();
  });

  it('a scroll neither reorders nor counts as a visit, and is ignored for a project never visited', () => {
    const spots = visit(visit([], 'a', 1), 'b', 2);
    const after = noteScroll(spots, 'a', 300);
    expect(after.map((s) => s.projectId)).toEqual(['b', 'a']);
    expect(after[1].at).toBe(1);
    expect(noteScroll(spots, 'zzz', 300)).toBe(spots);
    /* An unchanged position hands back the same array, so the store does not re-render. */
    expect(noteScroll(after, 'a', 300)).toBe(after);
  });

  it(`keeps ${JUMP_KEEP}, and shows the live ones newest first`, () => {
    let spots: JumpSpot[] = [];
    for (let i = 0; i < JUMP_KEEP + 5; i++) spots = visit(spots, `p${i}`, i);
    expect(spots).toHaveLength(JUMP_KEEP);
    expect(spots[0].projectId).toBe(`p${JUMP_KEEP + 4}`);
    /* Deleted or archived projects drop out and the next one fills in. */
    const live = new Set(spots.map((s) => s.projectId).filter((id) => id !== 'p16' && id !== 'p14'));
    expect(shownSpots(spots, live).map((s) => s.projectId)).toEqual(['p15', 'p13', 'p12', 'p11']);
  });
});

describe('jump back in: the words', () => {
  it('says the list and the task, or what it has', () => {
    expect(whereLine('Build', 'Rewrite the copy')).toBe('Build list · at “Rewrite the copy”');
    expect(whereLine('Reading list', undefined)).toBe('Reading list');
    expect(whereLine(undefined, 'Call the CA')).toBe('at “Call the CA”');
    expect(whereLine(undefined, undefined)).toBe('');
  });

  it('says when, coarser further back, in calendar days in his zone', () => {
    expect(whenLabel(NOW - 30_000, NOW, TZ)).toBe('just now');
    expect(whenLabel(NOW - 12 * MIN, NOW, TZ)).toBe('12 min ago');
    expect(whenLabel(NOW - 3 * 60 * MIN, NOW, TZ)).toBe('3 h ago');
    /* 23:30 the night before, half past ten earlier: still "yesterday". */
    expect(whenLabel(Date.parse('2026-03-11T18:00:00Z'), NOW, TZ)).toBe('yesterday');
    expect(whenLabel(NOW - 3 * DAY, NOW, TZ)).toBe('Mon');
    expect(whenLabel(NOW - 20 * DAY, NOW, TZ)).toBe('20 Feb');
  });
});
