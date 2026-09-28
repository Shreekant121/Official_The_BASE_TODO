Transient confirmation — a pill, not a card.

```jsx
<Toast icon={<Icon name="check" size={15} />} title="Session saved" detail="7 tasks · 3h 20m" onDismiss={close} />
```

- Pill radius and `level={3}` glass, so it reads over any content. One at a time; stack bottom-centre with `gap: var(--sp-3)`.
- Arrives with `ag-condense` (grows and un-blurs). Leaves with `ag-dissolve`.
- Copy is a completed statement in the system's terse voice — "Session saved", not "Your session has been saved successfully!".
- For anything the user must act on, use `NotificationCard`. Toasts disappear; decisions shouldn't.
