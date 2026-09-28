The focus-session clock — the largest thing on the screen it appears on.

```jsx
<Countdown seconds={1458} total={2700} running label="Draft the Q3 brief" />
<Countdown seconds={-134} total={2700} />
```

- Weight 300 mono at 88px. A bold countdown reads as a threat; light reads as an instrument.
- Negative seconds render as `+MM:SS` in rose with a rose track. That is the overrun state — don't build a separate component for it.
- Tabular numerals mean the digits never jitter as they tick.
- One per screen, and nothing competes with it for size.
