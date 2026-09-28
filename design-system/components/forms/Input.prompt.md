Text field as an etched well — recessed, never raised. On glass, anything you type into must read as carved in.

```jsx
<Input placeholder="Search tasks" iconLeft={<Icon name="search" />} />
<Input defaultValue="45" suffix="min" size="sm" block={false} />
```

- Focus adds an emerald hairline and a soft emerald bloom — no blue browser ring anywhere in this system.
- The suffix is always mono: it is a unit, not a word.
- Pair with a `.ag-kicker` label above rather than a floating placeholder label.
- Do not put a raised (`--glass-fill-*`) background on an input. Wells go in, controls come out.
