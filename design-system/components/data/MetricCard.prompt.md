A single number with room to breathe — the workhorse of any dashboard row.

```jsx
<MetricCard label="Focus time today" value="3.4" unit="h" delta="12%" deltaDirection="up" hint="vs last week" />
<MetricCard label="Session" value="24:18" glow size="lg" />
```

- **One** number per card. Two numbers means two cards.
- `deltaDirection="up"` is green and `down` is rose — so for metrics where up is *bad* (overruns, interruptions), pass the direction that reflects sentiment, not arithmetic.
- `glow` marks the live metric. At most one glowing card per screen.
- Values are tabular-numeral by default, so a ticking counter never shifts width.
