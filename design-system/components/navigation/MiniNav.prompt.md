A floating pill rail — the primary navigation for this product. It hovers over content rather than framing it.

```jsx
<MiniNav
  value={view}
  onChange={setView}
  items={[
    { value: 'home', label: 'Home', icon: <Icon name="house" size={20} /> },
    { value: 'selection', label: 'Tasks', icon: <Icon name="list-checks" size={20} /> },
    { value: 'focus', label: 'Focus', icon: <Icon name="target" size={20} />, badge: true },
  ]}
/>
```

- Four to six items. This is top-level navigation, not a menu.
- The emerald indicator *travels* between positions. That continuity is the point — never cross-fade it.
- Position it `fixed` bottom-centre on tablet, or `vertical` at the left edge on desktop. It should never be full-width.
- `label` doubles as the accessible name, so it's required even when `showLabels` is false.
