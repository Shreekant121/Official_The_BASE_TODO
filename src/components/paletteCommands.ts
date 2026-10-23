/**
 * The palette's commands, without what they do.
 *
 * Two readers: `CommandPaletteHost` searches them and attaches each one's
 * `run`, and the shortcut sheet (BUILD-10) offers them as what a key of his
 * own can do. One list, so a command added to the palette is bindable the
 * moment it exists, and a key of his can never point at something the
 * palette would not do.
 */
import type { IconName } from '../ui';
import { NAV_ENTRIES } from './navModel';

export interface PaletteCommandMeta {
  id: string;
  name: string;
  detail?: string;
  keywords: string;
  icon: IconName;
  group: string;
}

/** `owner` is whether Admin exists for this account; for anyone else it is not a command. */
export function paletteCommandCatalog(owner: boolean): PaletteCommandMeta[] {
  const list: PaletteCommandMeta[] = [
    {
      id: 'smart-start', name: 'Smart Start', detail: 'Start a focus session from your top tasks',
      keywords: 'start focus session begin work timer queue', icon: 'zap', group: 'Command',
    },
    {
      id: 'new-session', name: 'New session', detail: "Pick today's tasks yourself",
      keywords: 'start focus session select choose tasks today', icon: 'list-checks', group: 'Command',
    },
    { id: 'new-project', name: 'New project', keywords: 'create add make project', icon: 'plus', group: 'Command' },
    {
      id: 'new-event', name: 'New event', detail: 'A date to count down to: a trip, a birthday, a race',
      keywords: 'create add make event countdown date birthday trip calendar', icon: 'calendar-plus', group: 'Command',
    },
  ];
  for (const entry of NAV_ENTRIES) {
    if (!entry.built || entry.value === 'session') continue;
    if (entry.value === 'admin' && !owner) continue;
    list.push({
      id: `go-${entry.value}`,
      name: entry.value === 'dock' ? 'Dock mode' : `Go to ${entry.label}`,
      keywords: `go open show ${entry.label} ${entry.short ?? ''}`,
      icon: entry.icon,
      group: 'Go to',
    });
  }
  list.push({ id: 'shortcuts', name: 'Keyboard shortcuts', keywords: 'help keys hotkeys keyboard', icon: 'keyboard', group: 'Command' });
  return list;
}
