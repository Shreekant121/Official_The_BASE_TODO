In-page section switching. Lighter than `SegmentedControl` — use it when the sections are content, not modes.

```jsx
<Tabs value={tab} onChange={setTab} tabs={[
  { value: 'action', label: '⚡ Action Steps', count: 7 },
  { value: 'ice', label: '🧊 Backburner', count: 12 },
  { value: 'ref', label: '📚 Reference', count: 3 },
]} />
```

- The underline measures the real tab width on mount and slides — so labels can be any length.
- `count` goes emerald on the active tab only. It's a quantity, so it's mono.
- Five tabs maximum. More means the page is doing too much.
- For two or three mutually exclusive *modes* (Daily/Weekly/Monthly), use `SegmentedControl` instead.
