/**
 * **A task due before an event, through the real stores** (29-2d1).
 *
 * `lib/events/eventLinks.test.ts` pins which date a linked task takes. What
 * is left is the wiring, all of it in places no screen shows at once: the
 * event store moving tasks in the main store when an event's date changes,
 * deleting an event lifting the link but keeping the date, a deadline set by
 * hand breaking the link, and item 18's maths reading a linked task as fixed.
 *
 * Events are dated well after the frozen clock and are one-offs, so the dates
 * read the same in any machine's zone.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStore, type Task } from './useStore';
import { useEventStore } from './useEventStore';
import { useUIStore } from './useUIStore';

function task(id: string, over: Partial<Task> = {}): Task {
  return { id, title: id, status: 'needsAction', listId: 'l1', order: 0, ...over };
}

const find = (id: string) => useStore.getState().backlogTasks.find((t) => t.id === id)!;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));
  useEventStore.setState({
    events: [
      { id: 'run', title: 'Marathon', start: '2030-03-10T06:00', createdAt: 0 },
      { id: 'trip', title: 'Goa', start: '2030-04-01', createdAt: 0 },
    ],
  });
  useStore.setState({
    projects: [],
    taskLists: [{ id: 'l1', title: 'Build', projectId: 'p1', order: 0 }],
    backlogTasks: [
      task('shoes', { deadline: '2030-03-10T06:00', eventId: 'run' }),
      task('bib', { deadline: '2030-03-10T06:00', eventId: 'run', status: 'completed', completedAt: 1 }),
      task('pack', { deadline: '2030-03-31T18:00', eventId: 'trip' }),
      task('free', { deadline: '2030-03-01T09:00' }),
    ],
    tasks: [],
    focusLog: [],
  });
  useUIStore.setState({ deadlineShift: null });
});

afterEach(() => vi.useRealTimers());

describe('an event and its tasks', () => {
  it('moves its open tasks when its date moves, and leaves a finished one', () => {
    expect(useEventStore.getState().updateEvent('run', { start: '2030-03-17T07:30' })).toBe(true);
    expect(find('shoes')).toMatchObject({ deadline: '2030-03-17T07:30', eventId: 'run' });
    expect(find('bib').deadline).toBe('2030-03-10T06:00');
    expect(find('free').deadline).toBe('2030-03-01T09:00');
  });

  it('moves nothing when only its name or place changes', () => {
    const before = useStore.getState().backlogTasks;
    useEventStore.getState().updateEvent('run', { title: 'Mumbai Marathon', location: 'Marine Drive' });
    expect(useStore.getState().backlogTasks).toBe(before);
  });

  it('turned all day, its tasks are due 6pm the day before', () => {
    useEventStore.getState().updateEvent('run', { start: '2030-03-10' });
    expect(find('shoes').deadline).toBe('2030-03-09T18:00');
  });

  it('deleted, it lifts the link and keeps the date', () => {
    useEventStore.getState().removeEvent('trip');
    expect(find('pack').eventId).toBeUndefined();
    expect(find('pack').deadline).toBe('2030-03-31T18:00');
    expect(find('shoes').eventId).toBe('run');
  });
});

describe('a linked task', () => {
  it('loses its link to a deadline set by hand', () => {
    useStore.getState().updateBacklogTask('shoes', { deadline: '2030-03-05T09:00' });
    expect(find('shoes')).toMatchObject({ deadline: '2030-03-05T09:00' });
    expect(find('shoes').eventId).toBeUndefined();
  });

  it('keeps it through an edit that does not touch the date', () => {
    useStore.getState().updateBacklogTask('shoes', { title: 'Buy running shoes', deadline: '2030-03-10T06:00' });
    expect(find('shoes').eventId).toBe('run');
  });

  it("a repeating one's next copy is not due before the event", () => {
    useStore.getState().updateBacklogTask('shoes', { recurrence: 'monthly' });
    useStore.getState().updateBacklogTask('shoes', { status: 'completed' });
    const next = useStore.getState().backlogTasks.find((t) => t.seriesId && t.id !== 'shoes')!;
    expect(next.deadline).toBe('2030-04-10T06:00');
    expect(next.eventId).toBeUndefined();
    expect(find('shoes').eventId).toBe('run');
  });

  it('is fixed to deadline maths: a late prerequisite is a conflict, not a move', () => {
    useStore.getState().updateBacklogTask('free', { deadline: '2030-03-12T09:00' });
    useStore.getState().updateBacklogTask('shoes', { dependsOn: ['free'] });
    expect(find('shoes').deadline).toBe('2030-03-10T06:00');
    expect(useUIStore.getState().deadlineShift?.conflicts.map((c) => c.taskId)).toEqual(['shoes']);
  });
});
