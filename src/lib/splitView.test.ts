import { describe, expect, it } from 'vitest';
import { closePanePath, replacePanePath, resolveSplit, splitPath } from './splitView';

const has = (...ids: string[]) => (id: string) => ids.includes(id);

describe('splitPath', () => {
  it('writes the second board as ?beside', () => {
    expect(splitPath('a', 'b')).toBe('/project/a?beside=b');
  });
  it('is the single board with no partner, or the same one twice', () => {
    expect(splitPath('a')).toBe('/project/a');
    expect(splitPath('a', null)).toBe('/project/a');
    expect(splitPath('a', 'a')).toBe('/project/a');
  });
});

describe('resolveSplit', () => {
  it('opens both when both exist', () => {
    expect(resolveSplit(has('a', 'b'), 'a', 'b')).toEqual({ left: 'a', right: 'b' });
  });
  it('is one board when there is no partner', () => {
    expect(resolveSplit(has('a', 'b'), 'a', null)).toEqual({ left: 'a', right: null });
    expect(resolveSplit(has('a', 'b'), 'a', undefined)).toEqual({ left: 'a', right: null });
  });
  it('never opens one project twice', () => {
    expect(resolveSplit(has('a'), 'a', 'a')).toEqual({ left: 'a', right: null });
  });
  it('drops a partner that is gone', () => {
    expect(resolveSplit(has('a'), 'a', 'gone')).toEqual({ left: 'a', right: null });
  });
  it('keeps the partner as the single board when the left one is gone', () => {
    expect(resolveSplit(has('b'), 'gone', 'b')).toEqual({ left: 'b', right: null });
  });
  it('is nothing when neither exists', () => {
    expect(resolveSplit(has(), 'x', 'y')).toEqual({ left: null, right: null });
  });
});

describe('closing and replacing a board', () => {
  const split = { left: 'a', right: 'b' };
  it('closing one leaves the other alone', () => {
    expect(closePanePath(split, 0)).toBe('/project/b');
    expect(closePanePath(split, 1)).toBe('/project/a');
  });
  it('replacing one keeps the other beside it', () => {
    expect(replacePanePath(split, 0, 'c')).toBe('/project/c?beside=b');
    expect(replacePanePath(split, 1, 'c')).toBe('/project/a?beside=c');
  });
  it('replacing one with its partner collapses to one board', () => {
    expect(replacePanePath(split, 0, 'b')).toBe('/project/b');
  });
});
