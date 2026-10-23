import { describe, expect, it } from 'vitest';
import { SLIDE_FROM_MINUTES, sessionMinutes, startsBySlide } from './focusCommitment';

describe('a Start that slides (29-1P2)', () => {
  it('adds each task as Focus reads it: time given today, then the estimate', () => {
    // 3600 s given today beats a 20 min estimate; a bare task is the 30 min default.
    expect(sessionMinutes([{ allocatedTime: 3600, estimatedTime: 20 }, { estimatedTime: 25 }, {}])).toBe(60 + 25 + 30);
  });

  it('slides from 90 minutes, not before', () => {
    expect(SLIDE_FROM_MINUTES).toBe(90);
    expect(startsBySlide(89)).toBe(false);
    expect(startsBySlide(90)).toBe(true);
    expect(startsBySlide(sessionMinutes([{ allocatedTime: 45 * 60 }, { allocatedTime: 45 * 60 }]))).toBe(true);
  });
});
