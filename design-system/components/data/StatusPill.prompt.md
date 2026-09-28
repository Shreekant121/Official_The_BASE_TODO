Task state as tinted glass. Hue + word + dot — never hue alone, so the state survives colour-blindness and greyscale.

```jsx
<StatusPill status="running">In session</StatusPill>
<StatusPill status="overrun" size="sm" />
```

- Only `running` and `overrun` ripple. If everything pulses, nothing is urgent.
- The label is uppercase mono — it is a machine readout, not prose.
- Don't invent statuses. The seven map to the product's real vocabulary; a new one needs a new token.
