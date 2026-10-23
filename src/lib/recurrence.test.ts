/**
 * The recurrence engine, exercised against the cases a person cannot check by
 * hand.
 *
 * Every test pins an exact date string rather than asserting a relationship,
 * because the failures this suite exists to catch are all off-by-one-day or
 * off-by-one-hour: February clamping the 31st and never letting go of it, a
 * 09:00 task drifting to 08:00 when the clocks change, a task finished a month
 * late spawning a successor that is already overdue.
 *
 * Two zones are used deliberately. `Asia/Kolkata` is where this app is
 * actually run and has no daylight saving, so it isolates the calendar
 * arithmetic. `America/New_York` has two clock changes a year and is the only
 * way to prove the wall clock, not the interval, is what repeats.
 */
import { describe, expect, it } from 'vitest';
import type { Task } from '../store/useStore';
import { zonedTimeToInstant } from './agent/dates';
import {
  anchorFieldOf,
  buildSuccessorTask,
  calendarRRuleOf,
  customRRuleOf,
  describeRecurrenceRule,
  describeSeriesStatus,
  formatRRule,
  nextOccurrence,
  parseRRule,
  resolveRule,
  rruleFromLegacyRule,
  seriesAnchorOf,
  seriesStatus,
  type RRule,
  type ScheduledOccurrence,
} from './recurrence';

const IST = 'Asia/Kolkata';
const NY = 'America/New_York';

/** The instant at which `zone` reads this `YYYY-MM-DDTHH:mm` wall clock. */
function at(wall: string, zone: string): Date {
  const [date, time] = wall.split('T');
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return zonedTimeToInstant({ year, month, day, hour, minute, second: 0 }, zone);
}

function task(overrides: Partial<Task> = {}): Task {
  return { id: 't1', title: 'Water the plants', status: 'needsAction', ...overrides };
}

function custom(rrule: string): Partial<Task> {
  return { recurrence: 'custom', recurrenceRule: rrule };
}

/** The parsed rule, or a readable failure rather than a `null` three lines later. */
function parsed(rrule: string): RRule {
  const rule = parseRRule(rrule);
  if (!rule) throw new Error(`expected a readable rule, got ${rrule}`);
  return rule;
}

/** The `next` branch, or a readable failure if the engine said something else. */
function scheduled(result: ReturnType<typeof nextOccurrence>): ScheduledOccurrence {
  if (result.kind !== 'next') throw new Error(`expected a next occurrence, got ${JSON.stringify(result)}`);
  return result;
}

/** Ids a test can predict: `id-1`, `id-2`, … in the order they were minted. */
function counter(prefix = 'id'): () => string {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

/**
 * One turn of the real loop: work out the successor and build it, exactly as
 * the completion paths will. Used by the chain tests, where what matters is
 * that generation four is still on the schedule generation one set.
 */
function complete(current: Task, now: Date, zone: string): Task {
  const next = scheduled(nextOccurrence(current, now, zone));
  return buildSuccessorTask(current, next, { newId: counter(current.id), seriesId: 'series-1', createdAt: 0 });
}

// ─── Reading the rule ────────────────────────────────────────────────────────

describe('resolveRule', () => {
  it('folds a preset into a full rule', () => {
    expect(resolveRule({ recurrence: 'weekly' })).toEqual({ freq: 'WEEKLY', interval: 1, byDay: [] });
  });

  it('is null for anything that does not repeat', () => {
    expect(resolveRule({})).toBeNull();
    expect(resolveRule({ recurrence: 'none' })).toBeNull();
  });

  it('is null for "custom" with no rule saved beside it', () => {
    expect(resolveRule({ recurrence: 'custom' })).toBeNull();
    expect(resolveRule(custom('not an rrule'))).toBeNull();
  });

  it('clamps an interval that would stall the series', () => {
    expect(resolveRule(custom('FREQ=DAILY;INTERVAL=0'))?.interval).toBe(1);
    expect(resolveRule(custom('FREQ=DAILY;INTERVAL=-4'))?.interval).toBe(1);
    expect(resolveRule(custom('FREQ=DAILY;INTERVAL=every other'))?.interval).toBe(1);
    expect(resolveRule(custom('FREQ=DAILY;INTERVAL=2.7'))?.interval).toBe(2);
  });

  it('sorts, de-duplicates and discards weekdays it cannot read', () => {
    const rule = resolveRule(custom('FREQ=WEEKLY;BYDAY=WE,MO,MO,XX,SA'));
    expect(rule?.byDay).toEqual([{ weekday: 1 }, { weekday: 3 }, { weekday: 6 }]);
  });
});

// ─── The string itself ───────────────────────────────────────────────────────

describe('reading and writing an RRULE', () => {
  it('gives a rule back as the same characters it came in as', () => {
    for (const rrule of [
      'FREQ=DAILY;INTERVAL=1',
      'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH;COUNT=8',
      'FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR',
      'FREQ=MONTHLY;INTERVAL=1;BYDAY=-1FR',
      'FREQ=MONTHLY;INTERVAL=1;BYDAY=2TU',
      'FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=15',
      'FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=-1',
      'FREQ=YEARLY;INTERVAL=1;UNTIL=20301231',
    ]) {
      expect(formatRRule(parsed(rrule))).toBe(rrule);
    }
  });

  it('accepts what another calendar would hand it, and answers in one spelling', () => {
    expect(formatRRule(parsed('RRULE:freq=weekly;byday=th,mo;interval=2')))
      .toBe('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH');
    // No INTERVAL at all means every one, which is what RFC 5545 says.
    expect(formatRRule(parsed('FREQ=DAILY'))).toBe('FREQ=DAILY;INTERVAL=1');
  });

  it('drops the parts this engine would not honour rather than carrying them', () => {
    // WKST is ignored, and an unqualified monthly BYDAY — every Friday of the
    // month — is not a shape the occurrence search can run.
    expect(formatRRule(parsed('FREQ=MONTHLY;INTERVAL=1;BYDAY=FR;WKST=SU')))
      .toBe('FREQ=MONTHLY;INTERVAL=1');
    // A weekly rule cannot carry an ordinal; a monthly one keeps one day only.
    expect(formatRRule(parsed('FREQ=WEEKLY;INTERVAL=1;BYDAY=2TU')))
      .toBe('FREQ=WEEKLY;INTERVAL=1;BYDAY=TU');
    expect(formatRRule(parsed('FREQ=MONTHLY;INTERVAL=1;BYDAY=-1FR;BYMONTHDAY=15')))
      .toBe('FREQ=MONTHLY;INTERVAL=1;BYDAY=-1FR');
    // COUNT and UNTIL cannot both be true of one series.
    expect(formatRRule(parsed('FREQ=DAILY;INTERVAL=1;COUNT=3;UNTIL=20260301')))
      .toBe('FREQ=DAILY;INTERVAL=1;COUNT=3');
  });

  it('is null for a string with no frequency in it', () => {
    expect(parseRRule('')).toBeNull();
    expect(parseRRule(undefined)).toBeNull();
    expect(parseRRule('INTERVAL=2;BYDAY=MO')).toBeNull();
    expect(parseRRule('FREQ=FORTNIGHTLY')).toBeNull();
  });
});

// ─── The rules that were already stored ──────────────────────────────────────

/**
 * The upgrade from the pre-v8 object. Every rule below is one a real task could
 * be carrying right now, and the whole promise of the migration is that none of
 * them changes the day it next comes round — so the string is checked here and
 * the schedule itself is run at the bottom of the block.
 */
describe('the pre-v8 rule object', () => {
  it('becomes the RRULE that means the same thing', () => {
    expect(rruleFromLegacyRule({ freq: 'weekly', interval: 2, byWeekday: [1, 4], endType: 'never' }))
      .toBe('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH');
    expect(rruleFromLegacyRule({ freq: 'daily', interval: 1, endType: 'afterCount', endCount: 2 }))
      .toBe('FREQ=DAILY;INTERVAL=1;COUNT=2');
    expect(rruleFromLegacyRule({ freq: 'monthly', interval: 1, endType: 'onDate', endDate: '2026-03-01' }))
      .toBe('FREQ=MONTHLY;INTERVAL=1;UNTIL=20260301');
    expect(rruleFromLegacyRule({ freq: 'yearly', interval: 3, endType: 'never' }))
      .toBe('FREQ=YEARLY;INTERVAL=3');
  });

  it('leaves behind a weekday list the old rule never meant anything by', () => {
    expect(rruleFromLegacyRule({ freq: 'monthly', interval: 1, byWeekday: [1, 4], endType: 'never' }))
      .toBe('FREQ=MONTHLY;INTERVAL=1');
  });

  it('is still read off a task that never went through the migration', () => {
    const legacy = task({
      recurrence: 'custom',
      customRecurrence: { freq: 'weekly', interval: 2, byWeekday: [1, 4], endType: 'afterCount', endCount: 8 },
    });
    expect(customRRuleOf(legacy)).toBe('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH;COUNT=8');
    expect(resolveRule(legacy)).toEqual({
      freq: 'WEEKLY', interval: 2, byDay: [{ weekday: 1 }, { weekday: 4 }], count: 8,
    });
  });

  it('keeps the schedule it had, to the exact day', () => {
    // Occurrence 1 of the fixture's own fortnightly Mon/Thu rule, completed on
    // the Monday it was due. Both shapes have to name the same Thursday.
    const dates = { deadline: '2026-03-09T11:00', seriesAnchor: '2026-03-09T11:00' };
    const before = task({
      ...dates,
      recurrence: 'custom',
      customRecurrence: { freq: 'weekly', interval: 2, byWeekday: [1, 4], endType: 'afterCount', endCount: 8 },
    });
    const after = task({ ...dates, ...custom('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH;COUNT=8') });

    const asked = at('2026-03-09T12:00', IST);
    expect(scheduled(nextOccurrence(before, asked, IST)).deadline).toBe('2026-03-12T11:00');
    expect(nextOccurrence(after, asked, IST)).toEqual(nextOccurrence(before, asked, IST));
  });
});

describe('anchoring', () => {
  it('pins to the deadline when a task has both dates', () => {
    expect(anchorFieldOf({ startDate: '2026-03-01T09:00', deadline: '2026-03-04T18:00' })).toBe('deadline');
  });

  it('falls back to the start date, then to nothing', () => {
    expect(anchorFieldOf({ startDate: '2026-03-01T09:00' })).toBe('startDate');
    expect(anchorFieldOf({})).toBeNull();
  });

  it('treats a task that has never cloned as occurrence 1, anchored on its own date', () => {
    expect(seriesAnchorOf({ deadline: '2026-03-04T18:00' })).toBe('2026-03-04T18:00');
  });

  it('prefers the stamped anchor once the series has moved on', () => {
    expect(seriesAnchorOf({ deadline: '2026-05-04T18:00', seriesAnchor: '2026-03-04T18:00' }))
      .toBe('2026-03-04T18:00');
  });
});

// ─── Daily ───────────────────────────────────────────────────────────────────

describe('daily', () => {
  const daily = task({ recurrence: 'daily', deadline: '2026-03-10T09:00' });

  it('comes back tomorrow, at the same time, stamping the anchor', () => {
    expect(nextOccurrence(daily, at('2026-03-10T21:00', IST), IST)).toEqual({
      kind: 'next',
      occurrence: 2,
      seriesAnchor: '2026-03-10T09:00',
      deadline: '2026-03-11T09:00',
    });
  });

  it('does not bring the next one forward when the current one is finished early', () => {
    // Finished two days before it was due: the successor is still the day
    // after the one just completed, not the day after today.
    expect(scheduled(nextOccurrence(daily, at('2026-03-08T12:00', IST), IST)).deadline)
      .toBe('2026-03-11T09:00');
  });

  it('skips the occurrences that were missed instead of backdating them', () => {
    const result = scheduled(nextOccurrence(daily, at('2026-03-15T13:00', IST), IST));
    expect(result.deadline).toBe('2026-03-16T09:00');
    expect(result.occurrence).toBe(7);
  });

  it('keeps the phase of an every-third-day rule across a gap', () => {
    // Anchored on 1 January, so the series runs 1, 4, 7 … 19, 22. Nothing
    // touched it until the 20th, and it resumes on the 22nd — on the original
    // grid, not three days from today.
    const every3 = task({ ...custom('FREQ=DAILY;INTERVAL=3'), deadline: '2026-01-01T08:00' });
    expect(nextOccurrence(every3, at('2026-01-20T12:00', IST), IST)).toEqual({
      kind: 'next',
      occurrence: 8,
      seriesAnchor: '2026-01-01T08:00',
      deadline: '2026-01-22T08:00',
    });
  });
});

// ─── Weekly ──────────────────────────────────────────────────────────────────

describe('weekly', () => {
  // 10 March 2026 is a Tuesday.
  const anchor = '2026-03-10T09:00';
  const finished = at('2026-03-10T20:00', IST);

  it('repeats on the same weekday', () => {
    const weekly = task({ recurrence: 'weekly', deadline: anchor });
    expect(scheduled(nextOccurrence(weekly, finished, IST)).deadline).toBe('2026-03-17T09:00');
  });

  it('honours the interval, which the reference implementation ignored', () => {
    const fortnightly = task({ ...custom('FREQ=WEEKLY;INTERVAL=2'), deadline: anchor });
    expect(scheduled(nextOccurrence(fortnightly, finished, IST)).deadline).toBe('2026-03-24T09:00');
  });

  it('walks the chosen weekdays, finishing the anchor week before moving on', () => {
    // Every week on Monday and Wednesday, anchored on a Tuesday: Wed 11th,
    // then Mon 16th, Wed 18th, Mon 23rd.
    const monWed = { ...custom('FREQ=WEEKLY;BYDAY=MO,WE'), deadline: anchor };
    const days = [1, 2, 3, 4].map((occurrence) =>
      scheduled(nextOccurrence(task({ ...monWed, occurrence, seriesAnchor: anchor }), at('2026-03-01T00:00', IST), IST)),
    );
    expect(days.map((d) => d.deadline)).toEqual([
      '2026-03-11T09:00', '2026-03-16T09:00', '2026-03-18T09:00', '2026-03-23T09:00',
    ]);
  });

  it('applies the interval between weekday blocks, not between occurrences', () => {
    // Every *two* weeks on Monday and Wednesday: the rest of the anchor week,
    // then a fortnight later, then both days of that week.
    const monWed = { ...custom('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE'), deadline: anchor };
    const days = [1, 2, 3, 4].map((occurrence) =>
      scheduled(nextOccurrence(task({ ...monWed, occurrence, seriesAnchor: anchor }), at('2026-03-01T00:00', IST), IST)),
    );
    expect(days.map((d) => d.deadline)).toEqual([
      '2026-03-11T09:00', '2026-03-23T09:00', '2026-03-25T09:00', '2026-04-06T09:00',
    ]);
  });

  it('does not repeat the anchor when its own weekday is one of the chosen ones', () => {
    // Tuesdays only, anchored on a Tuesday: the next one is next Tuesday, not
    // today again.
    const tuesdays = task({ ...custom('FREQ=WEEKLY;BYDAY=TU'), deadline: anchor });
    expect(scheduled(nextOccurrence(tuesdays, finished, IST)).deadline).toBe('2026-03-17T09:00');
  });
});

// ─── Month-end ───────────────────────────────────────────────────────────────

describe('month-end', () => {
  it('clamps into February and then goes back to the 31st', () => {
    // The whole reason occurrences are measured from the anchor. Deriving each
    // date from its predecessor gives 31 Jan, 28 Feb, 28 Mar, 28 Apr … and the
    // series never sees the end of a month again.
    let current = task({ recurrence: 'monthly', deadline: '2026-01-31T18:00' });
    const run = [current.deadline];
    for (let i = 0; i < 4; i++) {
      current = complete(current, at(`${current.deadline}`.replace('T18:00', 'T20:00'), IST), IST);
      run.push(current.deadline);
    }
    expect(run).toEqual([
      '2026-01-31T18:00', '2026-02-28T18:00', '2026-03-31T18:00', '2026-04-30T18:00', '2026-05-31T18:00',
    ]);
  });

  it('finds the 29th in a leap year', () => {
    const monthly = task({ recurrence: 'monthly', deadline: '2024-01-31T18:00' });
    expect(scheduled(nextOccurrence(monthly, at('2024-01-31T20:00', IST), IST)).deadline)
      .toBe('2024-02-29T18:00');
  });

  it('clamps a quarterly rule per quarter, not once and for all', () => {
    const quarterly = { ...custom('FREQ=MONTHLY;INTERVAL=3'), deadline: '2026-01-31T09:00' };
    const dates = [1, 2, 3].map((occurrence) =>
      scheduled(nextOccurrence(
        task({ ...quarterly, occurrence, seriesAnchor: '2026-01-31T09:00' }),
        at('2026-01-01T00:00', IST),
        IST,
      )).deadline,
    );
    expect(dates).toEqual(['2026-04-30T09:00', '2026-07-31T09:00', '2026-10-31T09:00']);
  });

  it('keeps a yearly 29 February on the 29th whenever there is one', () => {
    const yearly = { ...task({ recurrence: 'yearly' }), deadline: '2024-02-29T10:00' };
    const dates = [1, 2, 3, 4].map((occurrence) =>
      scheduled(nextOccurrence(
        { ...yearly, occurrence, seriesAnchor: '2024-02-29T10:00' },
        at('2024-01-01T00:00', IST),
        IST,
      )).deadline,
    );
    expect(dates).toEqual([
      '2025-02-28T10:00', '2026-02-28T10:00', '2027-02-28T10:00', '2028-02-29T10:00',
    ]);
  });
});

// ─── The patterns the old rule object could not say ──────────────────────────

/**
 * "The last Friday of every month" is the pattern this whole session exists
 * for: the old rule's `byWeekday` was weekly-only, so there was no way to
 * write it down at all.
 *
 * Every anchor below is Tuesday 10 March 2026, which is deliberately also the
 * *second Tuesday* of that month — so the two monthly weekday rules disagree
 * about whether the anchor's own month still owes an occurrence, and the pair
 * pins both halves of that answer.
 */
describe('ordinal weekdays and days of the month', () => {
  const monthly = (rrule: string, over: Partial<Task> = {}) =>
    task({
      ...custom(rrule),
      deadline: '2026-03-10T09:00',
      seriesAnchor: '2026-03-10T09:00',
      ...over,
    });

  it('repeats on the last Friday of every month', () => {
    const rule = 'FREQ=MONTHLY;INTERVAL=1;BYDAY=-1FR';
    // 27 March, 24 April, 29 May — none of them the same date twice, which is
    // exactly what no clamped day-of-month rule could have produced.
    expect(scheduled(nextOccurrence(monthly(rule), at('2026-03-10T10:00', IST), IST)).deadline)
      .toBe('2026-03-27T09:00');
    expect(scheduled(nextOccurrence(
      monthly(rule, { deadline: '2026-03-27T09:00', occurrence: 2 }), at('2026-03-27T10:00', IST), IST,
    )).deadline).toBe('2026-04-24T09:00');
    expect(scheduled(nextOccurrence(
      monthly(rule, { deadline: '2026-04-24T09:00', occurrence: 3 }), at('2026-04-24T10:00', IST), IST,
    )).deadline).toBe('2026-05-29T09:00');
  });

  it('gives the anchor month its own occurrence when the day is still ahead', () => {
    // The last Friday of March is the 27th and the anchor is the 10th, so the
    // next one is this month's — the same courtesy the weekly rule pays the
    // rest of the anchor's week.
    expect(scheduled(nextOccurrence(
      monthly('FREQ=MONTHLY;INTERVAL=1;BYDAY=-1FR'), at('2026-03-10T10:00', IST), IST,
    )).occurrence).toBe(2);
  });

  it('does not hand back the anchor when the anchor is already the chosen day', () => {
    // 10 March IS the second Tuesday, so March owes nothing more and the
    // series moves to April rather than repeating the day it started on.
    expect(scheduled(nextOccurrence(
      monthly('FREQ=MONTHLY;INTERVAL=1;BYDAY=2TU'), at('2026-03-10T10:00', IST), IST,
    )).deadline).toBe('2026-04-14T09:00');
  });

  it('repeats on a fixed day of the month', () => {
    expect(scheduled(nextOccurrence(
      monthly('FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=15'), at('2026-03-10T10:00', IST), IST,
    )).deadline).toBe('2026-03-15T09:00');
    expect(scheduled(nextOccurrence(
      monthly('FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=15', { deadline: '2026-03-15T09:00', occurrence: 2 }),
      at('2026-03-15T10:00', IST), IST,
    )).deadline).toBe('2026-04-15T09:00');
  });

  it('repeats on the last day of the month, whatever length the month is', () => {
    const lastDay = (over: Partial<Task>) =>
      task({
        ...custom('FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=-1'),
        seriesAnchor: '2026-01-31T09:00',
        ...over,
      });
    // 31 January, then February's 28th, then back to the 31st in March —
    // never the 28th twice, which is what a chained series would have given.
    expect(scheduled(nextOccurrence(
      lastDay({ deadline: '2026-01-31T09:00' }), at('2026-01-31T10:00', IST), IST,
    )).deadline).toBe('2026-02-28T09:00');
    expect(scheduled(nextOccurrence(
      lastDay({ deadline: '2026-02-28T09:00', occurrence: 2 }), at('2026-02-28T10:00', IST), IST,
    )).deadline).toBe('2026-03-31T09:00');
  });

  it('clamps a day of the month that February does not have', () => {
    // RFC 5545 skips such a month; this engine clamps, for the reason set out
    // on `RRule` — it is the answer `addMonths` already gives a task anchored
    // on the 31st, and two opinions about February would be worse than one.
    expect(scheduled(nextOccurrence(
      task({
        ...custom('FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=31'),
        deadline: '2026-01-31T09:00',
        seriesAnchor: '2026-01-31T09:00',
      }),
      at('2026-01-31T10:00', IST),
      IST,
    )).deadline).toBe('2026-02-28T09:00');
  });

  it('repeats every weekday, skipping the weekend', () => {
    // Friday 13 March, so the next one is the Monday and the one after is the
    // Tuesday — three days apart and then one.
    const weekdays = (over: Partial<Task>) =>
      task({
        ...custom('FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR'),
        seriesAnchor: '2026-03-13T09:00',
        ...over,
      });
    expect(scheduled(nextOccurrence(
      weekdays({ deadline: '2026-03-13T09:00' }), at('2026-03-13T10:00', IST), IST,
    )).deadline).toBe('2026-03-16T09:00');
    expect(scheduled(nextOccurrence(
      weekdays({ deadline: '2026-03-16T09:00', occurrence: 2 }), at('2026-03-16T10:00', IST), IST,
    )).deadline).toBe('2026-03-17T09:00');
  });
});

// ─── Saying it in English ────────────────────────────────────────────────────

/**
 * This string is the Repeat field's whole label once a custom rule is saved,
 * so a pattern the engine can run and the description cannot say is a pattern
 * nobody can tell they have set.
 */
describe('describeRecurrenceRule', () => {
  it('says the patterns that already existed exactly as it always did', () => {
    expect(describeRecurrenceRule(parsed('FREQ=DAILY;INTERVAL=1'))).toBe('Every day');
    expect(describeRecurrenceRule(parsed('FREQ=YEARLY;INTERVAL=3'))).toBe('Every 3 years');
    expect(describeRecurrenceRule(parsed('FREQ=MONTHLY;INTERVAL=1;COUNT=3'))).toBe('Every month, 3x');
    expect(describeRecurrenceRule(parsed('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH;COUNT=8')))
      .toBe('Every 2 weeks on Mon, Thu, 8x');
  });

  it('says the new ones', () => {
    expect(describeRecurrenceRule(parsed('FREQ=MONTHLY;INTERVAL=1;BYDAY=-1FR')))
      .toBe('Every month on the last Friday');
    expect(describeRecurrenceRule(parsed('FREQ=MONTHLY;INTERVAL=1;BYDAY=2TU')))
      .toBe('Every month on the 2nd Tuesday');
    expect(describeRecurrenceRule(parsed('FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=15')))
      .toBe('Every month on the 15th');
    expect(describeRecurrenceRule(parsed('FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=-1')))
      .toBe('Every 2 months on the last day');
    expect(describeRecurrenceRule(parsed('FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR')))
      .toBe('Every weekday');
  });

  it('is only "Every weekday" when that is the whole of it', () => {
    // Every other week, Monday to Friday, is a different thing entirely.
    expect(describeRecurrenceRule(parsed('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TU,WE,TH,FR')))
      .toBe('Every 2 weeks on Mon, Tue, Wed, Thu, Fri');
  });

  it('names the day the series ends on, not the day before it', () => {
    // Built from the parts rather than parsed: `new Date('2026-01-31')` is UTC
    // midnight and reads as the 30th anywhere west of Greenwich.
    const label = new Date(2026, 0, 31)
      .toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    expect(describeRecurrenceRule(parsed('FREQ=DAILY;INTERVAL=1;UNTIL=20260131')))
      .toBe('Every day, until ' + label);
  });
});

// ─── Daylight saving ─────────────────────────────────────────────────────────

describe('daylight saving', () => {
  // New York moves to EDT on 8 March 2026 and back to EST on 1 November 2026.
  it('stays at 09:00 through the spring change, not 23 hours later', () => {
    const daily = task({ recurrence: 'daily', deadline: '2026-03-07T09:00' });
    expect(scheduled(nextOccurrence(daily, at('2026-03-07T20:00', NY), NY)).deadline)
      .toBe('2026-03-08T09:00');
  });

  it('stays at 09:00 through the autumn change, not 25 hours later', () => {
    const daily = task({ recurrence: 'daily', deadline: '2026-10-31T09:00' });
    expect(scheduled(nextOccurrence(daily, at('2026-10-31T20:00', NY), NY)).deadline)
      .toBe('2026-11-01T09:00');
  });

  it('lands an hour early on the one morning the time does not exist', () => {
    // 02:30 on 8 March 2026 is skipped by the clocks entirely. Documented
    // behaviour, pinned here so it stays a known cost rather than a surprise —
    // and the anchor is still 02:30, so the following day is 02:30 again.
    const daily = task({ recurrence: 'daily', deadline: '2026-03-07T02:30' });
    const missing = scheduled(nextOccurrence(daily, at('2026-03-07T12:00', NY), NY));
    expect(missing.deadline).toBe('2026-03-08T01:30');

    const after = scheduled(nextOccurrence(
      task({ recurrence: 'daily', deadline: missing.deadline, seriesAnchor: missing.seriesAnchor, occurrence: 2 }),
      at('2026-03-08T12:00', NY),
      NY,
    ));
    expect(after.deadline).toBe('2026-03-09T02:30');
  });

  it('holds the same time in a zone that has no clock changes at all', () => {
    const daily = task({ recurrence: 'daily', deadline: '2026-03-07T09:00' });
    expect(scheduled(nextOccurrence(daily, at('2026-03-07T20:00', IST), IST)).deadline)
      .toBe('2026-03-08T09:00');
  });

  it('moves a weekly task by seven calendar days, not by 168 hours', () => {
    const weekly = task({ recurrence: 'weekly', deadline: '2026-03-05T09:00' });
    expect(scheduled(nextOccurrence(weekly, at('2026-03-05T20:00', NY), NY)).deadline)
      .toBe('2026-03-12T09:00');
  });
});

// ─── The rule as Google draws it ─────────────────────────────────────────────

describe('calendarRRuleOf', () => {
  it('says nothing about a task that does not repeat', () => {
    expect(calendarRRuleOf(task(), IST)).toBeNull();
    expect(calendarRRuleOf(task({ recurrence: 'none' }), IST)).toBeNull();
  });

  it('spells a preset out in full, since Google gets no presets', () => {
    expect(calendarRRuleOf(task({ recurrence: 'daily' }), IST)).toBe('RRULE:FREQ=DAILY;INTERVAL=1');
  });

  it('hands over the pattern that was the whole point of RRULEs', () => {
    // Item 4's "done when", as a string: the last Friday of every month, in
    // the one field Google expands a series from.
    expect(calendarRRuleOf(task(custom('FREQ=MONTHLY;INTERVAL=1;BYDAY=-1FR')), IST))
      .toBe('RRULE:FREQ=MONTHLY;INTERVAL=1;BYDAY=-1FR');
  });

  it('states the app’s Sunday week on a weekly rule rather than taking the default', () => {
    // RFC 5545 starts the week on Monday; `occurrenceDay` counts from Sunday.
    // At INTERVAL=2 with days either side of the weekend that is the
    // difference between two schedules, so it is written down.
    expect(calendarRRuleOf(task(custom('FREQ=WEEKLY;INTERVAL=2;BYDAY=SU,MO')), IST))
      .toBe('RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=SU,MO;WKST=SU');
  });

  it('counts the occurrences that are left, not the ones the series began with', () => {
    // Google expands from *this* occurrence. `COUNT=5` on the third of five
    // would draw seven in total.
    const third = task({ ...custom('FREQ=DAILY;INTERVAL=1;COUNT=5'), occurrence: 3 });
    expect(calendarRRuleOf(third, IST)).toBe('RRULE:FREQ=DAILY;INTERVAL=1;COUNT=3');
  });

  it('treats a series with one left as no series at all', () => {
    const last = task({ ...custom('FREQ=DAILY;INTERVAL=1;COUNT=5'), occurrence: 5 });
    expect(calendarRRuleOf(last, IST)).toBeNull();
  });

  it('ends the series at the end of the end day, in the user’s own zone', () => {
    // The app stores a bare day and means the end of it (`parseStoredDate`).
    // RFC 5545 forbids that spelling beside a timed start, and Google would
    // read it as midnight UTC — cutting an occurrence *on* the end date.
    expect(calendarRRuleOf(task(custom('FREQ=DAILY;INTERVAL=1;UNTIL=20260401')), IST))
      .toBe('RRULE:FREQ=DAILY;INTERVAL=1;UNTIL=20260401T182959Z');
    expect(calendarRRuleOf(task(custom('FREQ=DAILY;INTERVAL=1;UNTIL=20260401')), NY))
      .toBe('RRULE:FREQ=DAILY;INTERVAL=1;UNTIL=20260402T035959Z');
  });

  it('leaves an UNTIL that already carries a time exactly where it was', () => {
    expect(calendarRRuleOf(task(custom('FREQ=WEEKLY;INTERVAL=1;UNTIL=20260401T120000Z')), IST))
      .toBe('RRULE:FREQ=WEEKLY;INTERVAL=1;UNTIL=20260401T120000Z;WKST=SU');
  });
});

// ─── Both dates ──────────────────────────────────────────────────────────────

describe('start date and deadline together', () => {
  it('moves both, keeping the gap and each one\'s time of day', () => {
    const both = task({
      recurrence: 'monthly',
      startDate: '2026-01-28T09:00',
      deadline: '2026-01-31T18:00',
    });
    expect(nextOccurrence(both, at('2026-01-31T20:00', IST), IST)).toEqual({
      kind: 'next',
      occurrence: 2,
      seriesAnchor: '2026-01-31T18:00',
      startDate: '2026-02-25T09:00',
      deadline: '2026-02-28T18:00',
    });
  });

  it('keeps the gap across a clock change instead of dragging the start hour', () => {
    const both = task({
      recurrence: 'weekly',
      startDate: '2026-03-05T09:00',
      deadline: '2026-03-10T17:00',
    });
    expect(nextOccurrence(both, at('2026-03-10T20:00', NY), NY)).toEqual({
      kind: 'next',
      occurrence: 2,
      seriesAnchor: '2026-03-10T17:00',
      startDate: '2026-03-12T09:00',
      deadline: '2026-03-17T17:00',
    });
  });

  it('anchors on the start date when there is no deadline, and adds none', () => {
    const startOnly = task({ recurrence: 'weekly', startDate: '2026-03-10T09:00' });
    expect(nextOccurrence(startOnly, at('2026-03-10T20:00', IST), IST)).toEqual({
      kind: 'next',
      occurrence: 2,
      seriesAnchor: '2026-03-10T09:00',
      startDate: '2026-03-17T09:00',
    });
  });
});

// ─── End conditions ──────────────────────────────────────────────────────────

describe('end conditions', () => {
  const daily = (ends: string, overrides: Partial<Task> = {}) =>
    task({
      ...custom('FREQ=DAILY;INTERVAL=1' + ends),
      deadline: '2026-03-10T09:00',
      seriesAnchor: '2026-03-10T09:00',
      ...overrides,
    });

  it('runs to exactly the requested number of occurrences', () => {
    const fifth = scheduled(nextOccurrence(
      daily(';COUNT=5', { occurrence: 4 }),
      at('2026-03-13T20:00', IST),
      IST,
    ));
    expect(fifth.occurrence).toBe(5);

    expect(nextOccurrence(
      daily(';COUNT=5', { occurrence: 5 }),
      at('2026-03-14T20:00', IST),
      IST,
    )).toEqual({ kind: 'ended', reason: 'count' });
  });

  it('is over if the count ran out while the task sat untouched', () => {
    // Five daily occurrences from 10 March, finished for the first time on
    // 1 April: the series expired three weeks ago and does not restart.
    expect(nextOccurrence(
      daily(';COUNT=5', { occurrence: 1 }),
      at('2026-04-01T12:00', IST),
      IST,
    )).toEqual({ kind: 'ended', reason: 'count' });
  });

  it('stops once the next occurrence would fall past the end date', () => {
    const rule = ';UNTIL=20260312';
    expect(scheduled(nextOccurrence(daily(rule, { occurrence: 1 }), at('2026-03-10T20:00', IST), IST)).deadline)
      .toBe('2026-03-11T09:00');
    expect(scheduled(nextOccurrence(daily(rule, { occurrence: 2 }), at('2026-03-11T20:00', IST), IST)).deadline)
      .toBe('2026-03-12T09:00');
    expect(nextOccurrence(daily(rule, { occurrence: 3 }), at('2026-03-12T20:00', IST), IST))
      .toEqual({ kind: 'ended', reason: 'endDate' });
  });

  it('counts an occurrence landing exactly on the end date as inside it', () => {
    // The datetime form of UNTIL, which is what an RRULE from another
    // calendar may carry; this app's own picker only ever writes a bare day.
    const rule = ';UNTIL=20260312T090000';
    expect(scheduled(nextOccurrence(daily(rule, { occurrence: 2 }), at('2026-03-11T20:00', IST), IST)).deadline)
      .toBe('2026-03-12T09:00');
  });

  it('keeps going when the rule never ends', () => {
    // Fifteen months on, still on the same daily grid the anchor set.
    expect(scheduled(nextOccurrence(
      daily('', { occurrence: 400 }),
      at('2027-06-01T12:00', IST),
      IST,
    ))).toMatchObject({ occurrence: 450, deadline: '2027-06-02T09:00' });
  });

  it('gives up rather than searching forever from a corrupt anchor', () => {
    const ancient = task({ recurrence: 'daily', deadline: '1600-01-01T09:00' });
    expect(nextOccurrence(ancient, at('2026-03-10T09:00', IST), IST))
      .toEqual({ kind: 'ended', reason: 'exhausted' });
  });
});

// ─── Repeating without a schedule ────────────────────────────────────────────

describe('a repeating task with no dates', () => {
  it('still comes back, carrying no dates and no anchor', () => {
    expect(nextOccurrence(task({ recurrence: 'daily' }), at('2026-03-10T09:00', IST), IST))
      .toEqual({ kind: 'next', occurrence: 2 });
  });

  it('still respects a count', () => {
    expect(nextOccurrence(
      task({ ...custom('FREQ=DAILY;COUNT=3'), occurrence: 3 }),
      at('2026-03-10T09:00', IST),
      IST,
    )).toEqual({ kind: 'ended', reason: 'count' });
  });

  it('measures an end date against today, having nothing else to measure', () => {
    const bounded = task({ ...custom('FREQ=DAILY;UNTIL=20260301') });
    expect(nextOccurrence(bounded, at('2026-02-20T09:00', IST), IST)).toEqual({ kind: 'next', occurrence: 2 });
    expect(nextOccurrence(bounded, at('2026-03-10T09:00', IST), IST))
      .toEqual({ kind: 'ended', reason: 'endDate' });
  });
});

describe('a task that does not repeat', () => {
  it('has no next occurrence', () => {
    expect(nextOccurrence(task({ deadline: '2026-03-10T09:00' }), at('2026-03-10T20:00', IST), IST))
      .toEqual({ kind: 'none' });
    expect(nextOccurrence(task({ recurrence: 'none' }), at('2026-03-10T20:00', IST), IST))
      .toEqual({ kind: 'none' });
  });
});

// ─── The successor ───────────────────────────────────────────────────────────

describe('buildSuccessorTask', () => {
  const original = task({
    id: 'old',
    title: 'Send the invoice',
    status: 'completed',
    completedAt: 1_700_000_000_000,
    listId: 'l1',
    listName: 'Money',
    recurrence: 'monthly',
    deadline: '2026-01-31T18:00',
    startDate: '2026-01-28T09:00',
    estimatedTime: 45,
    description: 'The March one goes to the CA too.',
    dependsOn: ['other'],
    sharedListIds: ['l9'],
    valueINR: 5000,
    humanOverride: 6,
    avoidedCount: 2,
    allocatedTime: 3600,
    shareId: 'share-abc',
    shortUrlKeyword: 'invoice',
    shortUrlDomain: 'shree.link',
    subtasks: [
      {
        id: 's1',
        title: 'Check the hours',
        status: 'completed',
        allocatedTime: 600,
        avoidedCount: 3,
        emergencyBoost: 4,
        subtasks: [{ id: 's1a', title: 'Open the log', status: 'completed' }],
      },
    ],
  });

  const build = (from: Task = original, now = at('2026-01-31T20:00', IST)) =>
    buildSuccessorTask(
      from,
      scheduled(nextOccurrence(from, now, IST)),
      { newId: counter(), seriesId: 'series-1', createdAt: 999 },
    );

  it('carries over everything that describes the work', () => {
    const next = build();
    expect(next).toMatchObject({
      title: 'Send the invoice',
      listId: 'l1',
      listName: 'Money',
      recurrence: 'monthly',
      estimatedTime: 45,
      description: 'The March one goes to the CA too.',
      dependsOn: ['other'],
      sharedListIds: ['l9'],
      valueINR: 5000,
      humanOverride: 6,
    });
  });

  it('drops everything that described the last time it was done', () => {
    const next = build();
    expect(next.status).toBe('needsAction');
    expect(next).not.toHaveProperty('completedAt');
    expect(next).not.toHaveProperty('allocatedTime');
    expect(next).not.toHaveProperty('avoidedCount');
    expect(next.createdAt).toBe(999);
  });

  it('does not inherit the public share link', () => {
    const next = build();
    expect(next).not.toHaveProperty('shareId');
    expect(next).not.toHaveProperty('shortUrlKeyword');
    expect(next).not.toHaveProperty('shortUrlDomain');
  });

  it('stamps the series, the position in it and the anchor', () => {
    const next = build();
    expect(next.seriesId).toBe('series-1');
    expect(next.occurrence).toBe(2);
    expect(next.seriesAnchor).toBe('2026-01-31T18:00');
    expect(next.deadline).toBe('2026-02-28T18:00');
    expect(next.startDate).toBe('2026-02-25T09:00');
  });

  it('keeps the series id it already had rather than starting a new one', () => {
    const second = buildSuccessorTask(
      { ...original, seriesId: 'series-original', occurrence: 2, seriesAnchor: '2026-01-31T18:00' },
      scheduled(nextOccurrence(
        { ...original, seriesId: 'series-original', occurrence: 2, seriesAnchor: '2026-01-31T18:00' },
        at('2026-02-28T20:00', IST),
        IST,
      )),
      { newId: counter(), seriesId: 'series-fresh', createdAt: 0 },
    );
    expect(second.seriesId).toBe('series-original');
    expect(second.occurrence).toBe(3);
  });

  it('resets the whole subtask tree and gives every level a new id', () => {
    const next = build();
    const [sub] = next.subtasks ?? [];
    expect(sub.title).toBe('Check the hours');
    expect(sub.status).toBe('needsAction');
    expect(sub.id).not.toBe('s1');
    expect(sub).not.toHaveProperty('allocatedTime');
    // The three that describe the last attempt rather than the work. Item 17
    // added `emergencyBoost` to `Subtask`, and it goes for the same reason the
    // other two do: last month's emergency is not this month's.
    expect(sub).not.toHaveProperty('avoidedCount');
    expect(sub).not.toHaveProperty('emergencyBoost');

    const [nested] = sub.subtasks ?? [];
    expect(nested.title).toBe('Open the log');
    expect(nested.status).toBe('needsAction');
    expect(nested.id).not.toBe('s1a');

    // Every id in the successor is distinct — reusing one would let work on
    // the old occurrence tick off the new one, since subtask ids are how a
    // focus-queue proxy row finds its subtask.
    const ids = [next.id, sub.id, nested.id];
    expect(new Set(ids).size).toBe(3);
  });

  it('leaves no undefined values behind for Firestore to reject', () => {
    const next = build();
    expect(Object.values(next).every((value) => value !== undefined)).toBe(true);
  });

  it('is a new row, not the old one renamed', () => {
    expect(build().id).not.toBe('old');
  });
});

// ─── The whole loop ──────────────────────────────────────────────────────────

describe('a series run end to end', () => {
  it('holds its weekday and time over three months of completions', () => {
    let current = task({ recurrence: 'weekly', deadline: '2026-02-03T07:30' });
    const run: (string | undefined)[] = [current.deadline];
    for (let i = 0; i < 5; i++) {
      current = complete(current, at(`${current.deadline}`.replace('T07:30', 'T09:00'), IST), IST);
      run.push(current.deadline);
    }
    expect(run).toEqual([
      '2026-02-03T07:30', '2026-02-10T07:30', '2026-02-17T07:30',
      '2026-02-24T07:30', '2026-03-03T07:30', '2026-03-10T07:30',
    ]);
    expect(current.occurrence).toBe(6);
    expect(current.seriesAnchor).toBe('2026-02-03T07:30');
  });

  it('is one series with one id, however many times it is completed', () => {
    let current = task({ recurrence: 'daily', deadline: '2026-02-03T07:30' });
    const seriesIds = new Set<string>();
    for (let i = 0; i < 4; i++) {
      current = complete(current, at(`${current.deadline}`.replace('T07:30', 'T09:00'), IST), IST);
      seriesIds.add(current.seriesId ?? '');
    }
    expect([...seriesIds]).toEqual(['series-1']);
    expect(current.occurrence).toBe(5);
  });
});

// ─── What the screen is told ─────────────────────────────────────────────────

/**
 * `seriesStatus` is the only thing the UI reads about a repeat, so what is
 * pinned here is the wording a person actually sees. The case worth the most
 * is the last one in the block: a finished occurrence is judged at the moment
 * it was finished, not at the moment somebody happens to look at it, and
 * getting that wrong makes old rows lie about a series that is still running.
 */
describe('seriesStatus', () => {
  const fiveDaily = (over: Partial<Task> = {}) =>
    task({
      ...custom('FREQ=DAILY;COUNT=5'),
      deadline: '2026-03-10T09:00',
      ...over,
    });

  it('says nothing at all about a task that does not repeat', () => {
    const status = seriesStatus(task({ deadline: '2026-03-10T09:00' }), at('2026-03-10T10:00', IST), IST);
    expect(status).toEqual({ kind: 'none' });
    expect(describeSeriesStatus(status)).toBeNull();
  });

  it('counts a bounded repeat towards its total', () => {
    const status = seriesStatus(fiveDaily({ occurrence: 3 }), at('2026-03-12T10:00', IST), IST);
    expect(status).toMatchObject({ kind: 'open', occurrence: 3, total: 5 });
    expect(describeSeriesStatus(status)).toBe('3 of 5');
  });

  it('stays quiet about an open-ended repeat, which the chip already describes', () => {
    const status = seriesStatus(task({ recurrence: 'daily', deadline: '2026-03-10T09:00' }), at('2026-03-10T10:00', IST), IST);
    expect(status).toMatchObject({ kind: 'open', occurrence: 1 });
    expect(describeSeriesStatus(status)).toBeNull();
  });

  it('warns on the last one before it is ticked off', () => {
    const status = seriesStatus(fiveDaily({ occurrence: 5 }), at('2026-03-14T10:00', IST), IST);
    expect(status).toMatchObject({ kind: 'last', occurrence: 5, total: 5, reason: 'count' });
    expect(describeSeriesStatus(status)).toBe('Last one (5 of 5)');
  });

  it('warns on the last one under an end date too', () => {
    const bounded = task({ ...custom('FREQ=DAILY;UNTIL=20260311'), deadline: '2026-03-10T09:00' });
    const status = seriesStatus(bounded, at('2026-03-11T10:00', IST), IST);
    expect(status).toMatchObject({ kind: 'last', reason: 'endDate' });
    expect(describeSeriesStatus(status)).toBe('Last one');
  });

  it('reports a finished repeat once the final one is ticked off', () => {
    const done = fiveDaily({
      occurrence: 5,
      status: 'completed',
      completedAt: at('2026-03-14T10:00', IST).getTime(),
    });
    const status = seriesStatus(done, at('2026-03-14T11:00', IST), IST);
    expect(status).toMatchObject({ kind: 'finished', occurrence: 5, total: 5 });
    expect(describeSeriesStatus(status)).toBe('Repeat finished');
  });

  it('judges a finished occurrence at the moment it was finished, not now', () => {
    // Occurrence 1 of a five-times daily series, ticked off the day it was
    // due — which spawned occurrence 2. Read a year later, a `now`-based
    // answer would skip past all five and call this row the end of the road.
    const done = fiveDaily({
      occurrence: 1,
      status: 'completed',
      completedAt: at('2026-03-10T10:00', IST).getTime(),
    });
    expect(seriesStatus(done, at('2027-03-10T10:00', IST), IST)).toMatchObject({ kind: 'open', occurrence: 1 });
  });
});
