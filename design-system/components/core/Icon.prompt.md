String-addressed Lucide glyph, for prototypes and specimen cards. Application code should import from `lucide-react` directly.

```jsx
<Icon name="clock" size={18} />
<Icon name="circle-check" size={20} />
```

- Requires the Lucide UMD build on the page (`window.lucide`). In the real app, use `import { Clock } from 'lucide-react'` and pass `<Clock size={18} />` as a node.
- House stroke is **1.5**. The references are all hairline icons; 2.0 immediately makes the UI look heavier and cheaper.
- Sizes step 16 / 18 / 20 / 24. Match the icon box to the type size beside it, never larger.
- Lucide glyphs are outline-only. Never fill one, and never mix a filled icon set into the same view.
