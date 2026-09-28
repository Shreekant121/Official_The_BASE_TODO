The atom of the product — one task, scannable in a stack of forty.

```jsx
<TaskRow
  title="Draft the Q3 brief"
  meta="⚡ Action Steps · 3 subtasks"
  allocated="45 min"
  status={<StatusPill status="queued" size="sm" />}
  onToggle={() => toggle(id)}
  actions={<IconButton label="Edit" size="sm" variant="ghost"><Icon name="pencil" size={16} /></IconButton>}
/>
```

- Actions are **hidden until hover** and don't reserve space — that's what keeps a long list calm. On tablet, render them always-visible instead, since there is no hover.
- `selected` (emerald tint + glow) means *chosen for this session*; `done` dims and strikes through. They're independent.
- Rows sit at `level={1}` glass so a stack of them doesn't turn into a wall of frosted panes. Stack with `gap: var(--sp-3)`, never flush.
- Keep `allocated` pre-formatted with its unit. A bare number in a row is unreadable.
