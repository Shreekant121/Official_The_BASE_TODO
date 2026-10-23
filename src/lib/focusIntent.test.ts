import { describe, expect, it } from 'vitest';
import { cleanIntent, doneQuestion, INTENT_MAX, stampFocusEntry } from './focusIntent';
import { mergeFocusLogs, type FocusLogEntry } from '../store/useStore';

const entry = (id: string, taskId: string, endedAt: number, more: Partial<FocusLogEntry> = {}): FocusLogEntry =>
  ({ id, taskId, taskTitle: 'x', seconds: 60, startedAt: endedAt - 60_000, endedAt, ...more });

describe('the line', () => {
  it('is one trimmed line, capped', () => {
    expect(cleanIntent('  sent\n the   draft  ')).toBe('sent the draft');
    expect(cleanIntent('a'.repeat(200))).toHaveLength(INTENT_MAX);
    expect(cleanIntent('   ')).toBe('');
  });

  it('is asked back in his own words, without a doubled full stop', () => {
    expect(doneQuestion('uploaded the signed forms.')).toBe('You said you’d have uploaded the signed forms. Did you?');
    expect(doneQuestion('sent it!!')).toBe('You said you’d have sent it. Did you?');
  });
});

describe('stampFocusEntry', () => {
  const log = [entry('a', 't1', 1000), entry('b', 't2', 2000), entry('c', 't1', 3000), entry('d', 't2', 4000)];

  it('writes onto the latest entry for the task', () => {
    const next = stampFocusEntry(log, 't1', 0, { intent: 'sent it', outcome: 'yes' });
    expect(next[2]).toMatchObject({ id: 'c', intent: 'sent it', outcome: 'yes' });
    expect(next[0].intent).toBeUndefined();
    expect(log[2].intent).toBeUndefined();
  });

  it('leaves the log alone when there is nothing to write or no entry of this run', () => {
    expect(stampFocusEntry(log, 't1', 0, { intent: '  ' })).toBe(log);
    expect(stampFocusEntry(log, 't1', 3500, { intent: 'sent it' })).toBe(log);
    expect(stampFocusEntry(log, 't9', 0, { intent: 'sent it' })).toBe(log);
  });

  it('never writes an undefined field (Firestore refuses the document)', () => {
    const next = stampFocusEntry(log, 't1', 0, { outcome: 'partly' });
    expect('intent' in next[2]).toBe(false);
  });
});

describe('mergeFocusLogs keeps a stamp the cloud has not seen yet', () => {
  it('takes the union of the two copies of one entry', () => {
    const local = [entry('a', 't1', 1000, { intent: 'sent it', outcome: 'yes' })];
    const cloud = [entry('a', 't1', 1000)];
    expect(mergeFocusLogs(local, cloud)[0]).toMatchObject({ intent: 'sent it', outcome: 'yes' });
    expect(mergeFocusLogs(cloud, local)[0]).toMatchObject({ intent: 'sent it', outcome: 'yes' });
  });
});
