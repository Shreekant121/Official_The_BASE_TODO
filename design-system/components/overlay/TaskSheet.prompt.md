The whole of one task, on one sheet. Opened by pressing a task card.

```jsx
const [sheet, setSheet] = React.useState(null);

<TaskCard t={t} onOpen={(t) => setSheet(toSheet(t))} />

{sheet && (
  <TaskSheet
    task={sheet}
    lists={LIST_NAMES}
    shareLists={['⚡ Action Steps', '🧊 Backburner', '📚 Reference Materials']}
    prereqs={ALL.map((x) => x.title)}
    onClose={() => setSheet(null)}
    onSave={(next) => { save(next); setSheet(null); }}
    onDelete={(t) => { remove(t.id); setSheet(null); }}
  />
)}
```

- **Wide, not tall.** 1240px, three columns — *what decides the score* ·
  *the work* · *timing and context*. A 480px column of fifteen stacked
  sections is the thing this component exists to replace: it put the
  score four scrolls from the title. Falls to two columns under 1260px
  and one under 880px.
- **Nothing derivable is asked for.** The score, the Deadline factor and
  the outstanding-field count are computed. Never add an input for a
  number the product can work out.
- **Needs chips jump.** Every missing required field appears as an amber
  chip in the header; pressing one focuses that field and rings it amber
  for a beat. The footer restates the count, never a red banner.
- **Wells for data, fills for actions.** Every input is a carved well;
  the only surfaces that come out are the buttons and the pane headers.
- **Deleting confirms in the footer's own slot** — the trash icon grows a
  rose strip in place. Never a second dialog over the sheet: it would
  cover the subject and break the morph law.
- **Repeat edits in place** too, in the field's own slot, weekday circles
  and all.
- Pass `now` a fixed ISO string in mocks and specimen cards, or the
  deadline copy drifts every day.
- Needs `.ag-field` / `.ag-scroll` rules on the host page (placeholder
  colour, date-picker glyph, hidden scrollbars) — copy them from
  `screens/project.html`.
- Do NOT reach for `Dialog` for this. Dialog is for a decision with one
  or two fields; anything with a subject this large is a sheet.
