Exclusive choice in a recessed glass trough — the indicator pill slides and stretches between options instead of cross-fading.

```jsx
<SegmentedControl options={['Daily', 'Weekly', 'Monthly']} value={range} onChange={setRange} />
```

- Two to four options. Past four the labels crush; switch to `Tabs`.
- The trough is deliberately *recessed* (inner shadow, no cast) while the indicator is *raised* — that inversion is what makes the mechanism legible.
- Never mix icon-only and text options in one control.
- Labels stay short and title-case. All-caps mono labels are for kickers, not for segments.
