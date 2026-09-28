Completion control — the tick strokes on and the label strikes through, so "done" is legible at a glance in a long list.

```jsx
<Checkbox label="Draft the Q3 brief" onChange={done => complete(id, done)} />
```

- This is the most-pressed control in a task product. Keep the 24px box (20px only in dense tables) and never shrink the label hit area.
- The strike-through is part of the design, not decoration — it is how a scanned list separates done from pending without colour.
- For settings that apply instantly, use `Switch` instead.
