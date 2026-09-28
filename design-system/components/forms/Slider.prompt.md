Continuous value on a recessed track — for allocating minutes to a task or setting a session length.

```jsx
<Slider min={5} max={180} step={5} defaultValue={45} format={m => m + ' min'} />
```

- The handle grows on grab (18 → 22px). That physical response is the whole point; do not remove it.
- `format` is required whenever the number has a unit. A bare "45" tells the user nothing.
- The fill emits emerald light because it represents committed time — the same accent logic as a running timer.
