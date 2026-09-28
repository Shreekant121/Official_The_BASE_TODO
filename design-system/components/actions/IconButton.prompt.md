A round glass button carrying one icon and no label — the workhorse of floating bars, card corners and nav rails.

```jsx
<IconButton label="Share" size="md"><Icon name="share" /></IconButton>
<IconButton label="Notifications" badge={8}><Icon name="bell" /></IconButton>
<IconButton label="Inbox" active variant="tint" tone="accent"><Inbox size={18} /></IconButton>
<IconButton label="Add" square variant="tint" tone="frost"><Icon name="plus" /></IconButton>
```

- `label` is mandatory. There is no visible text, so without it the control is invisible to assistive tech.
- Hover scales up 4% and press drops to 93% — the springy feel is deliberate and is what separates these from flat icon buttons.
- `badge` glows rose; use it for counts that demand attention, not for passive status.
- Keep one icon inside. Two glyphs in a circle reads as a broken button.
