The single glass material primitive — reach for this before writing any custom translucent panel.

```jsx
<GlassSurface level={2} radius="var(--r-card)" inset="var(--pad-card)">
  <h3>Weekly burn</h3>
  <p>Down 12% since Monday.</p>
</GlassSurface>
```

- `level` 1 / 2 / 3 maps to thin chip, standard card, heavy sheet. Pick by how far the surface floats above the page, not by size.
- `tint` pulls an accent hue through the pane (`accent` = emerald, plus `cyan`, `violet`, `amber`, `rose` for status only); `tint="frost"` is the near-opaque white pane that carries dark text.
- `glow` is for objects that are emitting — live, recording, selected, over budget. A resting card never glows.
- `refract` upgrades the backdrop from blur to real displacement. Mount `<GlassFilters />` once in the document first.
- Nest sparingly: a glass chip inside a glass card samples the card, not the page, so keep the inner `level` at 1.
