The house dropdown. The trigger *becomes* the menu — it does not open one nearby.

```jsx
<MorphMenu
  align="end"
  width={292}
  trigger={<IconButton label="Actions for Studio Launch" variant="ghost"><Icon name="ellipsis" size={18} /></IconButton>}
  header={{ title: 'Studio Launch', meta: '2 lists · 3 tasks · ₹1.8L' }}
  items={[
    { label: 'Edit project', icon: <Icon name="square-pen" size={18} />, meta: <Icon name="chevron-right" size={16} /> },
    { label: 'Share project', icon: <Icon name="share-2" size={18} />, meta: <Icon name="chevron-right" size={16} /> },
    { divider: true },
    {
      label: 'Delete project', icon: <Icon name="trash-2" size={18} />, tone: 'danger',
      confirm: { label: 'Delete Studio Launch?', hint: '2 lists and 3 tasks go with it.' },
    },
  ]}
/>
```

- **The panel is near-opaque, not card glass.** A menu sits on top of the content it acts on; at card translucency the two texts overlap and neither is readable. Keep the base coat.
- **Three or four rows.** A context menu is not a settings page — anything deeper belongs inside the object. Rows are 48px so a thumb can hit them.
- **No key hints.** This product is used on Windows and Android; ⌘ glyphs are wrong and Ctrl hints on every row are noise.

- Three things animate together: `transform` scale from 0.86, `border-radius` from pill to card, and a blur clearing. Remove any one and the morph illusion collapses into a normal popover. The trigger itself dims to 0.5 and scales to 0.92 as the panel takes over, so the eye reads one object rather than two.
- `transformOrigin` must match `align` — the panel has to grow *from* the trigger's corner. This is handled for you; don't override it.
- **Pass a `header` on any card menu.** A menu that covers the thing it acts on leaves the user choosing "Delete" against no subject. The header restates the name and the counts that make the decision.
- **Group past four items** with `section` labels — but first ask whether the menu should be that long at all.
- `meta` takes a value (`₹1.6L`) or a `chevron-right` for a row that opens something further. `shortcut` exists for desktop-only surfaces; this product does not use it.
- **Destructive items take `confirm`, never a dialog.** The row collapses and the confirm strip grows in its exact slot, so the morph stays inside one object. Name the project in `confirm.label` and say what is lost in `confirm.hint`. Escape disarms before it closes.
- `flash` is for actions that report rather than navigate — copy, sync, duplicate. The menu stays open and the row says what happened for 1.4s.
- Keyboard: arrows walk the rows, Home/End jump, Escape backs out one level. First row takes focus 90ms after open, with `preventScroll` so the page never jumps.
- The panel flips above the trigger when there is no room below, and re-measures when a `confirm` arms (which makes it taller).
- **The card must lift, not the panel.** `backdrop-filter` makes every glass card its own stacking context, so a panel's own `z-index` is trapped inside it and later sibling cards paint over it. Drive `open` from the card and set `zIndex` on the card while its menu is open.
- Items stagger in at 18ms each. Keep menus to ~7 rows so the last one isn't visibly late.
- Closes on outside pointerdown and Escape. Hover tints the icon emerald, which is the only accent in the menu; danger rows tint rose instead.
- In a grid of cards, drive `open`/`onOpenChange` from the parent so only one menu is open at a time.
