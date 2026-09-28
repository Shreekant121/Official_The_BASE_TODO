A trend you read in one second. No axes, no gridlines, no tooltip chrome.

```jsx
<SparkBars data={[42, 68, 51, 90, 74, 33, 58]} activeIndex={3} labels={['M','T','W','T','F','S','S']} />
```

- Bars are glass; only the active one emits. That single highlight is the entire information hierarchy.
- 5–14 bars. Fewer reads as a broken chart, more needs a real chart component.
- If the user needs exact values, put a `MetricCard` beside it rather than labelling every bar.
