Loading placeholder that still looks like this product.

```jsx
<Skeleton width="60%" />
<Skeleton width={120} height={120} radius="var(--r-card)" />
```

- Mirror the real content's shape and count — three rows of text means three skeletons at varying widths (60% / 85% / 40%), not one grey block.
- Never animate a skeleton and a spinner on the same surface.
- For a known-short wait (under ~300ms), show nothing at all. A flash of skeleton is worse than a beat of stillness.
