import { describe, expect, it } from 'vitest';
import { formatSpan, formatSpanSpoken } from './timeSpan';

describe('formatSpanSpoken', () => {
  it('says whole hours in words', () => {
    expect(formatSpanSpoken(5 * 3600)).toBe('5 hours');
    expect(formatSpanSpoken(3600)).toBe('1 hour');
  });

  it('says anything else as formatSpan does', () => {
    expect(formatSpanSpoken(4.5 * 3600)).toBe(formatSpan(4.5 * 3600));
    expect(formatSpanSpoken(45 * 60)).toBe('45m');
    expect(formatSpanSpoken(0)).toBe('0m');
    expect(formatSpanSpoken(-60)).toBe('0m');
  });
});
