import { describe, expect, it } from 'vitest';
import { PILL_IDLE, pillWords, stepPill, type PillEvent, type PillState } from './connectionPill';

const run = (...events: PillEvent['type'][]): PillState =>
  events.reduce<PillState>((s, type) => stepPill(s, { type } as PillEvent), PILL_IDLE);

describe('connectionPill', () => {
  it('says nothing while online', () => {
    expect(pillWords(run(), 'tablet')).toBeNull();
    expect(run('change', 'change')).toEqual(PILL_IDLE);
  });

  it('counts saves made offline and says them when they reach the cloud', () => {
    const offline = run('offline', 'change', 'change', 'change');
    expect(pillWords(offline, 'tablet')).toBe('Offline · saving on this tablet');
    const syncing = stepPill(offline, { type: 'online' });
    expect(pillWords(syncing, 'tablet')).toBe('Back online · syncing 3 changes');
    const back = stepPill(syncing, { type: 'synced' });
    expect(pillWords(back, 'laptop')).toBe('Back online · synced 3 changes');
    expect(stepPill(back, { type: 'hide' })).toEqual(PILL_IDLE);
  });

  it('says one change, and plain "Back online" for none', () => {
    expect(pillWords(run('offline', 'change', 'online', 'synced'), 'tablet')).toBe('Back online · synced 1 change');
    expect(pillWords(run('offline', 'online', 'synced'), 'tablet')).toBe('Back online');
  });

  it('keeps the waiting saves when the connection drops again mid-sync', () => {
    const s = run('offline', 'change', 'change', 'online', 'offline', 'change');
    expect(s).toEqual({ phase: 'offline', changes: 3 });
  });

  it('starts a fresh count after the last lot was said', () => {
    expect(run('offline', 'change', 'online', 'synced', 'offline')).toEqual({ phase: 'offline', changes: 0 });
  });

  it('does not count a save made after the connection came back', () => {
    expect(run('offline', 'change', 'online', 'change', 'synced')).toEqual({ phase: 'back', changes: 1 });
  });

  it('ignores a stale "synced" or "hide"', () => {
    expect(run('offline', 'synced')).toEqual({ phase: 'offline', changes: 0 });
    expect(run('offline', 'online', 'hide')).toEqual({ phase: 'syncing', changes: 0 });
  });
});
