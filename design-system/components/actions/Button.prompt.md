The system button — a pill at every size, with five variants that map to intent rather than decoration.

```jsx
<Button variant="frost" size="lg">Get in touch</Button>
<Button variant="solid" iconRight={<ArrowUpRight size={16} />}>Start session</Button>
<Button variant="tint" tone="accent">Mark done</Button>
<Button variant="ghost" size="sm">Cancel</Button>
```

- Exactly **one** `solid` button per view. If two things look primary, neither is.
- `frost` is the loudest option on a busy photographic or gradient backdrop — white glass always wins over accent glass there.
- `tint` carries affirmative meaning (send, approve, publish) without going fully solid.
- Press feedback is a 0.965 scale, never a colour-only change. Hover brightens the fill and lifts the cast shadow.
- `size="sm"` breaks the 44px hit-target rule, so keep it inside desktop toolbars only.
