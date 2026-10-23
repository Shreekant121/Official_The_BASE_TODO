import { beforeEach, describe, expect, it } from 'vitest';
import { createEvent, deleteEvent, listEvents, updateEvent } from './eventTools';
import { useEventStore } from '../../../store/useEventStore';
import { revertSnapshotEntries, useSnapshotStore, type SnapshotEntry } from '../../../store/useSnapshotStore';
import { liveAgentStore } from '../liveContext';
import type { ToolContext } from '../types';

/** 29-2a: Atlas makes, changes and deletes events, and Revert puts each back. */

const TZ = 'Asia/Kolkata';
const NOW = new Date('2026-10-21T09:00:00+05:30');

function ctx(): ToolContext {
  const snapshots = useSnapshotStore.getState();
  return {
    snapshotHandle: snapshots.beginTurn('test'),
    now: NOW,
    timezone: TZ,
    store: liveAgentStore,
    snapshots: {
      captureTask: () => {}, captureList: () => {}, captureProject: () => {},
      captureEvent: (h, id) => useSnapshotStore.getState().captureEvent(h, id),
    },
  };
}

/** What Atlas files and hands back: the turn's entries, as JSON. */
function undoOf(c: ToolContext): SnapshotEntry[] {
  return JSON.parse(JSON.stringify(useSnapshotStore.getState().takeDraft(c.snapshotHandle)?.entries ?? []));
}

beforeEach(() => useEventStore.setState({ events: [] }));

describe('create_event', () => {
  it('makes several in one call: a bare date is all day, a time is timed', async () => {
    const result = await createEvent.execute({
      events: [
        { title: 'Mumbai Marathon', start: '2026-11-12T06:00', location: 'Marine Drive' },
        { title: "Mum's birthday", start: '2026-12-03', repeat: 'yearly' },
      ],
    }, ctx());
    expect(result.ok).toBe(true);
    const events = useEventStore.getState().events;
    expect(events.map((e) => [e.title, e.start, e.recurrence])).toEqual([
      ['Mumbai Marathon', '2026-11-12T06:00', undefined],
      ["Mum's birthday", '2026-12-03', 'yearly'],
    ]);
    expect(result.summary).toContain('Mumbai Marathon');
  });

  it('takes a time with seconds, as gemma sent it (2026-10-21, 3 runs of 3)', async () => {
    await createEvent.execute({ events: [{ repeat: 'weekly', start: '2026-10-27T19:00:00', title: 'gym class' }] }, ctx());
    expect(useEventStore.getState().events[0]).toMatchObject({ start: '2026-10-27T19:00', recurrence: 'weekly' });
  });

  it('refuses a custom repeat with no rule, and an event with no start, naming each', async () => {
    const result = await createEvent.execute({
      events: [{ title: 'Review', start: '2026-10-30', repeat: 'custom' }, { title: 'Someday' }],
    }, ctx());
    expect(result.ok).toBe(false);
    expect(useEventStore.getState().events).toEqual([]);
  });

  it('Revert takes a created event away again', async () => {
    const c = ctx();
    await createEvent.execute({ events: [{ title: 'Trip', start: '2026-12-20' }] }, c);
    const outcomes = revertSnapshotEntries(undoOf(c), { undoCreations: true });
    expect(outcomes[0].status).toBe('restored');
    expect(useEventStore.getState().events).toEqual([]);
  });
});

describe('update_event and delete_event', () => {
  beforeEach(() => {
    useEventStore.getState().addEvent({ title: 'Race', start: '2026-11-12T06:00', location: 'Marine Drive' }, 'e1');
  });

  it('moves the date, clears a field with "", and Revert puts it all back', async () => {
    const before = structuredClone(useEventStore.getState().events[0]);
    const c = ctx();
    const result = await updateEvent.execute({ events: [{ eventId: 'e1', start: '2026-11-19T06:30', location: '', countdown: 'days' }] }, c);
    expect(result.ok).toBe(true);
    expect(useEventStore.getState().events[0]).toMatchObject({ start: '2026-11-19T06:30', countdown: 'days' });
    expect(useEventStore.getState().events[0].location).toBeUndefined();

    revertSnapshotEntries(undoOf(c), { undoCreations: true });
    expect(useEventStore.getState().events[0]).toEqual(before);
  });

  it('29-2b: sets the shape and takes the cover off, says both in the list, and Revert puts the cover back', async () => {
    useEventStore.getState().updateEvent('e1', { imageUrl: 'cover:abc' });
    const listed = await listEvents.execute({}, ctx());
    expect((listed.data as { events: Record<string, unknown>[] }).events[0]).toMatchObject({ hasCover: true });

    const c = ctx();
    const result = await updateEvent.execute({ events: [{ eventId: 'e1', shape: 'burst', removeCover: true }] }, c);
    expect(result.ok).toBe(true);
    expect(useEventStore.getState().events[0].shape).toBe('burst');
    expect(useEventStore.getState().events[0].imageUrl).toBeUndefined();
    expect((result.data as { events: Record<string, unknown>[] }).events[0]).toMatchObject({ shape: 'burst' });

    revertSnapshotEntries(undoOf(c), { undoCreations: true });
    expect(useEventStore.getState().events[0]).toMatchObject({ imageUrl: 'cover:abc' });
    expect(useEventStore.getState().events[0].shape).toBeUndefined();
  });

  it('refuses a shape it does not have', async () => {
    const result = await updateEvent.execute({ events: [{ eventId: 'e1', shape: 'star' }] }, ctx());
    expect(result.ok).toBe(false);
    expect(useEventStore.getState().events[0].shape).toBeUndefined();
  });

  it('an unknown id says to search, and changes nothing', async () => {
    const result = await updateEvent.execute({ events: [{ eventId: 'nope', title: 'X' }] }, ctx());
    expect(result.ok).toBe(false);
    expect(useEventStore.getState().events[0].title).toBe('Race');
  });

  it('a deleted event comes back whole on Revert', async () => {
    const before = structuredClone(useEventStore.getState().events[0]);
    const c = ctx();
    await deleteEvent.execute({ eventIds: ['e1'] }, c);
    expect(useEventStore.getState().events).toEqual([]);
    revertSnapshotEntries(undoOf(c), { undoCreations: true });
    expect(useEventStore.getState().events).toEqual([before]);
  });
});

describe('list_events', () => {
  it('soonest first with the time left; the archive only when asked', async () => {
    const add = useEventStore.getState().addEvent;
    add({ title: 'Later', start: '2026-12-01' }, 'a');
    add({ title: 'Sooner', start: '2026-10-23T09:00' }, 'b');
    add({ title: 'Been', start: '2026-10-01' }, 'c');

    const plain = await listEvents.execute({}, ctx());
    const listed = (plain.data as { events: { title: string; countdown: string }[] }).events;
    expect(listed.map((e) => [e.title, e.countdown])).toEqual([['Sooner', '2 days'], ['Later', '40 days 15 hours']]);
    expect((plain.data as { passed?: unknown[] }).passed).toBeUndefined();

    const all = await listEvents.execute({ includePassed: true }, ctx());
    expect((all.data as { passed: { title: string }[] }).passed.map((e) => e.title)).toEqual(['Been']);
  });
});

describe('alerts (29-2c1)', () => {
  it('a new event rings a day before unless told otherwise, as one made in the sheet', async () => {
    await createEvent.execute({
      events: [
        { title: 'Race', start: '2026-11-12T06:00' },
        { title: 'Flight', start: '2026-11-20T09:30', alertMinutes: [10080, 60] },
        { title: 'Quiet one', start: '2026-11-21', alertMinutes: [] },
      ],
    }, ctx());
    expect(useEventStore.getState().events.map((e) => e.alerts)).toEqual([[1440], [10080, 60], undefined]);
  });

  it('an all-day event keeps whole days and its own ring time, read without seconds', async () => {
    await createEvent.execute({ events: [{ title: 'Birthday', start: '2026-12-03', alertMinutes: [0, 1440], alertTime: '07:30:00' }] }, ctx());
    expect(useEventStore.getState().events[0]).toMatchObject({ alerts: [1440, 0], alertTime: '07:30' });
    const listed = await listEvents.execute({}, ctx());
    expect((listed.data as { events: Record<string, unknown>[] }).events[0]).toMatchObject({
      alerts: ['1 day before', 'On the day'], alertTime: '07:30',
    });
  });

  it('refuses a choice not on his menu, naming the ones that are', async () => {
    const result = await createEvent.execute({ events: [{ title: 'Race', start: '2026-11-12T06:00', alertMinutes: [45] }] }, ctx());
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).toContain('1440');
    expect(useEventStore.getState().events).toEqual([]);
  });

  it('update_event changes or clears them, and Revert puts them back', async () => {
    await createEvent.execute({ events: [{ title: 'Race', start: '2026-11-12T06:00' }] }, ctx());
    const id = useEventStore.getState().events[0].id;
    const c = ctx();
    await updateEvent.execute({ events: [{ eventId: id, alertMinutes: [] }] }, c);
    expect(useEventStore.getState().events[0]).not.toHaveProperty('alerts');
    revertSnapshotEntries(undoOf(c), { undoCreations: true });
    expect(useEventStore.getState().events[0].alerts).toEqual([1440]);
  });
});
