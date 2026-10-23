/**
 * The v10 upgrade (OPT-3): notes and tags left the app. His call on what was
 * already stored — notes are added to the end of the description, so nothing
 * he wrote is lost, and tags are deleted.
 *
 * The cloud document has no schema version, so the same function runs on
 * every snapshot as well as in the persist migration; the tests below hold
 * the two properties that makes load-bearing — it never doubles a note, and
 * it hands back the same array when there is nothing to do.
 */
import { describe, expect, it } from 'vitest';
import {
  upgradeFocusLogTags,
  upgradeTaskNotesAndTags,
  type FocusLogEntry,
  type Task,
} from './useStore';
import { hydrateFromPayload, type SyncPayload } from '../lib/syncPayload';

/** A pre-OPT-3 task, in the shape the store actually held. */
type OldTask = Task & { notes?: string; tags?: string[] };

function old(fields: Partial<OldTask> = {}): OldTask {
  return { id: 't1', title: 'File the GST return', status: 'needsAction', ...fields };
}

describe('upgradeTaskNotesAndTags', () => {
  it('adds the notes to the end of the description', () => {
    const [after] = upgradeTaskNotesAndTags([old({ description: 'Q3 filing.', notes: 'CA wants the bank statement.' })]);
    expect(after.description).toBe('Q3 filing.\n\nCA wants the bank statement.');
    expect('notes' in after).toBe(false);
  });

  it('makes the notes the description when there was none', () => {
    const [after] = upgradeTaskNotesAndTags([old({ notes: '  Use the new login.  ' })]);
    expect(after.description).toBe('Use the new login.');
  });

  it('deletes the tags', () => {
    const [after] = upgradeTaskNotesAndTags([old({ tags: ['legal', 'blocking'] })]);
    expect('tags' in after).toBe(false);
    expect(after.description).toBeUndefined();
  });

  it('drops empty notes without touching the description', () => {
    const [after] = upgradeTaskNotesAndTags([old({ description: 'Q3 filing.', notes: '   ' })]);
    expect(after.description).toBe('Q3 filing.');
    expect('notes' in after).toBe(false);
  });

  it('never adds the same notes twice', () => {
    const once = upgradeTaskNotesAndTags([old({ description: 'Q3 filing.', notes: 'Bring the PAN.' })]);
    const again = upgradeTaskNotesAndTags([{ ...once[0], notes: 'Bring the PAN.' } as OldTask]);
    expect(again[0].description).toBe('Q3 filing.\n\nBring the PAN.');
  });

  it('returns the same array when nothing needs it', () => {
    const tasks: Task[] = [old({ description: 'Already clean.' })];
    expect(upgradeTaskNotesAndTags(tasks)).toBe(tasks);
  });

  it('leaves every other field alone', () => {
    const [after] = upgradeTaskNotesAndTags([old({ deadline: '2026-10-10T18:00', links: [{ id: 'l', title: 'Portal', url: 'https://x' }], tags: ['gst'] })]);
    expect(after).toMatchObject({ deadline: '2026-10-10T18:00', links: [{ id: 'l', title: 'Portal', url: 'https://x' }] });
  });
});

describe('upgradeFocusLogTags', () => {
  const entry = (fields: object = {}): FocusLogEntry =>
    ({ id: 'f1', taskId: 't1', taskTitle: 'x', seconds: 60, startedAt: 0, endedAt: 60_000, ...fields }) as FocusLogEntry;

  it('removes the copied tags and keeps the time', () => {
    const [after] = upgradeFocusLogTags([entry({ tags: ['deep'] })]);
    expect('tags' in after).toBe(false);
    expect(after.seconds).toBe(60);
  });

  it('returns the same array when nothing needs it', () => {
    const entries = [entry()];
    expect(upgradeFocusLogTags(entries)).toBe(entries);
  });
});

describe('the cloud door', () => {
  it('upgrades a snapshot written before OPT-3', () => {
    const payload = {
      taskLists: [],
      backlogTasks: [old({ notes: 'From the cloud.', tags: ['x'] })],
      tasks: [old({ notes: 'From the cloud.', tags: ['x'] })],
      focusLog: [{ id: 'f1', taskId: 't1', taskTitle: 'x', seconds: 60, startedAt: 0, endedAt: 60_000, tags: ['x'] }],
    } as unknown as SyncPayload;
    const hydrated = hydrateFromPayload(payload);
    for (const task of [...hydrated.backlogTasks, ...hydrated.tasks]) {
      expect(task.description).toBe('From the cloud.');
      expect('notes' in task || 'tags' in task).toBe(false);
    }
    expect('tags' in hydrated.focusLog[0]).toBe(false);
  });
});
