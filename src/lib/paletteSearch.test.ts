/**
 * The command palette's matcher (BUILD-9). The rule it holds is written at
 * the top of `paletteSearch.ts`; these pin the cases he will actually meet.
 */
import { describe, expect, it } from 'vitest';
import { looksLikeQuestion, normalise, scoreEntry, searchPalette, type PaletteEntry } from './paletteSearch';

const ENTRIES: PaletteEntry[] = [
  { id: 't-ca', kind: 'task', name: 'Call the CA', description: 'About the GST filing' },
  { id: 't-plumber', kind: 'task', name: 'Call the plumber' },
  { id: 't-ca-done', kind: 'task', name: 'Call the CA', done: true },
  { id: 't-gst', kind: 'task', name: 'Upload GST invoices' },
  { id: 'p-house', kind: 'project', name: 'House', description: 'Repairs and bills' },
  { id: 'l-calls', kind: 'list', name: 'Calls to make' },
  { id: 'c-smart', kind: 'command', name: 'Smart Start', keywords: 'start a focus session timer' },
  { id: 'c-project', kind: 'command', name: 'New project', keywords: 'create add' },
];

const ids = (query: string) => searchPalette(ENTRIES, query).map((e) => e.id);

describe('searchPalette', () => {
  it('with nothing typed, lists the commands in their own order and nothing else', () => {
    expect(ids('')).toEqual(['c-smart', 'c-project']);
    expect(ids('   ')).toEqual(['c-smart', 'c-project']);
  });

  it('needs every word somewhere in the entry', () => {
    // "gst" is only in the CA task's description; the plumber has "call" alone.
    expect(ids('call gst')).toEqual(['t-ca']);
    expect(ids('call plumber')).toEqual(['t-plumber']);
  });

  it('reads the description, below a name match', () => {
    // "gst" is in the name of one task and the description of another.
    expect(ids('gst')).toEqual(['t-gst', 't-ca']);
  });

  it('finds a command by its keywords', () => {
    expect(ids('focus')).toEqual(['c-smart']);
    expect(ids('focus session')).toEqual(['c-smart']);
  });

  it('keeps the given order between equal matches', () => {
    const tied: PaletteEntry[] = [
      { id: 'second-alphabetically', kind: 'command', name: 'Smart Start', keywords: 'focus' },
      { id: 'first-alphabetically', kind: 'command', name: 'New session', keywords: 'focus' },
    ];
    expect(searchPalette(tied, 'focus').map((e) => e.id)).toEqual(['second-alphabetically', 'first-alphabetically']);
  });

  it('puts an open task above a finished one of the same name', () => {
    const found = ids('call the ca');
    expect(found.indexOf('t-ca')).toBeLessThan(found.indexOf('t-ca-done'));
  });

  it('ranks the start of a name above a word inside it', () => {
    // "Calls to make" starts with "call"; both tasks only start a word with it.
    expect(ids('call')[0]).toBe('t-ca');
    expect(ids('calls')).toEqual(['l-calls']);
  });

  it('ignores case and accents', () => {
    expect(ids('HOUSE')).toEqual(['p-house']);
    expect(ids('hóuse')).toEqual(['p-house']);
  });

  it('caps each kind', () => {
    const many: PaletteEntry[] = Array.from({ length: 20 }, (_, i) => ({ id: `t${i}`, kind: 'task', name: `Task ${i}` }));
    expect(searchPalette(many, 'task')).toHaveLength(8);
  });

  it('returns nothing when nothing matches', () => {
    expect(ids('xylophone')).toEqual([]);
  });
});

describe('scoreEntry', () => {
  it('matches a word start only at a real word boundary', () => {
    const entry: PaletteEntry = { id: 'x', kind: 'task', name: 'Recall invoices' };
    // "call" is inside "Recall", not the start of a word: 40, not 60.
    expect(scoreEntry(entry, ['call'])).toBe(40);
    expect(scoreEntry({ ...entry, name: 'Re-call invoices' }, ['call'])).toBe(60);
  });
});

describe('looksLikeQuestion', () => {
  it('takes a question mark, or a question or instruction word leading three or more', () => {
    expect(looksLikeQuestion('due today?')).toBe(true);
    expect(looksLikeQuestion("what's due this week")).toBe(true);
    expect(looksLikeQuestion('add a task to call the CA')).toBe(true);
    expect(looksLikeQuestion('call the CA')).toBe(false);
    expect(looksLikeQuestion('add task')).toBe(false);
    expect(looksLikeQuestion('')).toBe(false);
  });
});

describe('normalise', () => {
  it('collapses space and drops accents', () => {
    expect(normalise('  Café   Menu ')).toBe('cafe menu');
  });
});
