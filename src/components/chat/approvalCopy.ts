/* What the front door says, shared by the card and the tray. Moved out of
   `pages/ChatPage.tsx`, unchanged, when it was split (BUILD-7). */
import type { IconName } from '../../ui';
import type { AtlasPendingApproval } from '../../lib/atlas/client';

/**
 * What each kind of front door says (BUILD-3).
 *
 * The card used to have two kinds, and both were things that cannot be taken
 * back, so "Cannot be undone" was printed on every one. A project or list
 * delete is held for its reach, not its permanence — it goes to the Trash and
 * Revert on the log fetches it back — and a card telling Shreekant otherwise
 * would be the kind of false alarm that teaches a thumb to tap through. So the
 * kicker, the verb and the footnote come from the kind. The material does not
 * change: it is still the amber card, because it is still a door.
 */
export function approvalCopy(
  kind: AtlasPendingApproval['kind'],
  count: number,
): { icon: IconName; actionIcon: IconName; kicker: string; title: string; action: string; footnote: string } {
  const many = count > 1;
  if (kind === 'mail') {
    return {
      icon: 'mail',
      actionIcon: 'send',
      kicker: 'Cannot be undone · needs your tap',
      title: 'Send this message',
      action: 'Send it',
      footnote: 'Sent mail cannot be unsent. It appears in the action log either way.',
    };
  }
  if (kind === 'delete') {
    return {
      icon: 'trash-2',
      actionIcon: 'trash-2',
      kicker: 'Goes to the Trash · needs your tap',
      title: many ? `Delete ${count} things, with everything in them` : 'Delete this, with everything in it',
      action: many ? 'Delete them' : 'Delete it',
      // The Trash-and-Revert sentence is already in the tool's own preview
      // above, so this says the other thing he needs: nothing has gone yet.
      footnote: many
        ? `Nothing is deleted until you tap, and then all ${count} go at once. It appears in the action log either way.`
        : 'Nothing is deleted until you tap. It appears in the action log either way.',
    };
  }
  return {
    icon: 'link-2',
    actionIcon: 'link-2',
    kicker: 'Cannot be undone · needs your tap',
    title: many ? `Publish ${count} public links` : 'Publish a public link',
    action: many ? 'Publish them' : 'Publish it',
    footnote: many
      ? `One tap publishes all ${count}. A link that has been out in the world cannot be called back. They appear in the action log either way.`
      : 'A link that has been out in the world cannot be called back. It appears in the action log either way.',
  };
}

/** One thing a batched front-door call would act on, as `shareTools.ts` previews it. */
interface ApprovalTarget {
  id: string;
  type: string;
  title: string;
  extent: string;
}

/**
 * The rows out of a preview's structured half (item 13D).
 *
 * Read defensively rather than cast: `previewData` came off the wire from a
 * tool on the laptop, an MCP server this app does not own could answer a
 * front-door call with any shape at all, and the sentence is always there as
 * the fallback. Anything that is not four strings is simply not a row, and the
 * card draws the paragraph instead of half a list.
 */
export function readApprovalTargets(previewData: unknown): ApprovalTarget[] {
  if (typeof previewData !== 'object' || previewData === null) return [];
  const raw = (previewData as { targets?: unknown }).targets;
  if (!Array.isArray(raw)) return [];

  return raw.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) return [];
    const { id, type, title, extent } = entry as Record<string, unknown>;
    if (typeof id !== 'string' || typeof type !== 'string' || typeof title !== 'string' || typeof extent !== 'string') return [];
    return [{ id, type, title, extent }];
  });
}
