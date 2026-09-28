/**
 * Score — the subject: which task, and what it still needs (UI-30).
 *
 * `screens/scoring.html:1000` states a task in three rows and puts the
 * `Instrument` beside them. All three moved out of the sticky header, because
 * they are the page's content rather than its chrome — you do not need the
 * task's title pinned while you scroll its own fields.
 *
 * **The title stopped being seated in a well.** UI-9 put it in one on the
 * argument that it is a field you type into. UI-26 already reversed that for
 * the task sheet — *"it is the subject, not a field, so it is bare
 * `--type-display` on the header; the well is now its focus state"* — and the
 * source does exactly the same here, at `--text-3xl`. This is that same call,
 * on the other screen that shows it.
 *
 * **The title wraps, and grows (FIX-5).** It was a single-line `<input>`, so a
 * long title scrolled sideways inside its own field and the one thing this
 * screen exists to judge was the one thing you could not read. It is a
 * `<textarea>` now, sized to its own text — no cap, no scrollbar. Everything
 * UI-30 settled above is untouched: bare, the well as its focus state,
 * `--type-display` at `--text-3xl`, hand-composed for the reason written
 * beside it. The one value that moved is the leading, because it is the one
 * that never applied before: `--type-display` carries `--leading-tight`
 * (1.03), which is a line-height for text that occupies one line — at 36px it
 * puts the second line's ascenders into the first line's descenders. Wrapped
 * lines are `--leading-snug`.
 *
 * **The project chip stopped wearing the project's colour.** UI-9 gave it a
 * tinted fill and a matching ring, reasoning that a project's hue is the
 * user's data and not the system's to choose. That reasoning survives; the
 * amount does not. UI-29 settled how much of the page a project's colour gets
 * on the board — *"rationed to a 4px dot and a hairline — never a card glow"*
 * — so it is a system-coloured `Chip` with the project's dot on it, which is
 * what the board draws two clicks away.
 *
 * The finished state is the source's, and it is not the same sentence as the
 * commit bar's: this row says *what is true of the task* ("Everything this
 * score needs is filled"), and the bar says *what you can do next*. The
 * emoji-free `check` kicker in `--accent` is the source's too — a task with
 * nothing outstanding is the one thing on this screen that is genuinely
 * settled, which is what `readme.md` lets emerald mean.
 *
 * **V3-5 moved the `Instrument` from beside the three rows to under them**, full
 * width and short — his call, 2026-09-24; `Instrument.tsx` says why. The title
 * gets the whole width back with it.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Chip, Icon, StatusPill } from '../../ui';
import { getBlockingTasks, getListTitle, useStore, type Task } from '../../store/useStore';
import NeedsPills from '../../components/task-fields/NeedsPills';
import { BlockedLine } from '../../components/project/parts';
import { countNeeds } from '../../components/task-fields/needs';
import { STATUS_OPTIONS } from '../../components/task-fields/taskStatusOptions';
import type { NeedId } from '../../components/task-fields/needs';
import type { TaskDraftController } from '../../components/task-fields/useTaskDraft';
import Instrument from './Instrument';
import type { ScoreReading } from '../../components/task-fields/scoreReadings';

interface SubjectProps {
  task: Task;
  controller: TaskDraftController;
  reading: ScoreReading;
  /** The highest score currently on screen. There is no ceiling to use instead. */
  peak: number;
  onJump: (id: NeedId) => void;
  /**
   * Item 19 — why this task cannot be marked Done, or absent. `taskLockReason`,
   * computed by the page so the strip above and the pill below agree with this.
   */
  lockReason?: string;
}

export default function Subject({ task, controller, reading, peak, onJump, lockReason }: SubjectProps) {
  const taskLists = useStore((s) => s.taskLists);
  const projects = useStore((s) => s.projects);
  const backlogTasks = useStore((s) => s.backlogTasks);
  const { draft, setField, missing } = controller;
  const [titleFocus, setTitleFocus] = useState(false);
  const titleField = useRef<HTMLTextAreaElement>(null);
  const titleWrap = useRef<HTMLDivElement>(null);
  const titleWidth = useRef(0);

  /* The field is exactly as tall as the text in it. A textarea has no CSS-only
     way to say that — the height has to be measured after the change, which is
     why it is reset to `auto` first: `scrollHeight` on an element already sized
     to its content reports that size and never shrinks back. The composer's
     recipe, without its cap. A draft past the cap scrolls because a chat box
     cannot eat the screen; a title has no such length, since being unable to
     read one is the whole of what this fixes. */
  const grow = useCallback(() => {
    const el = titleField.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  /* Before paint, for the changes this component makes itself: a keystroke, and
     the next task arriving in the same mounted field. */
  useLayoutEffect(grow, [grow, draft.title]);

  /* And an observer for the one it does not make — a narrower window, which
     rewraps the same text onto more lines. It watches the wrapper and acts only
     when the WIDTH changes: the wrapper's height is this field's own output, so
     regrowing on that would be the field measuring itself. */
  useLayoutEffect(() => {
    const el = titleWrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      if (w === titleWidth.current) return;
      titleWidth.current = w;
      grow();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [grow]);

  /* And the typeface arriving, which neither of the two above sees. Inter is
     `font-display: swap`, so a cold page lays the title out first in the
     system fallback — taller at this size (Segoe UI measures 45px to Inter's
     44) and wrapping a long title at a different word — and the field kept
     that first measurement for good: the page below it sat a pixel low, and a
     title that wraps onto one more line in Inter would lose that line under
     `overflow: hidden`. The screenshot harness caught it as the Score page
     landing a pixel apart between runs. */
  useEffect(() => {
    const fonts = document.fonts;
    if (!fonts) return;
    fonts.addEventListener('loadingdone', grow);
    void fonts.ready.then(grow);
    return () => fonts.removeEventListener('loadingdone', grow);
  }, [grow]);

  const list = draft.listId ? taskLists.find((l) => l.id === draft.listId) : undefined;
  const project = list?.projectId ? projects.find((p) => p.id === list.projectId) : undefined;
  const listTitle = list?.title ?? getListTitle(taskLists, task.listId, task.listName);
  const status = STATUS_OPTIONS.find((o) => o.value === draft.status);
  const outstanding = countNeeds(missing);
  /* What it is waiting on, whether or not that amounts to a lock: a task put
     into today with "Schedule anyway" is still waiting on something, and this
     row's job is to state what is true of the task. The LOCK is `lockReason`,
     and it is the pills in `TaskFieldGrid` that act on it. */
  const blocking = getBlockingTasks(backlogTasks, task);

  return (
    <div style={{ display: 'grid', gap: 'var(--sp-7)' }}>
      <div style={{ minWidth: 0, display: 'grid', gap: 'var(--sp-5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
          {project && (
            <>
              <Chip icon="folder" dot={project.color || undefined}>{project.name}</Chip>
              <span style={{ display: 'flex', color: 'var(--fg-4)' }}>
                <Icon name="chevron-right" size={14} />
              </span>
            </>
          )}
          {listTitle && <Chip icon="list">{listTitle}</Chip>}
          {status && <StatusPill status={status.status}>{status.label}</StatusPill>}
          {/*
            Right of the status, because it is the fact that explains why one
            of the three status pills below is refused. The board's component,
            not a fourth rendering of one sentence — and neutral for the
            reason it is neutral everywhere: *"a red box on a task you cannot
            start is noise you can't act on"*.

            It names only the first blocker with a `+n more`, exactly as every
            row does, and carries the whole list on its `title`. This is a
            wrapping chip row, not a paragraph.
          */}
          {blocking.length > 0 && (
            <BlockedLine
              on={blocking[0].title}
              extra={blocking.length - 1}
              title={lockReason ?? `Blocked by: ${blocking.map((t) => t.title).join(', ')}`}
            />
          )}
        </div>

        {/*
          Bare, with the well as its focus state — see the note at the top.
          Hand-composed rather than `<Input>` because Input's inner element
          hardcodes `--type-body`, and adding a font prop to a ported component
          for one call site would be a fourth departure in that file.
        */}
        <div
          ref={titleWrap}
          style={{
            display: 'flex', alignItems: 'center',
            /* A textarea's intrinsic width is its `cols` (20) at this font —
               ~387px at `--text-3xl`. Without this that became the column's
               minimum, which on a 390px phone pushed the page sideways and,
               when Inter landed and moved it, made the observer below report
               a loop (V3-5). */
            minWidth: 0,
            margin: 'calc(var(--sp-4) * -1) calc(var(--sp-5) * -1)',
            padding: 'var(--sp-4) var(--sp-5)',
            borderRadius: 'var(--r-control)',
            backgroundImage: titleFocus ? 'var(--glass-well)' : 'none',
            boxShadow: titleFocus
              ? 'var(--glass-well-shadow), 0 0 0 1px var(--accent-hairline), 0 0 20px -6px oklch(0.70 0.15 162 / 0.5)'
              : 'none',
            transition: 'box-shadow var(--dur-base) var(--ease-glass)',
          }}
        >
          <textarea
            ref={titleField}
            rows={1}
            data-ag-field=""
            className="ag-field"
            value={draft.title}
            /* A title is still one line of meaning even when it takes three to
               draw. Enter therefore finishes the field rather than adding a
               newline — which is what it did as an `<input>` — and a pasted
               paragraph folds to spaces instead of arriving with line breaks
               inside it that every other screen would render as one run-on. */
            onChange={(e) => setField('title', e.target.value.replace(/\s*\n+\s*/g, ' '))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
            onFocus={() => setTitleFocus(true)}
            onBlur={() => setTitleFocus(false)}
            placeholder="Task title…"
            aria-label="Task title"
            style={{
              flex: 1, minWidth: 0, display: 'block',
              border: 0, outline: 'none', boxShadow: 'none', background: 'transparent', padding: 0,
              /* The height is set by `grow`; the field never scrolls and never
                 offers a handle to drag one in a page that has its own. */
              resize: 'none', overflow: 'hidden',
              font: 'var(--type-display)',
              fontSize: 'var(--text-3xl)',
              lineHeight: 'var(--leading-snug)',
              letterSpacing: 'var(--tracking-display)',
              color: 'var(--fg-1)',
            }}
          />
        </div>

        {outstanding > 0 ? (
          /* `allSetLabel=""` because the finished state below is the source's
             own sentence, not a pill — this row only ever draws chips. */
          <NeedsPills missing={missing} onJump={onJump} allSetLabel="" />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
            <span
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-3)',
                font: 'var(--type-kicker)', letterSpacing: 'var(--tracking-kicker)',
                textTransform: 'var(--kicker-transform)' as CSSProperties['textTransform'],
                color: 'var(--accent)', whiteSpace: 'nowrap',
              }}
            >
              <Icon name="check" size={13} />
              Complete
            </span>
            <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)' }}>
              Everything this score needs is filled.
            </span>
          </div>
        )}
      </div>

      {/* The conductivity floor names the task it came from, which needs the
          backlog to turn an id into a title. This screen has it; the task
          panel does the same. */}
      <Instrument
        reading={reading}
        peak={peak}
        floorTitle={
          reading.floor
            ? backlogTasks.find((t) => t.id === reading.floor!.fromId)?.title
            : undefined
        }
      />
    </div>
  );
}
