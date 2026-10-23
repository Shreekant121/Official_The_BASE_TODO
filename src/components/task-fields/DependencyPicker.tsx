/**
 * D2 — "Depends on…". Soft, warning-only prerequisites (UI-13).
 *
 * The picker never offers an option that would close a dependency loop, so
 * A→B→A cannot be built in the first place. That guard, and the fact that it
 * considers the in-progress unsaved list, are unchanged.
 *
 * **An incomplete prerequisite is a grey warning, not coral** (amber until
 * 29-1P2c2, when warnings went quiet). The old chips were red,
 * which in this design system is `--status-overrun` — a live problem, the hue
 * the app spends on a session running over its allocation. A prerequisite that
 * is not done yet is nothing of the sort: it is a soft warning only, never
 * hidden or reordered. Its `circle-alert` glyph says so; the chip is `review`.
 *
 * A SEARCHABLE DROPDOWN — THE LIST IS STILL THERE, TYPING NARROWS IT (item 1)
 * --------------------------------------------------------------------------
 * The trigger used to be a `CustomDropdown` over every top-level task in the
 * app and item 1 replaced it with a search field whose results only appeared
 * once you typed. **Shreekant overruled the second half of that**, and he is
 * right: the list is how you find out what is there. You cannot search for a
 * task whose name you half-remember, and a field that answers a click with a
 * sentence has hidden the thing you opened it for. So:
 *
 * - **Clicking the field opens the full list**, exactly as the dropdown did,
 *   in the same `PortalDropdown` popover at the same `min(50vh, 320px)` cap.
 *   No result limit — the scroller is the limit, which is what it was before.
 * - **Typing filters it, on title + project + list.** The row already shows
 *   all three (`dependencyLabel`), so any of the three is a reasonable thing
 *   to type. Terms are ANDed: "empire ops" narrows rather than widens.
 * - **The count rides in the field's `suffix`** while you are typing — the
 *   same readout New Session's search gives, and the reason nothing below the
 *   field has to say it in words.
 * - **The popover stays open after a pick**, because this field takes several
 *   prerequisites and the old flow made you reopen the list for each one.
 *   Escape or a click outside closes it (`PortalDropdown`'s own handling).
 * - **The `+` button is gone.** It existed to commit the dropdown's pending
 *   value; a row commits itself now. It was also the control that ended up
 *   outside the sheet, which is how item 1 found its way here.
 * - Enter takes the top row, so the field is usable without a mouse.
 *
 * **The cycle guard is untouched** — the same `wouldCreateDependencyCycle`
 * against the same in-progress unsaved list, applied to the candidates before
 * they are filtered, so an option that would close a loop is never in the list
 * to be typed into view.
 *
 * WHY THE RESULTS ARE PORTALLED AND NOT DRAWN IN THE FLOW. A list this long
 * rendered inline would push the six fields under it down the column every
 * time the box is clicked, inside the sheet's own scroller. It also could not
 * be drawn at all: the sheet panel carries `container-type: inline-size`, which
 * makes it the containing block for its `fixed` descendants and clips them —
 * that is the whole reason `PortalDropdown` exists, and every other picker in
 * this sheet already goes through it.
 *
 * **No captions under it since OPT-5's follow-up**, his call: "Type a name,
 * project or list to narrow it" and the "A soft warning only…" paragraph
 * are gone. Only the empty-list sentence is left, because without it a task
 * with nothing to depend on would show a bare label.
 *
 * The field is an `Input` at the same `md` height, the same `--glass-well`
 * trough and the same `--r-control` radius as the pickers beside it: not a new
 * kind of control, just the one next to it with a magnifier in it.
 */
import { useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useStore, wouldCreateDependencyCycle } from '../../store/useStore';
import { Icon, Input, LitLine, litSafe, MetaKicker } from '../../ui';
import { PickerEmpty, PickerList, PickerOption } from '../pickers';
import { PortalDropdown } from '../PortalDropdown';
import FieldChip from './FieldChip';

const CAPTION: React.CSSProperties = {
  font: 'var(--type-caption)',
  color: 'var(--fg-3)',
  textWrap: 'pretty',
};

interface DependencyPickerProps {
  /** The task being edited — excluded from its own options and used for the cycle guard. */
  taskId: string;
  value: string[];
  onChange: (dependsOn: string[]) => void;
}

export default function DependencyPicker({ taskId, value, onChange }: DependencyPickerProps) {
  const { backlogTasks, taskLists, projects } = useStore();
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  /* The popover anchors off the whole trough, not the bare `<input>`: it is
     the trough that is the control's visible width, and `PortalDropdown`
     measures its trigger both to size itself and to decide whether a click
     landed outside. Anchored to the input, a click on the magnifier or on the
     match count would read as outside and close the list. */
  const triggerRef = useRef<HTMLDivElement>(null);

  const dependencyLabel = (id: string) => {
    const dep = backlogTasks.find((t) => t.id === id);
    if (!dep) return 'Unknown task';
    const list = taskLists.find((l) => l.id === dep.listId);
    const owningProject = projects.find((p) => p.id === list?.projectId);
    const context = [owningProject?.name, list?.title].filter(Boolean).join(' · ');
    return context ? `${dep.title} — ${context}` : dep.title;
  };

  // Consider the in-progress (unsaved) prerequisites when guarding against
  // cycles, so a chain built during this session is respected too.
  const tasksForCycleCheck = backlogTasks.map((t) => (t.id === taskId ? { ...t, dependsOn: value } : t));
  const candidates = backlogTasks
    .filter((t) =>
      !t.parent &&
      t.id !== taskId &&
      !value.includes(t.id) &&
      !wouldCreateDependencyCycle(tasksForCycleCheck, taskId, t.id)
    )
    .map((t) => {
      const list = taskLists.find((l) => l.id === t.listId);
      const owningProject = projects.find((p) => p.id === list?.projectId);
      return {
        id: t.id,
        label: dependencyLabel(t.id),
        // What the query is matched against: the same three facts the row
        // shows. Joined rather than searched separately so "empire ops" can
        // cross from the project's name into its list's.
        haystack: [t.title, owningProject?.name, list?.title].filter(Boolean).join(' ').toLowerCase(),
      };
    });

  // Every whitespace-separated term must appear somewhere, in any order. No
  // terms means no filter — the whole list, which is the point. Not memoised:
  // this walks the backlog, which is the same list the chips above already
  // walk once per render.
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = terms.length === 0
    ? candidates
    : candidates.filter((c) => terms.every((t) => c.haystack.includes(t)));

  const add = (id: string) => {
    onChange([...value, id]);
    // Cleared so the next prerequisite starts from the full list again, and
    // the popover is deliberately left open — this field takes several.
    setQuery('');
  };

  return (
    <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
      {value.length > 0 && (
        <div className="flex flex-wrap" style={{ gap: 'var(--sp-3)' }}>
          <AnimatePresence>
            {value.map((id) => {
              const dep = backlogTasks.find((t) => t.id === id);
              const done = dep?.status === 'completed';
              return (
                <FieldChip
                  key={id}
                  tone={done ? 'done' : 'review'}
                  icon={<Icon name={done ? 'check-circle-2' : 'circle-alert'} size={12} />}
                  title={done ? 'Prerequisite completed' : 'Prerequisite still incomplete'}
                  onRemove={() => onChange(value.filter((d) => d !== id))}
                  removeLabel={`Remove prerequisite ${dependencyLabel(id)}`}
                >
                  {dependencyLabel(id)}
                </FieldChip>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {candidates.length > 0 ? (
        <>
          <div ref={triggerRef}>
            <Input
              type="search"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setIsOpen(true); }}
              onFocus={() => setIsOpen(true)}
              onClick={() => setIsOpen(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && shown.length > 0) {
                  e.preventDefault();
                  add(shown[0].id);
                }
              }}
              role="combobox"
              aria-expanded={isOpen}
              aria-label="Search for a prerequisite task"
              placeholder="Search tasks…"
              iconLeft={<Icon name="search" size={16} />}
              /* How many survived — the app's own answer to that question, and
                 the same one New Session's search field gives. Only while
                 filtering: with an empty box the list is simply all of them. */
              suffix={terms.length > 0 ? <MetaKicker tone="var(--fg-4)">{shown.length} match</MetaKicker> : undefined}
            />
          </div>

          <PortalDropdown isOpen={isOpen} onClose={() => setIsOpen(false)} onOpen={() => setIsOpen(true)} triggerRef={triggerRef}>
            {/* `min(…)` rather than a flat 280px, for the reason every other
                picker in the app gives: this panel is portalled to the
                viewport, and a fixed pixel cap on a tablet in landscape is
                either most of the window or a sliver of it depending on
                nothing. */}
            <PickerList maxHeight="min(50vh, 320px)">
              {shown.length > 0 ? (
                shown.map((c) => (
                  /* No `selected`: none of these is the current value, they
                     are things you may add. See `PickerOption`. */
                  <PickerOption key={c.id} onClick={() => add(c.id)}>
                    {c.label}
                  </PickerOption>
                ))
              ) : (
                <PickerEmpty>{query.trim() === '' ? 'No task matches that.' : `No task matches **“${litSafe(query.trim())}”**.`}</PickerEmpty>
              )}
            </PickerList>
          </PortalDropdown>
        </>
      ) : (
        <LitLine
          as="p"
          text={value.length > 0
            ? 'No other tasks available to add as prerequisites.'
            : '**No other tasks** to wait on yet.'}
          style={CAPTION}
        />
      )}
    </div>
  );
}
