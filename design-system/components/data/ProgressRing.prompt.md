Circular completion, for a session or a task set.

```jsx
<ProgressRing value={7} max={12} label="tasks" />
<ProgressRing value={82} size={140} thickness={10}>
  <span style={{ font: 'var(--type-metric)' }}>82</span>
</ProgressRing>
```

- The track is carved (black inset + faint white) and the arc emits. Same well-vs-pane logic as everywhere else.
- Sweeps from 12 o'clock, rounded cap. Never render a full 100% ring as a closed circle without the cap — the gap is what shows it's a measure.
- Use `tone="rose"` when the value represents an overrun, not just a high number.
- The arc's glow is allowed to spill outside the box (`overflow: visible` on the
  `<svg>`), so it never gets sliced into a hard square. Do not put the ring inside
  a container with `overflow: hidden`, a `backdrop-filter`, or a `clip-path` — any
  of those crops the glow back into a box. Give it a parent with room instead: the
  glow reads about `thickness` beyond the ring on every side. It cannot push
  anything around, because the element keeps its declared `size`.
