Modal decision. Heavy glass, blurred page behind.

```jsx
<Dialog
  open={open}
  title="Disconnect Google Tasks?"
  description="Your saved sets stay on this device. Syncing stops immediately."
  onClose={close}
  actions={<><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="solid" tone="rose">Disconnect</Button></>}
/>
```

- Arrives by condensing (grow + un-blur), never by sliding up. Sliding is for drawers.
- The page behind gets `blur(10px)` — that's what makes the dialog feel like glass over glass rather than a card on a scrim.
- Title asks the question; description states the consequence in one sentence. Buttons name the action ("Disconnect"), never "OK".
- Reserve for genuine decisions. Anything informational belongs in a `Toast` or `NotificationCard`.
