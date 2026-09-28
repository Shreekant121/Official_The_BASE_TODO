/**
 * The three task states, once.
 *
 * `StatusPills` renders them as the control; the task sheet's header restates
 * the current one as a single pill (UI-26). A second copy of this table is how
 * the header and the control under it start disagreeing about what `done`
 * looks like — so it lives here, in a file with no component in it, and both
 * read it.
 *
 * These are `StatusPill`'s own names rather than a second set of hues: `queued`
 * / `running` / `done`, so the ripple on `running` comes free — it is the one
 * state that is genuinely live, which is the whole of `StatusPill`'s
 * signalling rule.
 */
import type { StatusName } from '../../ui';
import type { TaskStatus } from '../../store/useStore';

export const STATUS_OPTIONS: { value: TaskStatus; label: string; status: StatusName }[] = [
  { value: 'needsAction', label: 'To Do',       status: 'queued'  },
  { value: 'in-progress', label: 'In Progress', status: 'running' },
  { value: 'completed',   label: 'Done',        status: 'done'    },
];
