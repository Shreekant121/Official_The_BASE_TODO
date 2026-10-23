/**
 * Whether Google already holds what BASE says — the comparisons the reconcile
 * pass (`notificationSync.ts`) makes before it writes anything, so a quiet
 * pass costs no writes.
 *
 * Moved out of that file at 29-2c1, when events joined the pass: a task's
 * block and an event (`lib/events/eventCalendar.ts`) are compared by the same
 * rules, and this half is pure, so the event's matcher can be tested.
 */
import { formatRRule, parseRRule } from './recurrence';
import type { EventReminders, GoogleCalendarEvent } from './googleCalendar';

/** Two timestamps for the same instant, however each side chose to spell it (`…Z` vs `+05:30`). */
export function sameInstant(a: string | undefined, b: string): boolean {
  if (!a) return false;
  const left = Date.parse(a);
  return !Number.isNaN(left) && left === Date.parse(b);
}

/**
 * In any order: an event has up to five reminders (29-2c1), and Google owes
 * nobody the order they were sent in — read in order, a reshuffle would
 * rewrite the event on every pass.
 */
export function sameReminders(existing: GoogleCalendarEvent['reminders'], desired: EventReminders): boolean {
  if (existing?.useDefault !== false) return false;
  const said = (list: { method: string; minutes: number }[]) => list.map((r) => `${r.method}:${r.minutes}`).sort().join('|');
  return said(existing.overrides ?? []) === said(desired.overrides);
}

/**
 * The `RRULE` lines of a recurrence list, each said one way.
 *
 * Compared through the parser rather than as raw strings because Google is
 * entitled to give a rule back in its own spelling — parts reordered, a
 * redundant `INTERVAL=1` dropped — and a string comparison would read every
 * one of those as a difference and rewrite the event on every single pass, for
 * ever. `parseRRule`/`formatRRule` is the app's own canonical form and both
 * sides go through it.
 *
 * `EXDATE`/`RDATE` lines are **ignored, not matched**. Google adds one when
 * somebody deletes a single occurrence in its UI, and the app has no opinion
 * about individual occurrences — only about the pattern. Counting them as a
 * difference would un-delete that occurrence on the next pass, which is a
 * fight with the user over something the app never claimed to own.
 */
export function rruleLines(lines: string[] | undefined): string {
  return (lines ?? [])
    .filter((line) => /^RRULE[:;]/i.test(line.trim()))
    .map((line) => {
      const rule = parseRRule(line);
      return rule ? formatRRule(rule) : line.trim().toUpperCase();
    })
    .join('|');
}

/**
 * The zone a repeat expands in. Only asked about when the block being written
 * actually has one: a block with no `timeZone` of its own has no opinion, and
 * demanding Google hold none either would rewrite for ever an event that kept
 * a stale zone from back when it repeated — harmless on a single event, whose
 * `dateTime` carries its own offset.
 *
 * Compared as written, not canonicalised. Two IANA names for one zone
 * (`Asia/Calcutta`, `Asia/Kolkata`) would read as a difference, and browsers
 * disagree about which of them `Intl` hands back, so there is no canonical
 * form to compare *to*. Google echoes what it was sent, which makes this
 * stable in practice — if `reconcile_ok` ever starts logging a write on every
 * single pass with nothing changing, this is the line to suspect first.
 */
export function sameZone(existing: string | undefined, desired: string | undefined): boolean {
  return desired === undefined || existing === desired;
}
