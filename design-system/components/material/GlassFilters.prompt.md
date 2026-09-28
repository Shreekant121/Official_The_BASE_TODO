Hidden SVG filter defs that enable true refraction on glass surfaces — mount one per document, as high in the tree as possible.

```jsx
<div className="ag-page">
  <GlassFilters />
  <GlassSurface refract level={2}>…</GlassSurface>
</div>
```

Renders nothing visible and takes no props. Without it, `refract` on `GlassSurface` degrades to a plain blur — no error, just less depth. Chrome and Edge honour it; Safari and Firefox fall back.
