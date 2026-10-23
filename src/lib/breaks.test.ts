/**
 * A real break (29-1P11a, idea 104): when it is offered, how long it is, and
 * his list of ideas. The list is the half that can quietly lose his work — a
 * removal stored against the wrong id hides an idea he wanted, and an edit
 * that rewrote the seed would cost the synced document hundreds of lines.
 */
import { describe, expect, it } from 'vitest';
import {
  addIdea, blockEndsAt, breakClock, breakMinutes, cleanIdea, ideasOf, isLongBreak, NO_EDITS,
  pickIdea, readEdits, removeIdea, restoreSeed, type BreakIdea,
} from './breaks';
import { BREAK_IDEA_SEED } from './breakIdeaSeed';

const SEED: BreakIdea[] = [
  { id: 's1', text: 'Drink a glass of water.' },
  { id: 's2', text: 'Stand up and stretch.' },
  { id: 's3', text: 'Look out of the window.' },
];

describe('when and how long', () => {
  it('ends a block his focus minutes after play', () => {
    expect(blockEndsAt({ focusMinutes: 25 }, 1_000)).toBe(1_000 + 25 * 60_000);
  });

  it('never ends a block at once, whatever was stored', () => {
    expect(blockEndsAt({ focusMinutes: 0 }, 0)).toBe(60_000);
  });

  it('makes every fourth break the long one', () => {
    expect([1, 2, 3, 4, 5, 8].map(isLongBreak)).toEqual([false, false, false, true, false, true]);
    expect(isLongBreak(0)).toBe(false);
  });

  it('takes his numbers for each', () => {
    const prefs = { breakMinutes: 5, longBreakMinutes: 15 };
    expect(breakMinutes(prefs, false)).toBe(5);
    expect(breakMinutes(prefs, true)).toBe(15);
    expect(breakMinutes({ breakMinutes: 0, longBreakMinutes: 0 }, false)).toBe(1);
  });

  it('reads the break clock as minutes and seconds, never below zero', () => {
    expect(breakClock(300)).toBe('5:00');
    expect(breakClock(64.2)).toBe('1:05');
    expect(breakClock(-3)).toBe('0:00');
  });
});

describe('his list', () => {
  it('starts as the seed, and stores nothing until he edits it', () => {
    expect(ideasOf(SEED, NO_EDITS)).toEqual(SEED);
    expect(NO_EDITS).toEqual({ hidden: [], added: [] });
  });

  it('puts his own idea at the top, cleaned', () => {
    const edits = addIdea(SEED, NO_EDITS, '  Water   the plants ', 'u1');
    expect(edits.added).toEqual([{ id: 'u1', text: 'Water the plants' }]);
    expect(ideasOf(SEED, edits)[0].text).toBe('Water the plants');
  });

  it('adds nothing empty, and no duplicate of one already showing', () => {
    expect(addIdea(SEED, NO_EDITS, '   ', 'u1')).toBe(NO_EDITS);
    expect(addIdea(SEED, NO_EDITS, 'drink a glass of WATER.', 'u1')).toBe(NO_EDITS);
  });

  it('hides a seed idea he removes, by its id, and deletes his own outright', () => {
    let edits = removeIdea(SEED, NO_EDITS, 's2');
    expect(edits.hidden).toEqual(['s2']);
    expect(ideasOf(SEED, edits).map((i) => i.id)).toEqual(['s1', 's3']);
    edits = addIdea(SEED, edits, 'Walk around', 'u1');
    edits = removeIdea(SEED, edits, 'u1');
    expect(edits.added).toEqual([]);
    expect(removeIdea(SEED, edits, 'nope')).toBe(edits);
  });

  it('brings a removed seed idea back as itself when he types it again', () => {
    const removed = removeIdea(SEED, NO_EDITS, 's1');
    const back = addIdea(SEED, removed, 'Drink a glass of water.', 'u1');
    expect(back.hidden).toEqual([]);
    expect(back.added).toEqual([]);
  });

  it('puts every removed seed idea back, and keeps his own', () => {
    const edits = addIdea(SEED, removeIdea(SEED, removeIdea(SEED, NO_EDITS, 's1'), 's3'), 'Mine', 'u1');
    const restored = restoreSeed(edits);
    expect(restored.hidden).toEqual([]);
    expect(restored.added).toEqual(edits.added);
    expect(restoreSeed(NO_EDITS)).toBe(NO_EDITS);
  });

  it('reads a stored document defensively', () => {
    expect(readEdits(null)).toEqual(NO_EDITS);
    expect(readEdits({ hidden: ['s1', 3], added: [{ id: 'u1', text: 'Ok' }, { id: 2 }, { id: 'u2', text: '  ' }] }))
      .toEqual({ hidden: ['s1'], added: [{ id: 'u1', text: 'Ok' }] });
  });

  it('cleans an idea to one capped line', () => {
    expect(cleanIdea('a\n\nb')).toBe('a b');
    expect(cleanIdea('x'.repeat(500))).toHaveLength(140);
  });
});

describe('picking an idea', () => {
  it('never shows the same one twice in a row', () => {
    for (const roll of [0, 0.4, 0.99]) expect(pickIdea(SEED, roll, 's1')?.id).not.toBe('s1');
  });

  it('shows the only one there is, and nothing from an empty list', () => {
    expect(pickIdea([SEED[0]], 0.5, 's1')?.id).toBe('s1');
    expect(pickIdea([], 0.5)).toBeNull();
  });
});

describe('the seed', () => {
  it('holds hundreds, each with its own id and its own words', () => {
    expect(BREAK_IDEA_SEED.length).toBeGreaterThanOrEqual(200);
    expect(new Set(BREAK_IDEA_SEED.map((i) => i.id)).size).toBe(BREAK_IDEA_SEED.length);
    expect(new Set(BREAK_IDEA_SEED.map((i) => i.text.toLowerCase())).size).toBe(BREAK_IDEA_SEED.length);
    for (const idea of BREAK_IDEA_SEED) expect(cleanIdea(idea.text)).toBe(idea.text);
  });

  it('keeps the first idea’s id where it was (append only)', () => {
    expect(BREAK_IDEA_SEED[0]).toEqual({ id: 's1', text: 'Look at something 6 metres away for 20 seconds.' });
  });
});
