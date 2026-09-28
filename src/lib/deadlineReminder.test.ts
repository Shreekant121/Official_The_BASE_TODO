/**
 * The shape of a task's Google Calendar block.
 *
 * Item 3's "done when" is three sentences — a 90-minute task due at 18:00
 * draws 16:30–18:00, a task with no reminder still draws, and completing it
 * leaves a ✓ block behind — and all three are questions about
 * `deadlineBlockFor`, which is pure. The network half (`notificationSync.ts`)
 * cannot be imported into a test at all: reaching it drags in `./firebase`
 * and with it a live SDK. So the rule is asserted here and the transport is
 * left to do as it is told.
 *
 * The times are written as local wall clock because that is what the app
 * stores and what the user typed. Nothing here reads the clock.
 */
import { describe, expect, it } from 'vitest';
import type { Task } from '../store/useStore';
import { resolveUserTimeZone } from './agent/dates';
import { deadlineBlockFor, deadlineEventId, DEADLINE_EVENT_PREFIX } from './deadlineReminder';
import type { NotificationSettings } from './notifications';

const SETTINGS: NotificationSettings = { enabled: true, defaultDeadlineOffsetMinutes: 30 };
/** The same zone the reconcile pass resolves, so `UNTIL` reads as the app reads it. */
const ZONE = resolveUserTimeZone();

function task(over: Partial<Task> = {}): Task {
  return {
    id: 't1',
    title: 'Write the quarterly report',
    status: 'needsAction',
    listId: 'l1',
    listName: 'Build',
    order: 0,
    deadline: '2026-03-10T18:00',
    ...over,
  };
}

/** Local wall clock → epoch ms, read the same way the app reads a stored deadline. */
const at = (wall: string) => Date.parse(wall);

describe('how long the block runs', () => {
  it('runs deadline − duration → deadline: 90 minutes due at 18:00 is 16:30–18:00', () => {
    const block = deadlineBlockFor(task({ estimatedTime: 90 }), SETTINGS, ZONE);

    expect(block.durationMinutes).toBe(90);
    expect(block.startMs).toBe(at('2026-03-10T16:30'));
    expect(block.deadlineMs).toBe(at('2026-03-10T18:00'));
  });

  it('takes the allocation over the estimate, exactly as the priority score does', () => {
    // **The precedence flipped at item 16, on purpose.** The settled decision
    // is one duration answer app-wide and it is `allocatedTime ?? estimatedTime
    // ?? 30`: the allocation is what you deliberately set for this task today,
    // the estimate is the generic guess, and the deliberate one should win.
    // The block has to agree with the score, because Latest Start — which the
    // whole engine measures to — is `deadline − duration`, so a block on the
    // other precedence would draw a quarter of an hour for work the app is
    // scoring as two hours.
    const block = deadlineBlockFor(task({ estimatedTime: 15, allocatedTime: 7200 }), SETTINGS, ZONE);

    expect(block.durationMinutes).toBe(120);
    expect(block.startMs).toBe(at('2026-03-10T16:00'));
  });

  it('falls back to the estimate when nothing was allocated', () => {
    const block = deadlineBlockFor(task({ estimatedTime: 45 }), SETTINGS, ZONE);

    expect(block.durationMinutes).toBe(45);
    expect(block.startMs).toBe(at('2026-03-10T17:15'));
  });

  it('draws the neutral half hour for a task nobody estimated', () => {
    const block = deadlineBlockFor(task(), SETTINGS, ZONE);

    expect(block.durationMinutes).toBe(30);
    expect(block.startMs).toBe(at('2026-03-10T17:30'));
  });

  it('runs back across midnight rather than clipping at it', () => {
    const block = deadlineBlockFor(task({ deadline: '2026-03-11T00:30', estimatedTime: 120 }), SETTINGS, ZONE);

    expect(block.startMs).toBe(at('2026-03-10T22:30'));
  });
});

describe('what draws a block at all', () => {
  it('draws for a task whose reminder is switched off — the block is not the ping', () => {
    const block = deadlineBlockFor(task({ reminderMinutes: 0 }), SETTINGS, ZONE);

    expect(block.eligible).toBe(true);
    expect(block.reminds).toBe(false);
  });

  it('pings only when the offset is above zero', () => {
    expect(deadlineBlockFor(task({ reminderMinutes: 45 }), SETTINGS, ZONE).reminds).toBe(true);
    expect(deadlineBlockFor(task({ reminderMinutes: 45 }), SETTINGS, ZONE).offsetMinutes).toBe(45);
    expect(deadlineBlockFor(task(), SETTINGS, ZONE).offsetMinutes).toBe(30); // the account default
  });

  it('draws nothing for a task with no deadline — there is no hour to draw it in', () => {
    const block = deadlineBlockFor(task({ deadline: undefined }), SETTINGS, ZONE);

    expect(block.eligible).toBe(false);
    expect(block.startMs).toBeNull();
    expect(block.deadlineMs).toBeNull();
  });

  it('draws nothing at all while notifications are off', () => {
    const off: NotificationSettings = { ...SETTINGS, enabled: false };

    expect(deadlineBlockFor(task(), off, ZONE).eligible).toBe(false);
    expect(deadlineBlockFor(task(), off, ZONE).reminds).toBe(false);
  });
});

describe('whether the block repeats', () => {
  it('carries the rule so Google can draw the rest of the series', () => {
    const block = deadlineBlockFor(
      task({ recurrence: 'custom', recurrenceRule: 'FREQ=MONTHLY;INTERVAL=1;BYDAY=-1FR' }),
      SETTINGS,
      ZONE,
    );

    expect(block.recurrence).toBe('RRULE:FREQ=MONTHLY;INTERVAL=1;BYDAY=-1FR');
  });

  it('carries nothing for a task that happens once', () => {
    expect(deadlineBlockFor(task(), SETTINGS, ZONE).recurrence).toBeNull();
  });

  it('hands the series to the open occurrence and takes it off the finished one', () => {
    // Both exist in the backlog at once for a moment after the box is ticked.
    // If both carried the rule, Google would draw two overlapping infinite
    // series — and three after the next completion.
    const repeating = { recurrence: 'daily' as const };
    expect(deadlineBlockFor(task(repeating), SETTINGS, ZONE).recurrence)
      .toBe('RRULE:FREQ=DAILY;INTERVAL=1');
    expect(deadlineBlockFor(task({ ...repeating, status: 'completed' }), SETTINGS, ZONE).recurrence)
      .toBeNull();
  });

  it('draws no series on a task drawing no block at all', () => {
    const off: NotificationSettings = { ...SETTINGS, enabled: false };

    expect(deadlineBlockFor(task({ recurrence: 'daily' }), off, ZONE).recurrence).toBeNull();
    expect(deadlineBlockFor(task({ recurrence: 'daily', deadline: undefined }), SETTINGS, ZONE).recurrence)
      .toBeNull();
  });
});

describe('a finished task', () => {
  it('keeps its block, ticked', () => {
    const block = deadlineBlockFor(task({ estimatedTime: 90, status: 'completed' }), SETTINGS, ZONE);

    expect(block.eligible).toBe(true);
    expect(block.summary).toBe('✓ Deadline: Write the quarterly report');
    expect(block.startMs).toBe(at('2026-03-10T16:30'));
  });

  it('stops pinging, whatever its offset says', () => {
    const block = deadlineBlockFor(task({ status: 'completed', reminderMinutes: 45 }), SETTINGS, ZONE);

    expect(block.reminds).toBe(false);
  });

  it('is unticked in the title while it is still open', () => {
    expect(deadlineBlockFor(task(), SETTINGS, ZONE).summary).toBe('Deadline: Write the quarterly report');
  });
});

describe('the event id', () => {
  it('carries the prefix the orphan sweep looks for, and Google’s legal characters only', () => {
    const id = deadlineEventId('task-XYZ_9');

    expect(id.startsWith(DEADLINE_EVENT_PREFIX)).toBe(true);
    expect(id).toMatch(/^[a-v0-9]{5,}$/);
  });

  it('is derived from the task, so two tasks never share one', () => {
    expect(deadlineEventId('abc')).not.toBe(deadlineEventId('abd'));
  });
});
