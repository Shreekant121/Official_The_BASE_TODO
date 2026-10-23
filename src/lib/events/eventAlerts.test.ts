/**
 * When an event's alerts ring, and what the sender does with them (29-2c2).
 * His rules are in `eventAlerts.ts`'s header; each is pinned here on a
 * hand-set clock in a named zone, through the real `planPushes`.
 */
import { describe, expect, it } from 'vitest';
import { alertWhenWords, eventAlertKey, eventAlertsToday, todaysTimeline, withEventDelivery } from './eventAlerts';
import { EMPTY_LOG, LATE_LIMIT_MS, planPushes, type PushLog } from '../pushPlan';
import type { BaseEvent } from './events';
import type { FiringRow } from '../firingToday';
import type { Task } from '../../store/useStore';

const ZONE = 'Asia/Kolkata';
const ist = (wall: string) => Date.parse(`${wall}:00+05:30`);
const MIN = 60_000;

function event(over: Partial<BaseEvent> = {}): BaseEvent {
  return { id: 'marathon', title: 'Mumbai Marathon', start: '2026-11-12T06:00', alerts: [1440], createdAt: 0, ...over };
}

const ringTimes = (events: BaseEvent[], now: number) => eventAlertsToday(events, ZONE, now).map((r) => [r.minutes, r.at]);

describe('eventAlertsToday — the instant', () => {
  it('is the start minus the minutes, on the day it falls', () => {
    const e = event({ alerts: [10080, 1440, 60, 0] });
    expect(ringTimes([e], ist('2026-11-11T09:00'))).toEqual([[1440, ist('2026-11-11T06:00')]]);
    expect(ringTimes([e], ist('2026-11-12T01:00'))).toEqual([
      [60, ist('2026-11-12T05:00')],
      [0, ist('2026-11-12T06:00')],
    ]);
    expect(ringTimes([e], ist('2026-11-05T23:59'))).toEqual([[10080, ist('2026-11-05T06:00')]]);
    expect(ringTimes([e], ist('2026-11-10T12:00'))).toEqual([]);
  });

  it('rings an all-day event at its ring time, whole days before, "On the day" included', () => {
    const birthday = event({ id: 'asha', title: "Asha's birthday", start: '2026-11-20', alerts: [1440, 0], alertTime: '07:30' });
    expect(ringTimes([birthday], ist('2026-11-19T00:00'))).toEqual([[1440, ist('2026-11-19T07:30')]]);
    expect(ringTimes([birthday], ist('2026-11-20T23:00'))).toEqual([[0, ist('2026-11-20T07:30')]]);
    /* 8am when he set no time. */
    const plain = event({ start: '2026-11-20', alerts: [0] });
    expect(ringTimes([plain], ist('2026-11-20T10:00'))).toEqual([[0, ist('2026-11-20T08:00')]]);
  });

  it('rings every occurrence of a repeat, from the tasks own engine', () => {
    const yearly = event({ id: 'asha', start: '2020-02-14', recurrence: 'yearly', alerts: [2880] });
    expect(ringTimes([yearly], ist('2027-02-12T12:00'))).toEqual([[2880, ist('2027-02-12T08:00')]]);
    const weekly = event({ id: 'class', start: '2026-11-02T19:00', recurrence: 'weekly', alerts: [30] });
    expect(ringTimes([weekly], ist('2026-11-23T08:00'))).toEqual([[30, ist('2026-11-23T18:30')]]);
    expect(ringTimes([weekly], ist('2026-11-24T08:00'))).toEqual([]);
  });

  it('rings a multi-day event for its first day only, and a passed one-off never', () => {
    const trip = event({ start: '2026-12-01', end: '2026-12-05', alerts: [0] });
    expect(ringTimes([trip], ist('2026-12-01T12:00'))).toHaveLength(1);
    expect(ringTimes([trip], ist('2026-12-02T12:00'))).toEqual([]);
    expect(ringTimes([event({ start: '2026-01-01T06:00', alerts: [0] })], ist('2026-01-02T12:00'))).toEqual([]);
  });

  it('has no rows for an event with no alerts, and marks the past missed and the first to come next', () => {
    expect(eventAlertsToday([event({ alerts: undefined })], ZONE, ist('2026-11-11T09:00'))).toEqual([]);
    const rows = eventAlertsToday([event({ alerts: [60, 0] })], ZONE, ist('2026-11-12T05:30'));
    expect(rows.map((r) => r.state)).toEqual(['missed', 'next']);
  });
});

describe('planPushes — an event alert', () => {
  const knock = (events: BaseEvent[], now: number, log: PushLog = EMPTY_LOG) =>
    planPushes({ rows: [], backlog: [], log, now, timeZone: ZONE, events: eventAlertsToday(events, ZONE, now) });

  it('goes out at its instant, says when then what, and opens the event', () => {
    const e = event({ location: 'Bandra' });
    expect(knock([e], ist('2026-11-11T05:59')).messages).toEqual([]);
    const plan = knock([e], ist('2026-11-11T06:00'));
    expect(plan.messages).toHaveLength(1);
    const [m] = plan.messages;
    expect(m.kind).toBe('event');
    expect(m.title).toBe('Tomorrow — Mumbai Marathon');
    expect(m.body).toBe('Thu 12 Nov, 06:00 · Bandra');
    expect(m.url).toBe('/dashboard?event=marathon');
    expect(m.tag).toBe('base-event-marathon');
    expect(m.snoozeKey).toBeUndefined();
    expect(Object.keys(plan.log.entries)).toEqual([`event:marathon@${ist('2026-11-11T06:00')}`]);
  });

  it('is sent once, and a knock after writes nothing', () => {
    const first = knock([event()], ist('2026-11-11T06:01'));
    const again = knock([event()], ist('2026-11-11T06:02'), first.log);
    expect(again.messages).toEqual([]);
    expect(again.changed).toBe(false);
  });

  it('is missed, never sent late, and kept out of the tasks summary', () => {
    const plan = knock([event()], ist('2026-11-11T06:00') + LATE_LIMIT_MS + MIN);
    expect(plan.messages).toEqual([]);
    const [entry] = Object.values(plan.log.entries);
    expect(entry.outcome).toBe('missed');
    expect(entry.eventId).toBe('marathon');
  });

  it('is not missed when the event moved after its alert went out', () => {
    const sent = knock([event()], ist('2026-11-11T06:00'));
    const moved = event({ start: '2026-11-12T05:00' });
    const later = knock([moved], ist('2026-11-11T06:30'), sent.log);
    expect(later.changed).toBe(false);
  });

  it('rings an all-day "On the day" — the one Google cannot', () => {
    const e = event({ start: '2026-11-20', alerts: [0] });
    const [m] = knock([e], ist('2026-11-20T08:00')).messages;
    expect(m.title).toBe('Today — Mumbai Marathon');
    expect(m.body).toBe('Fri 20 Nov');
  });
});

describe('the Notifications screen half', () => {
  it('reads sent and missed from the log', () => {
    const now = ist('2026-11-12T06:30');
    const rows = eventAlertsToday([event({ alerts: [60, 0] })], ZONE, now);
    const log: PushLog = {
      entries: {
        [eventAlertKey(rows[0])]: { taskId: 'event:marathon', eventId: 'marathon', at: rows[0].at, title: '', estimateMinutes: 0, outcome: 'missed' },
        [eventAlertKey(rows[1])]: { taskId: 'event:marathon', eventId: 'marathon', at: rows[1].at, title: '', estimateMinutes: 0, outcome: 'sent', sentAt: rows[1].at },
      },
    };
    expect(withEventDelivery(rows, log, now, LATE_LIMIT_MS).map((r) => r.state)).toEqual(['missed', 'sent']);
  });

  it('puts tasks and events on one clock with one next', () => {
    const now = ist('2026-11-11T05:00');
    const events = eventAlertsToday([event()], ZONE, now);
    const taskRow = { task: { id: 't' } as Task, at: ist('2026-11-11T09:00'), dueAt: 0, estimateMinutes: 30, state: 'next', listName: '' } as FiringRow;
    const line = todaysTimeline([taskRow], events);
    expect(line.map((r) => [r.kind, r.row.state])).toEqual([['event', 'next'], ['task', 'queued']]);
  });

  it('words the when', () => {
    expect([0, 10, 60, 1440, 2880, 10080, 40320].map((m) => alertWhenWords(m, false))).toEqual([
      'Now', 'In 10 min', 'In 1 h', 'Tomorrow', 'In 2 days', 'In 1 week', 'In 4 weeks',
    ]);
    expect(alertWhenWords(0, true)).toBe('Today');
  });
});
