import { describe, expect, it } from 'vitest';
import { catalogLink, noteName, rememberedNotes } from './remembered';

const call = (name: string, extra: Partial<{ ok: boolean; args: Record<string, unknown>; data: unknown }> = {}) => ({
  name,
  ok: extra.ok ?? true,
  args: extra.args ?? {},
  data: extra.data,
});

describe('rememberedNotes', () => {
  it('finds the notes written and appended to, each once, in order', () => {
    expect(
      rememberedNotes([
        call('search_tasks', { args: { query: 'gym' } }),
        call('append_note', { args: { path: 'preferences/gym.md', line: 'Gym at 7' }, data: { path: 'preferences/gym.md', memories: 3 } }),
        call('write_note', { args: { path: 'people/rahul.md', body: '# Rahul' }, data: { path: 'people/rahul.md', memories: 1 } }),
        call('append_note', { args: { path: 'preferences/gym.md', line: 'Not Sundays' }, data: { path: 'preferences/gym.md' } }),
      ]),
    ).toEqual(['preferences/gym.md', 'people/rahul.md']);
  });

  it('takes the path Atlas wrote to over the one the model asked for', () => {
    expect(rememberedNotes([call('write_note', { args: { path: 'rahul' }, data: { path: 'people/rahul.md' } })])).toEqual([
      'people/rahul.md',
    ]);
    expect(rememberedNotes([call('write_note', { args: { path: 'people/rahul.md' } })])).toEqual(['people/rahul.md']);
  });

  it('skips a save that failed, one held back, reads, and a call with no path', () => {
    expect(
      rememberedNotes([
        call('write_note', { ok: false, args: { path: 'people/x.md' } }),
        call('write_note', { args: { path: 'people/y.md' }, data: { held: true } }),
        call('read_note', { args: { path: 'people/z.md' } }),
        call('delete_note', { args: { path: 'people/z.md' } }),
        call('append_note', { args: { path: '  ' } }),
      ]),
    ).toEqual([]);
  });
});

describe('noteName', () => {
  it('says a note the way he would', () => {
    expect(noteName('people/rahul-mehta.md')).toBe('Rahul mehta');
    expect(noteName('preferences/gym.md')).toBe('Gym');
    expect(noteName('how-to/send_invoice.MD')).toBe('Send invoice');
    expect(noteName('loose')).toBe('Loose');
  });
});

describe('catalogLink', () => {
  it('opens the Catalog on that note', () => {
    expect(catalogLink('people/rahul mehta.md')).toBe('/catalog?note=people%2Frahul%20mehta.md');
  });
});
