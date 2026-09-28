Voice capture, visualised. Purely CSS-driven — no JS animation loop, no audio analysis required.

```jsx
<Waveform active={listening} bars={28} />
```

- The bar envelope peaks in the middle, so it reads as a voice rather than an equaliser.
- `active={false}` collapses to a 3px line — that's the idle state; don't unmount the component.
- Pair with a `lg` `IconButton` holding a mic glyph, and let the button glow while listening.
- If you have real audio levels, drive the `height` of each bar directly and drop the keyframe animation.
