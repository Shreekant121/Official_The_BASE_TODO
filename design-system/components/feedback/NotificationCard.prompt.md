A notification that grows in place when clicked — no drawer, no modal, no navigation.

```jsx
<NotificationCard
  icon={<Icon name="clock" size={18} />}
  title="Session ran over by 4 minutes"
  time="2m"
  body="Draft the Q3 brief used 49 of 45 allocated minutes."
  tone="overrun"
  unread
  actions={<><Button size="sm" variant="tint" tone="accent">Adjust</Button><Button size="sm" variant="ghost">Dismiss</Button></>}
/>
```

- Expansion animates `grid-template-rows` 0fr → 1fr, so the height genuinely morphs rather than snapping. Don't replace it with a fade.
- `tone` colours **only the icon**. Tinting the whole card makes a list of notifications look like a warning wall.
- Collapsed shows one truncated line of `body`; open shows all of it. Write the first eight words so they work alone.
- Stack in a column with `gap: var(--sp-4)`. Only one should be open at a time in a panel — treat it as an accordion.
