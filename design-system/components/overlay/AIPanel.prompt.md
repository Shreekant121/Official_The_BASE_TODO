# AIPanel

**A short exchange about one object, docked to the screen that object lives on.**

Reach for it when the user needs the AI *on a thing they are looking at* — a
task row, a list header, a project header, the Score screen. Do not reach for
it when the conversation has no single subject: that is the Atlas chat screen,
and it is a different surface with a different scale.

## The three laws

1. **It docks, it never covers.** `dock="bottom"` takes the lower half of a
   narrow screen; `dock="right"` takes a 404px column on a wide one. In both
   cases the *host grid shrinks* — put the panel in a grid track, never in a
   fixed overlay on top of its own subject. The panel fills the track it is
   given (`height: 100%`), so the **host** owns the split:
   `grid-template-rows: minmax(0,1fr) 56%` for a bottom dock,
   `grid-template-columns: minmax(0,1fr) auto` for a right one. An `auto` row
   collapses the panel to its content — never use one. A panel that hides the
   card it is discussing has failed.
2. **It names its subject.** `subject.kicker` is the object's address,
   `subject.title` its name. There is no valid state of this component without
   one.
3. **It states what it did.** Past tense, no persona, no first person, no
   "I'd be happy to". A tool call is a `did` item — the chat screen's tool-result
   pattern, compacted. Never narrate a tool call in prose.

## Choosing an item kind

| Kind | Use it for |
| --- | --- |
| `you` | The user's turn. |
| `ai` | Its turn. Add `chips` **only** when it asked a question with short answers. |
| `did` | A completed tool call. Add `undo: true` + `applied` when the change is reversible — that is the applied state, and the way back rides on the change itself. |
| `approve` | Anything irreversible. `hard: true` adds the amber tint, the amber glow, the cost line and the frost affirmative. Nothing destructive happens without one tap. |
| `filled` | A field the answer filled. Score screen only — it is the proof the exchange did something. |

`working` is the in-flight state: one pill, one label, the tool named. It is
never a log and never a list of steps.

## Rules that keep it on-system

- **Quieter than the chat screen.** No markdown, no avatars, no history list,
  no copy/retry/thumbs row. Level-2 glass, `--text-sm` body.
- **44px minimum** on every control — handle, close, chips, prompts, send.
  This is used with a thumb.
- **One gesture out**: the drag handle, the ✕, or Escape (wired internally).
- **Emerald stays rationed.** The only accent in the panel is the working
  pulse, the send button once the field has text, and a `filled` row. Never
  tint the panel itself.
- **Do not mark the subject with emerald** in the host. Use a brighter rim
  (`--glass-rim-3` plus a `--line-strong` hairline) — emerald means *live*.

## Example

```jsx
<AIPanel
  dock="bottom"
  subject={{ kicker: 'Task · Operations', title: 'File the incorporation paperwork', meta: '90 min · 1d left' }}
  items={[
    { kind: 'you', text: 'Break this into steps.' },
    { kind: 'did', tool: 'create_subtasks', count: '3 added', undo: true,
      applied: 'Added to the task. Estimate unchanged.',
      rows: [{ label: 'Upload INC-32', meta: '25 min' }] },
    { kind: 'ai', text: 'Fifty of the ninety minutes are now accounted for.' },
  ]}
  onSend={send}
  onClose={close}
/>
```

Specimen: `screens/ai-panel.html` — all four openers and all five states, at
820×1180 and 1440×900.
