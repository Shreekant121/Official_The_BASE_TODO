import { describe, it, expect } from 'vitest';
import { hourPhaseAt, msUntilNextPhase, navCellLight, screenLightFor } from './screenLight';

/**
 * Each screen's light (29-1P5a). Dates are built from local parts, so the
 * assertions hold in whatever zone the machine running them is in.
 */
const at = (h: number, m = 0) => new Date(2026, 2, 12, h, m, 0, 0);

describe('hourPhaseAt', () => {
  it('follows the greeting: morning from 5, afternoon from 12, evening from 17', () => {
    expect(hourPhaseAt(at(5))).toBe('morning');
    expect(hourPhaseAt(at(11, 59))).toBe('morning');
    expect(hourPhaseAt(at(12))).toBe('afternoon');
    expect(hourPhaseAt(at(16, 59))).toBe('afternoon');
    expect(hourPhaseAt(at(17))).toBe('evening');
  });

  it('is night from nine until five, across midnight', () => {
    expect(hourPhaseAt(at(21))).toBe('night');
    expect(hourPhaseAt(at(0))).toBe('night');
    expect(hourPhaseAt(at(4, 59))).toBe('night');
  });
});

describe('msUntilNextPhase', () => {
  it('waits for the next change of sky on the hour', () => {
    expect(msUntilNextPhase(at(9, 30))).toBe(2.5 * 3600_000);
    expect(msUntilNextPhase(at(20, 0))).toBe(3600_000);
  });

  it('crosses midnight to morning from the evening of the night before', () => {
    expect(msUntilNextPhase(at(23))).toBe(6 * 3600_000);
    expect(msUntilNextPhase(at(2))).toBe(3 * 3600_000);
  });
});

describe('screenLightFor', () => {
  it('gives the Dashboard the hour, and nothing else', () => {
    expect(screenLightFor('/dashboard', 'evening')).toBe('hour-evening');
    expect(screenLightFor('/', 'evening')).toBe('emerald');
  });

  it('takes each screen colour from its job', () => {
    expect(screenLightFor('/select', 'morning')).toBe('emerald');
    expect(screenLightFor('/focus', 'morning')).toBe('teal');
    expect(screenLightFor('/start/t1', 'morning')).toBe('teal');
    expect(screenLightFor('/deadlines', 'morning')).toBe('sky');
    expect(screenLightFor('/notifications', 'morning')).toBe('sky');
    expect(screenLightFor('/scoring', 'morning')).toBe('coral');
    expect(screenLightFor('/chat', 'morning')).toBe('violet');
    expect(screenLightFor('/log', 'morning')).toBe('violet');
    expect(screenLightFor('/settings', 'morning')).toBe('neutral');
    expect(screenLightFor('/trash', 'morning')).toBe('neutral');
  });

  it('keeps BASE emerald for boards and anything unnamed', () => {
    expect(screenLightFor('/project/p1', 'night')).toBe('emerald');
    expect(screenLightFor('/s/abc', 'night')).toBe('emerald');
    expect(screenLightFor('/login', 'night')).toBe('emerald');
  });
});

describe('navCellLight', () => {
  it("gives each nav icon its screen's light, and the Dashboard the hour", () => {
    expect(navCellLight('/dashboard')).toBe('hour');
    expect(navCellLight('/')).toBe('emerald');
    expect(navCellLight('/chat')).toBe('violet');
    expect(navCellLight('/select')).toBe('emerald');
    expect(navCellLight('/scoring')).toBe('coral');
    expect(navCellLight('/notifications')).toBe('sky');
    expect(navCellLight('/settings')).toBe('neutral');
  });
});
