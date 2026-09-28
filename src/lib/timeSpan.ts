/**
 * "4h 30m" / "45m" / "4h" — the app's way of naming a length of time.
 *
 * A leaf module (no store, no clock, no I/O) so that Set Deadlines and the PERT
 * sheet it opens can share one answer without closing an import cycle. The
 * output matches `mins()` in `design-system/screens/deadlines.html` exactly:
 * under an hour it is minutes alone, and a whole number of hours drops the
 * trailing "0m".
 *
 * Two other copies of this arithmetic exist — `formatMinutes` in
 * `SmartStartModal.tsx` and in `TaskDetailPanel.tsx`. They belong to the Home
 * and task-sheet screens and were left where they are; fold them in here if a
 * session ever owns both.
 */

/** Minutes → "4h 30m". Rounded, never negative. */
export function formatSpanMinutes(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** Seconds → "4h 30m". */
export function formatSpan(seconds: number): string {
  return formatSpanMinutes(Math.floor(Math.max(0, seconds) / 60));
}

/**
 * Seconds → "04:00:00" — `hms()` in `design-system/screens/focus.html`, which
 * pads through the hour so a session readout never changes width as it runs
 * down. `Countdown` drops the hour below one and is the right call for the
 * task clock; this is the right call for the window it sits inside.
 */
export function formatHms(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

/** Minutes past midnight → "17:30", wrapping past a day. */
export function formatClock(minutesOfDay: number): string {
  const total = Math.round(minutesOfDay);
  const h = Math.floor(total / 60) % 24;
  const m = ((total % 60) + 60) % 60;
  return `${h < 10 ? '0' : ''}${h}:${m < 10 ? '0' : ''}${m}`;
}
