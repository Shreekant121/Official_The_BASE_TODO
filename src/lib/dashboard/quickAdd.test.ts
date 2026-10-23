import { describe, expect, it } from 'vitest';
import { LINE_MAX_CHARS, addLabel, noteLines, quickAddList } from './quickAdd';

describe('noteLines', () => {
  it('makes one task per line that has words on it, in order', () => {
    expect(noteLines('call priya about the logo\n\n  buy printer ink  \n\nidea: a newsletter')).toEqual([
      'call priya about the logo',
      'buy printer ink',
      'idea: a newsletter',
    ]);
  });

  it('drops the bullets, boxes and numbers people type in front of a list', () => {
    expect(noteLines('- one\n* two\n• three\n– four\n[ ] five\n[x] six\n1. seven\n12) eight\n- [ ] nine')).toEqual([
      'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
    ]);
  });

  it('keeps a number that is part of the name', () => {
    expect(noteLines('3 coats of paint\n2026 tax return\n1.5 litres of milk')).toEqual([
      '3 coats of paint', '2026 tax return', '1.5 litres of milk',
    ]);
  });

  it('reads Windows line endings and lines that are only a bullet as nothing', () => {
    expect(noteLines('one\r\n-\r\n  \r\ntwo')).toEqual(['one', 'two']);
  });

  it('cuts a pasted paragraph to a task-sized name', () => {
    const [line] = noteLines('x'.repeat(LINE_MAX_CHARS + 50));
    expect(line).toHaveLength(LINE_MAX_CHARS);
  });

  it('has nothing to add from an empty note', () => {
    expect(noteLines('')).toEqual([]);
    expect(noteLines('\n \n')).toEqual([]);
  });
});

describe('quickAddList', () => {
  const lists = [
    { id: 'action', title: 'Action Steps' },
    { id: 'errands', title: 'Errands' },
  ];

  it('files into the list the block names', () => {
    expect(quickAddList(lists, 'errands').title).toBe('Errands');
  });

  it('files into Action Steps when it names none, or one that is gone', () => {
    expect(quickAddList(lists, undefined).id).toBe('action');
    expect(quickAddList(lists, 'deleted-long-ago').id).toBe('action');
  });

  it('still names Action Steps when the store has not loaded its lists', () => {
    expect(quickAddList([], undefined)).toEqual({ id: 'action', title: 'Action Steps' });
  });
});

describe('addLabel', () => {
  it('counts', () => {
    expect(addLabel(1)).toBe('Add 1 task');
    expect(addLabel(3)).toBe('Add 3 tasks');
  });
});
