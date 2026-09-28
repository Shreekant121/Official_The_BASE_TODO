⌘K over tasks and commands — the fastest path through the product for anyone who lives in it.

```jsx
<CommandPalette
  open={open}
  onClose={close}
  commands={[
    { label: 'Start focus session', icon: <Icon name="play" size={16} />, group: 'Session', shortcut: '⌘⏎' },
    { label: 'Draft the Q3 brief', icon: <Icon name="circle" size={16} />, group: 'Tasks' },
  ]}
/>
```

- Arrow keys move, Enter runs, Escape closes; hover syncs the selection so mouse and keyboard never disagree.
- `group` is both a visible category and a search key — typing "session" finds everything in it.
- Sits at 14vh from the top, not centred. A centred palette fights the page beneath it.
- Own the ⌘K/Ctrl-K binding at the app root, and never nest a palette inside a `Dialog`.
