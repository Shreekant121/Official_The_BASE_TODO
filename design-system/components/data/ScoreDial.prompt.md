# ScoreDial

The composite priority score (`Eisenhower + Deadline + Personal + Quasi-need − Duration`,
out of 13.5). Use it anywhere that number appears.

A small **rectangle**, not a pill and not a ring: pills are controls in this system
and rings read as progress. This is a value sitting in a slot, and the slot carries
the colour so the numeral stays legible at 11px.

## When to reach for it

- `size="sm"` — a task card, board row or table cell. Number only.
- `size="md"` — beside a task title in a header or stepper.
- `size="lg"` with `showMax` — the task detail page and Needs Attention, where the
  score is the subject rather than a fact about something else.

## Rules

- **Neutral until urgent.** Below `threshold` (10) the chip is a carved well with a
  white numeral. At or above it, the pane goes `--glass-tint-amber` and the numeral
  goes `--hue-amber`. Two states, no score-band rainbow.
- **Never glow it, never ring it.** Glow means *live*; a score is a measurement.
- **One per row.** Where a row shows a score, do not also show the factor chips —
  those belong beside `size="lg"` on the detail page, where they can be acted on.
- **Mono, always**, with tabular figures so a column of scores aligns.
- Keep one decimal. The half-points are real (`−0.5` duration penalty).

## Do not

- Use it for progress or elapsed time — that is `ProgressRing`.
- Add a second hue for status; status has `StatusPill`.
- Round the radius up to a pill: at pill radius it reads as a tappable control.
