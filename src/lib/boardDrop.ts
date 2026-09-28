/**
 * Where a dragged row lands on a board of several lists.
 *
 * `components/SortableList.tsx` owns the gesture; this owns the arithmetic —
 * given the row that was picked up, the thing it was released over and where
 * the two sit vertically, which of the three possible writes should happen.
 * Pure and DOM-free on purpose: the *interesting* half of a cross-list drag is
 * an off-by-one about insertion points, and that half is unreachable by the
 * screenshot harness (a drop is not a still picture) and awkward to reach by
 * hand (six lists × before/after/end).
 *
 * A "container" here is one list, an "item" one task row.
 */

/**
 * Separator between a container id and an item id in a dnd-kit sortable id.
 *
 * The board needs a *scoped* id per row rather than the task's own, because a
 * task shared into a second list ("hive mind", `Task.sharedListIds`) renders a
 * row in both — and two draggables with the same id inside one `DndContext`
 * quietly collide, leaving one of the two rows undraggable. Ids in this app are
 * `crypto.randomUUID()` values and the three fixed list slugs
 * (`action-steps`, `backburner`, `reference`), none of which can contain this
 * sequence.
 */
const SCOPE = '::';

/** A board row's dnd-kit id: which list it is rendered in, plus which task. */
export function scopedItemId(containerId: string, itemId: string): string {
  return `${containerId}${SCOPE}${itemId}`;
}

/**
 * Splits a scoped row id back apart, or returns `null` for an id that was
 * never scoped — which is how the board tells a list card (a bare container
 * id) from a task row without carrying a second lookup table around.
 */
export function parseScopedItemId(id: string): { containerId: string; itemId: string } | null {
  const at = id.indexOf(SCOPE);
  if (at <= 0) return null;
  const itemId = id.slice(at + SCOPE.length);
  if (!itemId) return null;
  return { containerId: id.slice(0, at), itemId };
}

/** The write a completed drag asks for. `none` means the drop changed nothing. */
export type BoardDrop =
  | { kind: 'none' }
  | { kind: 'reorder'; containerId: string; orderedIds: string[] }
  | { kind: 'move'; itemId: string; toContainerId: string; beforeItemId: string | null };

export interface BoardDropInput {
  /** Every list's rows, in the order they are on screen. */
  itemsByContainer: Readonly<Record<string, readonly string[]>>;
  /** The row that was picked up, and the list it was picked up from. */
  from: { containerId: string; itemId: string };
  /**
   * What it was released over. `itemId` is `null` when the drop landed on a
   * list itself rather than on one of its rows — an empty list, or one whose
   * only row is the one being dragged.
   */
  over: { containerId: string; itemId: string | null };
  /**
   * Vertical screen position the drop was aimed at: the pointer's, which is
   * also what picked `over` — so "the row under my finger, and which half of
   * it" stays one consistent question. A keyboard move has no pointer and
   * passes the dragged row's own centre instead.
   */
  releasedAtY: number;
  /** Vertical centre of the row it was released over. Ignored when `over.itemId` is null. */
  overCenterY: number;
}

export function resolveBoardDrop(input: BoardDropInput): BoardDrop {
  const { itemsByContainer, from, over, releasedAtY, overCenterY } = input;
  const sameList = over.containerId === from.containerId;

  if (over.itemId === null) {
    // Released over a list rather than a row. Into another list that means the
    // end of it; back onto its own list it means nothing, which matters: the
    // collision fallback resolves to the list itself whenever the only row in
    // range is the dragged one, and treating that as "send to the bottom"
    // would move a task the user only jiggled.
    return sameList
      ? { kind: 'none' }
      : { kind: 'move', itemId: from.itemId, toContainerId: over.containerId, beforeItemId: null };
  }

  if (sameList) {
    // Within one list the row has already been *shown* in its new slot — the
    // sorting strategy opened the gap as the pointer passed each neighbour —
    // so the drop has to reproduce exactly that, which is a swap to the
    // hovered row's index, not an insertion before it.
    const ids = itemsByContainer[from.containerId] ?? [];
    const at = ids.indexOf(from.itemId);
    const to = ids.indexOf(over.itemId);
    if (at === -1 || to === -1 || at === to) return { kind: 'none' };
    const ordered = [...ids];
    ordered.splice(to, 0, ...ordered.splice(at, 1));
    return { kind: 'reorder', containerId: from.containerId, orderedIds: ordered };
  }

  // Across lists nothing has moved on screen — the target list highlights but
  // keeps its rows still — so which side of the hovered row this lands on is
  // decided here, by the same midpoint test the native implementation used
  // before this: below the hovered row's centre means after it, and "after the
  // last row" is the end of the list.
  const ids = itemsByContainer[over.containerId] ?? [];
  const at = ids.indexOf(over.itemId);
  const beforeItemId = at === -1
    ? null
    : releasedAtY < overCenterY
      ? over.itemId
      : ids[at + 1] ?? null;

  return { kind: 'move', itemId: from.itemId, toContainerId: over.containerId, beforeItemId };
}

/**
 * A reorder of the rows that are ON SCREEN, expressed as a reorder of all of
 * them.
 *
 * UI-29 gave the board a "Show done" switch, and hiding rows makes the two
 * disagree: dnd-kit reports the new order of what it can see, while
 * `reorderBacklogTasks` rebuilds the whole list from the array it is handed
 * and **drops every task that is missing from it** — so one drag with the
 * switch off would have deleted every finished task in that column, silently,
 * with no Trash entry. This is the translation that stops it.
 *
 * The hidden rows keep the exact slots they already held, and the visible ones
 * fill the remaining slots in their new order. Dragging above or below a
 * hidden row therefore cannot move it, which is the only sane reading of a
 * gesture aimed at something the user cannot see.
 *
 * @param allIds  every row in the list, in its current stored order
 * @param visibleOrder  the rows that were on screen, in their new order
 */
export function mergeVisibleOrder(
  allIds: readonly string[],
  visibleOrder: readonly string[],
): string[] {
  const visible = new Set(visibleOrder);
  let next = 0;
  return allIds.map((id) => (visible.has(id) ? visibleOrder[next++] ?? id : id));
}
