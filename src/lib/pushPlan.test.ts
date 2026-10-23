/**
 * What goes out on each knock — BUILD-5.
 *
 * Every rule in `pushPlan.ts`'s header is one of Shreekant's calls, and none
 * of them can be watched happen from this laptop (no notification reaches a
 * session here). So each is pinned against real `firingToday` rows built from
 * real `Task` objects, in a named zone, on a hand-set clock.
 */
import { describe, expect, it } from 'vitest';
import type { Project, Task, TaskList } from '../store/useStore';
import { firingToday } from './firingToday';
import type { NotificationSettings } from './notifications';
import {
  EMPTY_LOG,
  LATE_LIMIT_MS,
  LOG_KEEP_MS,
  SNOOZE_MS,
  applySnooze,
  formatMinutes,
  logKey,
  planPushes,
  withDelivery,
  type PushLog,
} from './pushPlan';

const SETTINGS: NotificationSettings = { enabled: true, defaultDeadlineOffsetMinutes: 30 };
const ZONE = 'Asia/Kolkata';
/** A wall-clock time in Kolkata, as an instant. */
const ist = (wall: string) => Date.parse(`${wall}:00+05:30`);
const MIN = 60_000;

const PROJECTS: Project[] = [
  { id: 'p-empire', name: 'Shreekant Empire', createdAt: 0, order: 0 },
];
const LISTS: TaskList[] = [{ id: 'l-ops', title: 'Operations', projectId: 'p-empire', order: 0 }];

function task(over: Partial<Task> = {}): Task {
  return {
    id: 'filing',
    title: 'Draft the incorporation filing',
    status: 'needsAction',
    listId: 'l-ops',
    listName: 'Operations',
    order: 0,
    // Fires 17:15 — the mockup's own example.
    deadline: '2026-09-16T18:00',
    estimatedTime: 45,
    ...over,
  };
}

function knock(tasks: Task[], now: number, log: PushLog = EMPTY_LOG) {
  const rows = firingToday({ tasks, taskLists: LISTS, projects: PROJECTS, settings: SETTINGS, timeZone: ZONE, now });
  return planPushes({ rows, backlog: tasks, log, now, timeZone: ZONE });
}

describe('planPushes — the fire', () => {
  it('sends at the block start, and not a minute before', () => {
    const tasks = [task()];
    expect(knock(tasks, ist('2026-09-16T17:14')).messages).toEqual([]);

    const plan = knock(tasks, ist('2026-09-16T17:15'));
    expect(plan.messages).toHaveLength(1);
    const [m] = plan.messages;
    expect(m.kind).toBe('fire');
    expect(m.title).toBe('Start now — 45 min');
    expect(m.body).toBe(
      'Draft the incorporation filing · due 18:00\nShreekant Empire · 45 min allocated. No slack after this.',
    );
    expect(m.url).toBe('/start/filing');
    expect(m.actions.map((a) => a.title)).toEqual(['Start', '5 min']);
    expect(m.timestamp).toBe(ist('2026-09-16T17:15'));
    expect(m.snoozeKey).toBe(logKey('filing', ist('2026-09-16T17:15')));
  });

  it('never sends the same alert twice', () => {
    const tasks = [task()];
    const first = knock(tasks, ist('2026-09-16T17:15'));
    const second = knock(tasks, ist('2026-09-16T17:16'), first.log);
    expect(second.messages).toEqual([]);
    expect(second.changed).toBe(false);
  });

  it('still fires a little late, up to the limit', () => {
    const plan = knock([task()], ist('2026-09-16T17:15') + LATE_LIMIT_MS);
    expect(plan.messages.map((m) => m.kind)).toEqual(['fire']);
  });

  it('says what a blocked task is waiting on, and still fires', () => {
    const blocker = task({ id: 'ca', title: 'Shortlist the CA', deadline: undefined });
    const blocked = task({ dependsOn: ['ca'] });
    const [m] = knock([blocker, blocked], ist('2026-09-16T17:15')).messages;
    expect(m.body).toBe('Draft the incorporation filing · due 18:00\nWaiting on Shortlist the CA.');
    expect(m.url).toBe('/start/filing');
  });

  it('writes an hour-long estimate the way the screen does', () => {
    expect(formatMinutes(45)).toBe('45 min');
    expect(formatMinutes(60)).toBe('1 h');
    expect(formatMinutes(125)).toBe('2 h 5 min');
  });

  it('sends nothing for a finished task', () => {
    expect(knock([task({ status: 'completed' })], ist('2026-09-16T17:15')).messages).toEqual([]);
  });

  it('fires again when the deadline moves later after it went out', () => {
    const sent = knock([task()], ist('2026-09-16T17:15'));
    const moved = [task({ deadline: '2026-09-16T19:00' })];
    expect(knock(moved, ist('2026-09-16T17:30'), sent.log).messages).toEqual([]);
    const again = knock(moved, ist('2026-09-16T18:15'), sent.log);
    expect(again.messages.map((m) => m.kind)).toEqual(['fire']);
  });
});

describe('planPushes — missed', () => {
  it('records a late one as missed and reports it in a summary instead of firing it', () => {
    const plan = knock([task()], ist('2026-09-16T17:15') + LATE_LIMIT_MS + MIN);
    expect(plan.messages).toHaveLength(1);
    const [m] = plan.messages;
    expect(m.kind).toBe('summary');
    expect(m.title).toBe('1 task started without you');
    expect(m.tag).toBe('base-missed');
    expect(m.actions).toEqual([{ action: 'replan', title: 'Re-plan today', url: '/' }]);
    const entry = plan.log.entries[logKey('filing', ist('2026-09-16T17:15'))];
    expect(entry.outcome).toBe('missed');
  });

  it('collapses the day into one summary that always counts all of it', () => {
    const tasks = [
      task({ id: 'ca', title: 'Shortlist the CA', deadline: '2026-09-16T09:45', estimatedTime: 25 }),
      task({ id: 'landlord', title: 'Reply to the landlord', deadline: '2026-09-16T12:10', estimatedTime: 40 }),
      task({ id: 'pitch', title: 'Draft the pitch outline', deadline: '2026-09-16T14:15', estimatedTime: 60 }),
    ];
    // The tablet was face-down all morning: two are missed by 12:30.
    const first = knock(tasks, ist('2026-09-16T12:30'));
    expect(first.messages).toHaveLength(1);
    expect(first.messages[0].title).toBe('2 tasks started without you');
    expect(first.messages[0].body).toBe(
      [
        'Since 09:20 — 1 h 5 min of allocated time unclaimed.',
        '09:20  Shortlist the CA — 25 min',
        '11:30  Reply to the landlord — 40 min',
      ].join('\n'),
    );

    // Nothing new: no summary.
    expect(knock(tasks, ist('2026-09-16T12:31'), first.log).messages).toEqual([]);

    // One more is missed: the summary replaces the last and counts all three.
    const later = knock(tasks, ist('2026-09-16T14:02'), first.log);
    expect(later.messages.map((m) => m.title)).toEqual(['3 tasks started without you']);
    expect(later.messages[0].body.split('\n')[0]).toBe('Since 09:20 — 2 h 5 min of allocated time unclaimed.');
    // The first two keep the summary they were first counted in.
    expect(later.log.entries[logKey('ca', ist('2026-09-16T09:20'))].summaryAt).toBe(ist('2026-09-16T12:30'));
  });

  it('names six and counts the rest, so a bad day still fits in a push', () => {
    const tasks = Array.from({ length: 9 }, (_, i) =>
      task({ id: `t${i}`, title: `Task ${i}`, deadline: `2026-09-16T0${i + 1}:00`, estimatedTime: 30 }),
    );
    const [m] = knock(tasks, ist('2026-09-16T12:00')).messages;
    expect(m.title).toBe('9 tasks started without you');
    const lines = m.body.split('\n');
    expect(lines).toHaveLength(8);
    expect(lines[7]).toBe('and 3 more');
  });

  it('does not call a task missed when it was already sent today and then moved earlier', () => {
    const sent = knock([task()], ist('2026-09-16T17:15'));
    const earlier = [task({ deadline: '2026-09-16T16:00' })];
    const plan = knock(earlier, ist('2026-09-16T17:20'), sent.log);
    expect(plan.messages).toEqual([]);
    expect(Object.keys(plan.log.entries)).toHaveLength(1);
  });

  it('is never re-fired, even once it is back inside the window on a later knock', () => {
    const missed = knock([task()], ist('2026-09-16T17:30'));
    expect(knock([task()], ist('2026-09-16T17:31'), missed.log).messages).toEqual([]);
  });
});

describe('planPushes — the one snooze', () => {
  const firedAt = ist('2026-09-16T17:15');
  const key = logKey('filing', firedAt);

  it('brings the alert back five minutes later, counting down what is left, once', () => {
    const fired = knock([task()], firedAt);
    const snoozed = applySnooze(fired.log, key, firedAt + 10_000);
    expect(snoozed).not.toBeNull();

    expect(knock([task()], firedAt + 10_000 + SNOOZE_MS - 1, snoozed!).messages).toEqual([]);

    const back = knock([task()], ist('2026-09-16T17:20') + 10_000, snoozed!);
    expect(back.messages).toHaveLength(1);
    const [m] = back.messages;
    expect(m.kind).toBe('lastCall');
    expect(m.title).toBe('Start now — 39 min left');
    expect(m.body).toBe('Draft the incorporation filing · due 18:00. Last call.');
    expect(m.tag).toBe('base-task-filing');
    expect(m.actions.map((a) => a.action)).toEqual(['start']);

    expect(knock([task()], ist('2026-09-16T17:22'), back.log).messages).toEqual([]);
  });

  it('is offered once: a second snooze, or one on a missed alert, does nothing', () => {
    const fired = knock([task()], firedAt);
    const once = applySnooze(fired.log, key, firedAt)!;
    expect(applySnooze(once, key, firedAt + MIN)).toBeNull();
    expect(applySnooze(fired.log, 'nope@1', firedAt)).toBeNull();

    const missed = knock([task()], firedAt + LATE_LIMIT_MS + MIN);
    expect(applySnooze(missed.log, key, firedAt)).toBeNull();
  });

  it('has no last call for a task finished while it was snoozed', () => {
    const fired = knock([task()], firedAt);
    const snoozed = applySnooze(fired.log, key, firedAt)!;
    expect(knock([task({ status: 'completed' })], firedAt + SNOOZE_MS, snoozed).messages).toEqual([]);
  });
});

describe('planPushes — the log', () => {
  it('drops entries older than it keeps, and says it changed', () => {
    const old: PushLog = {
      entries: {
        'gone@0': { taskId: 'gone', at: 0, title: 'x', estimateMinutes: 30, outcome: 'sent', sentAt: 0 },
      },
    };
    const plan = knock([], LOG_KEEP_MS + 1, old);
    expect(plan.log.entries).toEqual({});
    expect(plan.changed).toBe(true);
  });

  it('writes nothing on an idle knock', () => {
    const plan = knock([task()], ist('2026-09-16T10:00'));
    expect(plan.changed).toBe(false);
    expect(plan.messages).toEqual([]);
  });
});

describe('withDelivery — the screen', () => {
  const rowsAt = (now: number, tasks: Task[]) =>
    firingToday({ tasks, taskLists: LISTS, projects: PROJECTS, settings: SETTINGS, timeZone: ZONE, now });

  const tasks = [
    task({ id: 'a', title: 'A', deadline: '2026-09-16T10:00', estimatedTime: 30 }), // 09:30
    task({ id: 'b', title: 'B', deadline: '2026-09-16T12:00', estimatedTime: 30 }), // 11:30
    task({ id: 'c', title: 'C', deadline: '2026-09-16T12:05', estimatedTime: 30 }), // 11:35
    task({ id: 'd', title: 'D', deadline: '2026-09-16T15:00', estimatedTime: 30 }), // 14:30
  ];

  it('leaves the rows as DESIGN-2 drew them when there is no log', () => {
    const now = ist('2026-09-16T12:00');
    const rows = rowsAt(now, tasks);
    expect(withDelivery(rows, null, now)).toBe(rows);
  });

  it('tells sent from missed, shows a snooze, and keeps one about to go out as still to come', () => {
    const missedLog = knock(tasks, ist('2026-09-16T11:30')).log; // A missed, B sent
    const snoozed = applySnooze(missedLog, logKey('b', ist('2026-09-16T11:30')), ist('2026-09-16T11:31'))!;
    const now = ist('2026-09-16T11:36'); // C is a minute late and not yet knocked for.

    const states = withDelivery(rowsAt(now, tasks), snoozed, now).map((r) => [r.task.id, r.state]);
    expect(states).toEqual([
      ['a', 'missed'],
      ['b', 'snoozed'],
      ['c', 'next'],
      ['d', 'queued'],
    ]);
  });

  it('carries the log entry so a missed row can name its summary', () => {
    const log = knock(tasks, ist('2026-09-16T11:30')).log;
    const now = ist('2026-09-16T11:31');
    const [a, b] = withDelivery(rowsAt(now, tasks), log, now);
    expect(a.delivery?.summaryAt).toBe(ist('2026-09-16T11:30'));
    expect(b.state).toBe('sent');
    expect(b.delivery?.sentAt).toBe(ist('2026-09-16T11:30'));
  });
});
