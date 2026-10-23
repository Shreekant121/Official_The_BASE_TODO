/**
 * **Ignore** (BIG-3): the one menu item that turns a task, a list or a project
 * into ignored work — and back.
 *
 * One hook for every menu that offers it (a task row on the board, a list
 * column, a project's card and its board header), like `startNowMenu.tsx`, so
 * none of them can grow its own idea of what the switch does or says.
 *
 * Three states, and the third is why it is a hook rather than a boolean:
 * - **not ignored** — "Ignore score & deadline", arming in place with what it
 *   does, because it also takes the work out of today's queue (his call,
 *   2026-09-29) and that should not happen on one stray tap;
 * - **ignored by its own switch** — "Stop ignoring", straight away: turning it
 *   off only ever gives the score back;
 * - **ignored by something above it** — his call: nothing inside an ignored
 *   project can opt back in, so the row names the switch that holds it and
 *   does nothing else. It flashes where to go rather than pretending to act.
 */
import { Icon, type MorphMenuItem } from '../../ui';
import { useStore, type IgnoreTarget } from '../../store/useStore';
import { usePriorityScores } from '../../store/usePriorityScores';
import { isOwnSwitch, type IgnoreSource } from '../../lib/ignoredWork';

const WHAT_IT_DOES =
  'Never scored, never offered by Smart Start or Needs Attention, and its deadline is never pushed. It stays on its board, and leaves today’s queue.';

function holderName(reason: IgnoreSource): string {
  if (reason.kind === 'project') return reason.project.name;
  if (reason.kind === 'list') return reason.list.title;
  return '';
}

/**
 * `listId` is the task's own list, for a task target — what is above it is that
 * list's answer. Unused for a list or a project.
 */
export function useIgnoreItems(target: IgnoreTarget, name: string, listId?: string): MorphMenuItem[] {
  const setIgnored = useStore((s) => s.setIgnored);
  const work = usePriorityScores().ignored;

  const held =
    target.kind === 'project'
      ? work.projectReason(target.id)
      : target.kind === 'list'
        ? work.listReason(target.id)
        : work.reasonOf({ id: target.id, listId });

  if (held && !isOwnSwitch(held, target)) {
    const holder = holderName(held);
    return [{
      value: 'ignored-above',
      label: `Ignored with “${holder}”`,
      icon: <Icon name="moon" size={18} />,
      flash: `Switch it off on “${holder}”`,
      flashIcon: <Icon name="info" size={18} />,
      onSelect: () => {},
    }];
  }

  if (held) {
    return [{
      value: 'unignore',
      label: 'Stop ignoring',
      icon: <Icon name="activity" size={18} />,
      onSelect: () => setIgnored(target, false),
    }];
  }

  return [{
    value: 'ignore',
    label: 'Ignore score & deadline',
    icon: <Icon name="moon" size={18} />,
    confirm: {
      label: `Ignore ${name}?`,
      hint: target.kind === 'task' ? WHAT_IT_DOES : `Everything inside it, too. ${WHAT_IT_DOES}`,
      action: 'Ignore',
      onConfirm: () => setIgnored(target, true),
    },
  }];
}
