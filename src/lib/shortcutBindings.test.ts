import { describe, expect, it } from 'vitest';
import {
  EMPTY_PREFS,
  builtInKey,
  normaliseKey,
  placePhrase,
  refusal,
  sanitisePrefs,
  withBuiltInKey,
  withCustomAdded,
  withCustomKey,
  withCustomRemoved,
  type ShortcutPrefs,
} from './shortcutBindings';

const names = (command: string) => ({ 'go-score': 'Go to Score', 'go-home': 'Go to Home' })[command];

describe('normaliseKey', () => {
  it('takes one printable character, lower-cased', () => {
    expect(normaliseKey('P')).toBe('p');
    expect(normaliseKey('7')).toBe('7');
    expect(normaliseKey(';')).toBe(';');
  });

  it('refuses named keys and space', () => {
    for (const raw of ['Escape', 'Enter', 'Tab', 'ArrowUp', ' ', '', 'Unidentified', 'Dead']) {
      expect(normaliseKey(raw)).toBeNull();
    }
  });
});

describe('refusal', () => {
  it('lets a key go on a built-in when nothing live there holds it', () => {
    expect(refusal(EMPTY_PREFS, { kind: 'built-in', id: 'new-project' }, 'x', names)).toBeNull();
  });

  it('never gives out g or ?', () => {
    expect(refusal(EMPTY_PREFS, { kind: 'built-in', id: 'new-task' }, 'g', names)).toMatch(/go-to sequences/);
    expect(refusal(EMPTY_PREFS, { kind: 'custom', id: 'c1' }, '?', names)).toMatch(/opens this sheet/);
  });

  it('refuses a key held where both would be live, and names the holder', () => {
    expect(refusal(EMPTY_PREFS, { kind: 'built-in', id: 'new-project' }, 's', names))
      .toBe('S is already Smart Start on Home.');
    expect(refusal(EMPTY_PREFS, { kind: 'built-in', id: 'new-task' }, 'l', names))
      .toBe('L is already New list on New Session and project boards.');
  });

  it('allows one key on two screens that are never live together', () => {
    // New task is on New Session and project boards, New project only on Home.
    expect(refusal(EMPTY_PREFS, { kind: 'built-in', id: 'new-project' }, 'n', names)).toBeNull();
  });

  it('treats his own shortcuts as live everywhere', () => {
    expect(refusal(EMPTY_PREFS, { kind: 'custom', id: 'c1' }, 'n', names))
      .toBe('N is already New task on New Session and project boards.');
    const prefs = withCustomAdded(EMPTY_PREFS, { id: 'c1', command: 'go-score', key: 'x' });
    expect(refusal(prefs, { kind: 'built-in', id: 'new-project' }, 'x', names)).toBe('X is already Go to Score everywhere.');
  });

  it('is never refused by its own current key', () => {
    expect(refusal(EMPTY_PREFS, { kind: 'built-in', id: 'smart-start' }, 's', names)).toBeNull();
    const prefs = withCustomAdded(EMPTY_PREFS, { id: 'c1', command: 'go-score', key: 'x' });
    expect(refusal(prefs, { kind: 'custom', id: 'c1' }, 'x', names)).toBeNull();
  });

  it('reads a moved key, not the default', () => {
    const prefs = withBuiltInKey(EMPTY_PREFS, 'smart-start', 'z');
    expect(refusal(prefs, { kind: 'built-in', id: 'new-project' }, 's', names)).toBeNull();
    expect(refusal(prefs, { kind: 'built-in', id: 'new-project' }, 'z', names)).toBe('Z is already Smart Start on Home.');
  });
});

describe('editing', () => {
  it('stores only a key that differs from the default', () => {
    const moved = withBuiltInKey(EMPTY_PREFS, 'new-task', 't');
    expect(moved.keys).toEqual({ 'new-task': 't' });
    expect(builtInKey(moved, 'new-task')).toBe('t');
    const back = withBuiltInKey(moved, 'new-task', 'n');
    expect(back.keys).toEqual({});
    expect(builtInKey(back, 'new-task')).toBe('n');
  });

  it('adds, rekeys and removes his own', () => {
    let prefs = withCustomAdded(EMPTY_PREFS, { id: 'c1', command: 'go-score', key: 'x' });
    prefs = withCustomKey(prefs, 'c1', 'y');
    expect(prefs.custom).toEqual([{ id: 'c1', command: 'go-score', key: 'y' }]);
    expect(withCustomRemoved(prefs, 'c1').custom).toEqual([]);
  });
});

describe('placePhrase', () => {
  it('reads as English', () => {
    expect(placePhrase(['home'])).toBe('on Home');
    expect(placePhrase(['session', 'project'])).toBe('on New Session and project boards');
    expect(placePhrase(['anywhere'])).toBe('everywhere');
  });
});

describe('sanitisePrefs', () => {
  it('returns empty prefs for anything that is not an object', () => {
    for (const raw of [null, undefined, 'x', 3, []]) expect(sanitisePrefs(raw)).toEqual(EMPTY_PREFS);
  });

  it('keeps a clean set as it was', () => {
    const prefs: ShortcutPrefs = {
      keys: { 'new-task': 't' },
      custom: [{ id: 'c1', command: 'go-score', key: 'x' }],
    };
    expect(sanitisePrefs(JSON.parse(JSON.stringify(prefs)))).toEqual(prefs);
  });

  it('keeps a swap, which is only valid judged whole', () => {
    const raw = { keys: { 'new-project': 's', 'smart-start': 'p' }, custom: [] };
    expect(sanitisePrefs(raw)).toEqual(raw);
  });

  it('drops unknown ids, bad keys and malformed rows', () => {
    const raw = {
      keys: { 'new-task': 'Enter', nonsense: 'q', 'new-list': 'K' },
      custom: [{ id: 'c1', command: 'go-score' }, 'x', { id: 'c2', command: 'go-home', key: 'h' }],
    };
    expect(sanitisePrefs(raw)).toEqual({ keys: { 'new-list': 'k' }, custom: [{ id: 'c2', command: 'go-home', key: 'h' }] });
  });

  it('sheds his newest clashing shortcut before a moved built-in', () => {
    const raw = {
      keys: { 'new-task': 'x' },
      custom: [
        { id: 'c1', command: 'go-score', key: 'y' },
        { id: 'c2', command: 'go-home', key: 'x' },
      ],
    };
    expect(sanitisePrefs(raw)).toEqual({ keys: { 'new-task': 'x' }, custom: [{ id: 'c1', command: 'go-score', key: 'y' }] });
  });

  it('puts a moved built-in back when it clashes with another', () => {
    const raw = { keys: { 'new-project': 's' }, custom: [] };
    expect(sanitisePrefs(raw)).toEqual(EMPTY_PREFS);
  });

  it('never keeps g or ?', () => {
    const raw = { keys: { 'new-task': 'g' }, custom: [{ id: 'c1', command: 'go-score', key: '?' }] };
    expect(sanitisePrefs(raw)).toEqual(EMPTY_PREFS);
  });
});
