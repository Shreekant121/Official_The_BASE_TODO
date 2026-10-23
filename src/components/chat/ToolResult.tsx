/**
 * What a read came back with, drawn as rows of type (item 13G).
 *
 * `design-system/screens/atlas.html`'s `TaskLine` and `ToolResult`, and the
 * mockup's comment on the first of them is the whole specification:
 * *"Title, status, deadline, project. Nothing else exists to show."* Its
 * second sentence is the one that matters more — **no ids, ever**. A row
 * carrying `t-8f21…` teaches Shreekant to read machine handles in a
 * conversation, and there is nothing he can do with one.
 *
 * WHY THIS IS NOT `TaskRow`
 * -------------------------
 * The app has a `TaskRow` and this screen used it until now. It is the right
 * component in a list *of tasks*, where a row is the subject of the page and
 * carries a surface of its own; forty-eight of them inside a sentence in a
 * conversation is forty-eight cards stacked in a column that is supposed to
 * read as prose. The mockup answers that by dropping the surface entirely: a
 * hairline between rows, type on the page, and the only glass is the lift
 * that arrives under the pointer. That lift is **motion 3 of 4** — box-shadow
 * on `--dur-base` and nothing else moves — and it lives in `.tr:hover` in
 * `ui/screens.css` rather than in React state, because a row that re-renders
 * on mouseenter is forty-eight re-renders for a shadow.
 *
 * SIX ROWS, THEN THE REST MORPHS OPEN
 * -----------------------------------
 * **Motion 1 of 4.** `max-height 0→320`, `scaleY(.94)→1`, `blur(6px)→0`,
 * radius `--r-pill`→`--r-sm`, origin `top center`; the first four on
 * `--dur-morph`/`--ease-morph`, the last two on `--dur-base`/`--ease-glass`.
 * The radius is the part that is easy to read as decoration and is not: the
 * closed block is a pill because it is *the button's* shape, and it becomes a
 * panel as it opens. That is the house rule in `tokens/motion.css` —
 * *"everything that appears, appears by morphing out of the thing that
 * triggered it"*.
 *
 * The cap is a real 320px scroller rather than an uncapped list, because "show
 * all" on a 48-task answer is otherwise a page and a half of rows between the
 * sentence and the next thing Atlas said.
 */
import { useState, type CSSProperties } from 'react';
import { Icon } from '../../ui';
import type { AgentTaskRow } from '../../lib/agent/toolChip';

/** The mockup's status dot, at the four states `describeTaskRows` produces. */
const DOT: Record<AgentTaskRow['status'], string> = {
  running: 'var(--status-running)',
  queued: 'var(--status-queued)',
  done: 'var(--job-lime)',
  overrun: 'var(--status-overrun)',
};

export function TaskLine({ row }: { row: AgentTaskRow }) {
  return (
    <div className="tr" tabIndex={0}>
      <span className="tr-title">{row.title}</span>
      <span className="tr-meta">
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
          <span
            aria-hidden="true"
            style={{
              width: 6, height: 6, borderRadius: '50%', flex: '0 0 auto',
              background: DOT[row.status],
              /* The mockup emits from the running dot only, which is
                 `readme.md`'s ration — live, selected, running or overrun —
                 read the strict way. An overrun row already says it in
                 `--status-overrun` on the label beside it. */
              boxShadow: row.status === 'running' ? `0 0 8px ${DOT.running}` : 'none',
            }}
          />
          <span style={{ color: row.status === 'overrun' ? 'var(--status-overrun)' : 'var(--fg-3)' }}>
            {row.statusLabel}
          </span>
        </span>
        {/* An em dash rather than an empty cell: the column means "when", and
            a task with no deadline has an answer to that question. */}
        <span className="tr-due">{row.due ?? '—'}</span>
        {/* Always drawn, never conditionally: `.tr-meta` is right-aligned, so
            a row that omits this cell pulls its deadline and status out of
            line with the rows around it. `where` falls back to the list for
            exactly that reason — see `AgentTaskRow`. */}
        <span className="tr-proj">{row.where}</span>
      </span>
    </div>
  );
}

export function ToolResult({
  name,
  count,
  rows,
}: {
  /** The tool that produced them, printed as the mockup's kicker. */
  name: string;
  /** How many the call actually found, which is not always how many came back. */
  count: number;
  rows: AgentTaskRow[];
}) {
  const [open, setOpen] = useState(false);
  const shown = rows.slice(0, 6);
  const rest = rows.slice(6);

  return (
    <div style={{ display: 'grid', gap: 'var(--sp-4)', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-3)', color: 'var(--fg-3)' }}>
          <Icon name="list-checks" size={14} />
          <span className="ag-kicker" style={{ color: 'var(--fg-3)' }}>{name}</span>
        </span>
        <span className="ag-kicker" style={{ color: 'var(--fg-4)' }}>{count} found</span>
      </div>

      <div style={{ display: 'grid', minWidth: 0, borderTop: '1px solid var(--line-faint)' }}>
        {shown.map((row) => (
          <div key={row.id} style={{ borderBottom: '1px solid var(--line-faint)', minWidth: 0 }}>
            <TaskLine row={row} />
          </div>
        ))}
      </div>

      {rest.length > 0 && (
        <>
          <div
            className="ag-scroll ag-fade"
            style={{
              display: 'grid', minWidth: 0, overflowY: 'auto', overscrollBehavior: 'contain',
              maxHeight: open ? 320 : 0,
              opacity: open ? 1 : 0,
              transform: open ? 'scaleY(1)' : 'scaleY(0.94)',
              filter: open ? 'blur(0)' : 'blur(6px)',
              borderRadius: open ? 'var(--r-sm)' : 'var(--r-pill)',
              transformOrigin: 'top center',
              pointerEvents: open ? 'auto' : 'none',
              transition:
                'max-height var(--dur-morph) var(--ease-morph),' +
                ' transform var(--dur-morph) var(--ease-morph),' +
                ' border-radius var(--dur-morph) var(--ease-morph),' +
                ' opacity var(--dur-base) var(--ease-glass),' +
                ' filter var(--dur-base) var(--ease-glass)',
            }}
          >
            {rest.map((row) => (
              <div key={row.id} style={{ borderBottom: '1px solid var(--line-faint)', minWidth: 0 }}>
                <TaskLine row={row} />
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            style={{
              justifySelf: 'start', display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-3)',
              border: 0, background: 'transparent', padding: 'var(--sp-2) 0', cursor: 'pointer',
              font: 'var(--type-kicker)', letterSpacing: 'var(--tracking-kicker)',
              /* Capitals outside a V3 scope, sentence case inside (V3-8). */
              textTransform: 'var(--kicker-transform)' as CSSProperties['textTransform'], color: 'var(--fg-3)',
            }}
          >
            {open ? 'Show fewer' : `Show all ${rows.length}`}
            <span
              aria-hidden="true"
              style={{
                display: 'flex',
                transform: open ? 'rotate(180deg)' : 'none',
                transition: 'transform var(--dur-base) var(--ease-morph)',
              }}
            >
              <Icon name="chevron-down" size={13} />
            </span>
          </button>
        </>
      )}
    </div>
  );
}
