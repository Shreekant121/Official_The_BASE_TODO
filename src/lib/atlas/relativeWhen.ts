/**
 * How long ago, for the conversation list's right-hand column (item 10).
 *
 * `atlas.html` draws `now`, `2h`, `Mon`, `28 Aug` — four scales, coarser the
 * further back it goes, which is what makes a column of them readable at a
 * glance. This is that, from an ISO timestamp.
 *
 * **`now` starts at "under two minutes", not "under one".** A row that says
 * `1m` the instant after a turn finishes reads as staleness rather than as
 * recency, and the chat at the top of the list is almost always the one just
 * used.
 *
 * `now` is an argument for the reason every date helper in this app takes one:
 * a function that reads the clock cannot be asserted against a fixed answer.
 */
export function relativeWhen(iso: string, now = Date.now()): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return '';

  const minutes = Math.floor((now - at) / 60000);
  if (minutes < 2) return 'now';
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;

  const days = Math.floor(hours / 24);
  // Inside a week the weekday is more use than "4d" — it is how anybody
  // remembers when they said something.
  if (days < 7) return new Date(at).toLocaleDateString(undefined, { weekday: 'short' });
  return new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
