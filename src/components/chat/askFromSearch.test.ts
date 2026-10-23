import { describe, expect, it } from 'vitest';
import { askAtlasText } from './askFromSearch';

describe('the chat search asking Atlas (OPT-9)', () => {
  it('sends a question as he typed it', () => {
    expect(askAtlasText('  what did we decide about the lease? ')).toBe('what did we decide about the lease?');
    expect(askAtlasText('when is the GST return due')).toBe('when is the GST return due');
  });

  it('turns a bare word into something to find, and says where to look', () => {
    expect(askAtlasText('lease  renewal')).toBe(
      'Find "lease renewal" for me. No chat matches it, so look in my tasks, my projects and your notes.',
    );
  });
});
