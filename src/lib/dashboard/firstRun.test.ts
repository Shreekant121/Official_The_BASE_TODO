import { describe, expect, it } from 'vitest';
import {
  MAX_STARTER_PROJECTS, NORMAL_DAY, SEE_FIRST, starterLayout, starterProjectNames, starterWeekly,
} from './firstRun';
import { DEFAULT_WEEKLY } from './hours';
import { BLOCK_KINDS, BLOCK_SPECS, SAMPLE_KINDS, packBlocks } from './layout';

const ids = () => {
  let n = 0;
  return () => `b${++n}`;
};
const kinds = (blocks: { kind: string }[]) => blocks.map((b) => b.kind);
const H = 3600;

describe('starterLayout', () => {
  it('leads with the first answer, then the second, then Today, the project and the morning note', () => {
    const blocks = starterLayout({ see: ['deadlines', 'one-thing'] }, 'p1', ids());
    expect(kinds(blocks)).toEqual([
      'next-deadline', 'countdown', 'runway', 'one-thing', 'today', 'project-progress', 'sample-morning',
    ]);
    expect(blocks.find((b) => b.kind === 'project-progress')?.settings).toEqual({ projectId: 'p1' });
  });

  it('does not add Today twice when an answer brought it, and makes it two tall', () => {
    const blocks = starterLayout({ see: ['today'] }, null, ids());
    expect(kinds(blocks)).toEqual(['today', 'timeline', 'quick-add', 'sample-morning']);
    expect(blocks[0]).toMatchObject({ w: 2, h: 2 });
  });

  it('with no projects puts a Jot it down note where the project would be', () => {
    expect(kinds(starterLayout({ see: ['worked'] }, null, ids()))).toEqual([
      'hours-today', 'focus-week', 'today', 'quick-add', 'sample-morning',
    ]);
  });

  it('habits come in as samples', () => {
    const blocks = starterLayout({ see: ['habits'] }, null, ids());
    expect(kinds(blocks).slice(0, 2)).toEqual(['sample-routine', 'sample-streak']);
    expect(blocks.filter((b) => SAMPLE_KINDS.has(b.kind)).length).toBe(3);
  });

  it('with nothing picked falls back to the one thing and today', () => {
    expect(kinds(starterLayout({ see: [] }, null, ids())).slice(0, 3)).toEqual(['one-thing', 'today', 'timeline']);
  });

  it('keeps two answers at most, once each, and ignores an unknown one', () => {
    const see = ['worked', 'worked', 'nonsense', 'habits', 'one-thing'] as never;
    expect(kinds(starterLayout({ see }, null, ids())).slice(0, 4)).toEqual(['hours-today', 'focus-week', 'sample-routine', 'sample-streak']);
  });

  it('every block is a size its kind allows, with a fresh id, and packs on every width', () => {
    for (const s of SEE_FIRST) {
      const blocks = starterLayout({ see: [s.id] }, 'p', ids());
      expect(new Set(blocks.map((b) => b.id)).size).toBe(blocks.length);
      for (const b of blocks) {
        const spec = BLOCK_SPECS[b.kind];
        expect(b.w).toBeGreaterThanOrEqual(spec.minW);
        expect(b.h).toBeGreaterThanOrEqual(spec.minH);
      }
      for (const cols of [4, 2, 1]) expect(packBlocks(blocks, cols)).toHaveLength(blocks.length);
    }
  });
});

describe('starterWeekly', () => {
  it('turns a normal day into hours, Sunday first', () => {
    expect(starterWeekly('weekdays')).toEqual([3 * H, 8 * H, 8 * H, 8 * H, 8 * H, 8 * H, 3 * H]);
    expect(starterWeekly('own-hours')).toEqual([4 * H, 10 * H, 10 * H, 10 * H, 10 * H, 10 * H, 10 * H]);
    expect(starterWeekly('evenings')).toEqual([6 * H, 3 * H, 3 * H, 3 * H, 3 * H, 3 * H, 6 * H]);
    expect(starterWeekly('changes')).toEqual([...DEFAULT_WEEKLY]);
  });

  it('every choice has hours, and a copy each time', () => {
    for (const c of NORMAL_DAY) expect(starterWeekly(c.id)).toHaveLength(7);
    const a = starterWeekly('weekdays');
    a[0] = 0;
    expect(starterWeekly('weekdays')[0]).toBe(3 * H);
  });
});

describe('starterProjectNames', () => {
  it('trims, drops blanks and keeps a name once in any case', () => {
    expect(starterProjectNames(['  Work ', '', 'work', 'Side   project', 'Studies'])).toEqual(['Work', 'Side project', 'Studies']);
  });

  it('stops at the most a first run makes', () => {
    const many = Array.from({ length: 20 }, (_, i) => `P${i}`);
    expect(starterProjectNames(many)).toHaveLength(MAX_STARTER_PROJECTS);
  });
});

describe('the samples', () => {
  it('are in the gallery, last', () => {
    const tail = BLOCK_KINDS.slice(-SAMPLE_KINDS.size);
    expect(new Set(tail)).toEqual(SAMPLE_KINDS);
  });

  it('say so in their blurb', () => {
    for (const k of SAMPLE_KINDS) expect(BLOCK_SPECS[k].blurb.startsWith('Sample')).toBe(true);
  });
});
