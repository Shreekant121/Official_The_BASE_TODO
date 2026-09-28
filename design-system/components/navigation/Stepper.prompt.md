The product's flow spine — Home → Selection → Deadlines → Focus.

```jsx
<Stepper current={1} steps={[
  { label: 'Select tasks', hint: '7 chosen' },
  { label: 'Allocate time', hint: '3h 20m' },
  { label: 'Focus' },
]} />
```

- Done steps show a tick and emit; the current step gets a soft outer ring; future steps are wells. Three distinct states, readable without colour.
- The connector fills over `--dur-slow` when a step completes — that's the reward moment, so don't shorten it.
- `hint` is where the real value lives ("7 chosen", "3h 20m"). A stepper with only labels is decoration.
- Use `vertical` on narrow layouts rather than shrinking the labels.
