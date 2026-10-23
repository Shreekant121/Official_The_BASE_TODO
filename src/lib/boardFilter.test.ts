import { describe, expect, it } from 'vitest';
import { boardFilter, isFiltering, NO_FILTER, noMatchSentence, passesBoardFilter, showsFinished } from './boardFilter';

const open = { title: 'Call the CA', description: 'About GST', status: 'needsAction' as const };
const live = { title: 'Write the brief', status: 'in-progress' as const };
const done = { title: 'Pay the café bill', status: 'completed' as const };

describe('boardFilter', () => {
  it('is no filter when nothing is typed and All is on', () => {
    expect(boardFilter('   ', 'all')).toEqual(NO_FILTER);
    expect(isFiltering(NO_FILTER)).toBe(false);
    expect(isFiltering(boardFilter('ca', 'all'))).toBe(true);
    expect(isFiltering(boardFilter('', 'todo'))).toBe(true);
  });

  it('All is the board as it was: Show done decides the finished rows', () => {
    expect(passesBoardFilter(done, 'Bills', NO_FILTER, false)).toBe(false);
    expect(passesBoardFilter(done, 'Bills', NO_FILTER, true)).toBe(true);
    expect(passesBoardFilter(open, 'Bills', NO_FILTER, false)).toBe(true);
  });

  it('a chip asks for exactly its status, whatever Show done says', () => {
    const todo = boardFilter('', 'todo');
    const progress = boardFilter('', 'progress');
    const finished = boardFilter('', 'done');
    expect([open, live, done].map((t) => passesBoardFilter(t, 'L', todo, true))).toEqual([true, false, false]);
    expect([open, live, done].map((t) => passesBoardFilter(t, 'L', progress, true))).toEqual([false, true, false]);
    expect([open, live, done].map((t) => passesBoardFilter(t, 'L', finished, false))).toEqual([false, false, true]);
  });

  it('every word must be in the title, description or list name', () => {
    expect(passesBoardFilter(open, 'Admin', boardFilter('call gst', 'all'), false)).toBe(true);
    expect(passesBoardFilter(open, 'Admin', boardFilter('call plumber', 'all'), false)).toBe(false);
    expect(passesBoardFilter(open, 'Admin', boardFilter('admin', 'all'), false)).toBe(true);
    expect(passesBoardFilter(live, 'Marketing', boardFilter('mark', 'all'), false)).toBe(true);
  });

  it('ignores case, accents and extra spaces, and a half-typed word matches', () => {
    expect(passesBoardFilter(done, 'L', boardFilter('  CAFE   bi ', 'done'), false)).toBe(true);
    expect(passesBoardFilter(open, 'L', boardFilter('Cal', 'all'), false)).toBe(true);
  });

  it('words and a chip narrow together', () => {
    expect(passesBoardFilter(open, 'L', boardFilter('call', 'progress'), false)).toBe(false);
    expect(passesBoardFilter(live, 'L', boardFilter('brief', 'progress'), false)).toBe(true);
  });

  it('says what is missing when nothing matches', () => {
    expect(noMatchSentence('  invoice  march ', 'all')).toBe('Nothing matches **“invoice march”**. Try **another word**, or clear the filter.');
    expect(noMatchSentence('in**voice*', 'done')).toBe('Nothing matches **“invoice”**. Try **another word**, or clear the filter.');
    expect(noMatchSentence('', 'progress')).toBe('Nothing is **in progress** right now.');
    expect(noMatchSentence('', 'todo')).toBe('Nothing **left to do** here.');
  });

  it('finished rows can show under All with Show done, or under Done', () => {
    expect(showsFinished(NO_FILTER, false)).toBe(false);
    expect(showsFinished(NO_FILTER, true)).toBe(true);
    expect(showsFinished(boardFilter('', 'done'), false)).toBe(true);
    expect(showsFinished(boardFilter('', 'todo'), true)).toBe(false);
  });
});
