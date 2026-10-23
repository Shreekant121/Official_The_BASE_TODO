import { beforeEach, describe, expect, it } from 'vitest';
import { whatsOn } from './eventTools';
import { useEventStore } from '../../../store/useEventStore';
import { useStore, type Task } from '../../../store/useStore';
import { useSnapshotStore } from '../../../store/useSnapshotStore';
import { liveAgentStore } from '../liveContext';
import type { ToolContext } from '../types';

/** 29-2e1: Atlas reads a day or a week of his calendar, as the Calendar screen draws it. */

const TZ = 'Asia/Kolkata';
/** Wednesday 21 October 2026, 9am in Kolkata. */
const NOW = new Date('2026-10-21T09:00:00+05:30');

function ctx(): ToolContext {
  return {
    snapshotHandle: useSnapshotStore.getState().beginTurn('test'),
    now: NOW,
    timezone: TZ,
    store: liveAgentStore,
    snapshots: { captureTask: () => {}, captureList: () => {}, captureProject: () => {}, captureEvent: () => {} },
  };
}

const task = (id: string, over: Partial<Task> = {}): Task => ({ id, title: id, status: 'needsAction', listId: 'action-steps', order: 0, ...over });

beforeEach(() => {
  useEventStore.setState({
    events: [
      { id: 'gym', title: 'Gym', start: '2026-10-01T07:00', recurrence: 'weekly', createdAt: 0 },
      { id: 'bday', title: "Mum's birthday", start: '1964-10-24', recurrence: 'yearly', createdAt: 0 },
      { id: 'dentist', title: 'Dentist', start: '2026-10-22T15:00', end: '2026-10-22T16:30', location: 'Bandra', createdAt: 0 },
    ],
  });
  useStore.setState({
    projects: [],
    taskLists: [{ id: 'action-steps', title: 'Action Steps', order: 0 }, { id: 'parked', title: 'Parked', order: 1, ignored: true }],
    backlogTasks: [
      task('report', { title: 'Send the report', deadline: '2026-10-22T18:00' }),
      task('late', { title: 'Call the bank', deadline: '2026-10-20T11:00' }),
      task('done', { title: 'Pay rent', deadline: '2026-10-22T09:00', status: 'completed' }),
      task('parked', { title: 'Someday thing', deadline: '2026-10-22T12:00', listId: 'parked' }),
    ],
    tasks: [],
  });
});

describe('whats_on', () => {
  it('reads one day: events with times, every repeat, and the tasks due, ignored work left out', async () => {
    const result = await whatsOn.execute({ from: '2026-10-22' }, ctx());
    expect(result.ok).toBe(true);
    const [day] = (result.data as { days: Record<string, unknown>[] }).days;
    expect(day).toEqual({
      day: '2026-10-22',
      weekday: 'Thursday 22 October',
      events: [
        { eventId: 'gym', title: 'Gym', time: '07:00–08:00' },
        { eventId: 'dentist', title: 'Dentist', time: '15:00–16:30', location: 'Bandra' },
      ],
      tasksDue: [
        { taskId: 'done', title: 'Pay rent', due: '09:00', done: true },
        { taskId: 'report', title: 'Send the report', due: '18:00' },
      ],
    });
    expect(result.summary).toBe('Thursday 22 October: 2 events and 2 tasks due.');
  });

  it('reads a run of days, saying which have nothing on and which work is overdue', async () => {
    const result = await whatsOn.execute({ from: 'today', to: '2026-10-25' }, ctx());
    const days = (result.data as { days: Record<string, unknown>[] }).days;
    expect(days.map((d) => d.day)).toEqual(['2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']);
    expect(days[0]).toEqual({ day: '2026-10-21', weekday: 'Wednesday 21 October', nothing: true });
    expect(days[3]).toMatchObject({ events: [{ eventId: 'bday', time: 'all day' }] });
    const yesterday = await whatsOn.execute({ from: '2026-10-20' }, ctx());
    expect((yesterday.data as { days: Record<string, unknown>[] }).days[0]).toMatchObject({
      tasksDue: [{ taskId: 'late', due: '11:00', overdue: true }],
    });
  });

  it('refuses a range that runs backwards or past 31 days', async () => {
    await expect(whatsOn.execute({ from: '2026-10-25', to: '2026-10-21' }, ctx())).resolves.toMatchObject({ ok: false });
    await expect(whatsOn.execute({ from: '2026-10-01', to: '2026-12-01' }, ctx())).resolves.toMatchObject({ ok: false });
  });
});
