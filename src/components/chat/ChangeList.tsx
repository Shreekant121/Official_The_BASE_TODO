/* Moved out of `pages/ChatPage.tsx`, unchanged, when it was split (BUILD-7). */
import { Button, Icon } from '../../ui';
import type { ToolChip } from '../../lib/agent/toolChip';
import type { SnapshotTurn } from '../../store/useSnapshotStore';
import { CHIP_ICONS, type ChatTurn } from './chatShared';

/**
 * What the turn wrote, and the button that undoes it, on one surface.
 *
 * The source's comment is the whole argument: *"this container IS the revert
 * unit — the turn's changes and the button that undoes them share one surface,
 * so there is never a doubt what 'revert' covers."*
 *
 * The rows come from the tool calls; the footer's button comes from the
 * snapshot ring, which is the app's actual undo. The two can disagree — a turn
 * that only created has changes to show and nothing to put back (D3: deleting
 * is manual, so undoing a creation is not on offer) — and the label says which
 * case this is rather than offering a button that would report "left 1 newly
 * created item in place".
 *
 * **ITEM 9D IS THE FIRST TIME AN ATLAS TURN REACHES THIS CONTAINER**, and it
 * needed a fourth case. Item 9 gave Atlas hands; 9D put its tool calls on the
 * wire, so `delete_task` on the laptop now draws a row here. The snapshot ring
 * is a Zustand store in *this browser* and Atlas never touches it, so
 * `snapshotTurnId` is always `null` on that path — which would have fallen to
 * the existing `Nothing to revert`, and that is a lie with a real cost. There
 * is something to revert; this browser is simply not the thing that can do it.
 * What can is Atlas's own action log (DESIGN.md §5.3), which is item 13, and
 * until then a deletion comes back from `/trash`. So the Atlas branch says
 * that instead — no button, because there is no button that would work.
 */
export function ChangeList({
  chips,
  turn,
  snapshot,
  onAtlas,
  onRevert,
}: {
  chips: ToolChip[];
  turn: ChatTurn;
  snapshot: SnapshotTurn | undefined;
  /** Which machine wrote these, which decides whether Revert can exist at all. */
  onAtlas: boolean;
  onRevert: (snapshotTurnId: string) => void;
}) {
  const reverted = snapshot?.revertedAt !== undefined;
  // An entry with no prior value is something the turn *created*.
  const restorable = snapshot?.entries.filter((entry) => entry.prior !== null).length ?? 0;

  const label = !turn.snapshotTurnId
    ? 'Nothing to revert'
    : !snapshot
      ? 'Too old to revert'
      : restorable === 0
        ? 'Created — cannot undo'
        : `Revert ${restorable} change${restorable === 1 ? '' : 's'}`;
  const enabled = Boolean(turn.snapshotTurnId) && Boolean(snapshot) && !reverted && restorable > 0;

  return (
    <div
      style={{
        borderRadius: 'var(--r-lg)',
        backgroundImage: reverted ? 'var(--glass-fill-1)' : 'var(--glass-fill-2)',
        boxShadow: reverted ? 'var(--glass-rim-1)' : 'var(--glass-rim-2), var(--glass-cast-1)',
        opacity: reverted ? 0.62 : 1,
        transition: 'var(--t-hover)',
      }}
    >
      <div style={{ display: 'grid', padding: '0 var(--sp-6)' }}>
        {chips.map((chip, index) => (
          <div
            key={`${chip.verb}-${chip.subject ?? index}`}
            style={{
              display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', minHeight: 52,
              padding: 'var(--sp-3) 0',
              borderTop: index === 0 ? 'none' : '1px solid var(--line-faint)',
            }}
          >
            <span
              aria-hidden="true"
              style={{ display: 'flex', flex: '0 0 auto', color: reverted ? 'var(--fg-4)' : 'var(--accent)' }}
            >
              <Icon name={reverted ? 'undo-2' : CHIP_ICONS[chip.icon]} size={16} />
            </span>
            <span
              title={chip.summary}
              style={{
                flex: 1, minWidth: 0,
                font: 'var(--type-body)', fontSize: 'var(--text-sm)',
                color: reverted ? 'var(--fg-3)' : 'var(--fg-1)',
                /* Longhand — see `ui/data/TaskRow.tsx`. This one flips the
                   moment Revert is pressed. */
                textDecorationLine: reverted ? 'line-through' : 'none',
                textDecorationColor: 'var(--fg-4)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}
            >
              {chip.verb}
              {chip.subject && ` ‘${chip.subject}’`}
            </span>
            {chip.detail && (
              <span
                style={{
                  font: 'var(--type-caption)', color: 'var(--fg-4)',
                  whiteSpace: 'nowrap', flex: '0 0 auto',
                  maxWidth: '45%', overflow: 'hidden', textOverflow: 'ellipsis',
                }}
              >
                {chip.detail}
              </span>
            )}
          </div>
        ))}
      </div>

      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', flexWrap: 'wrap',
          padding: 'var(--sp-4) var(--sp-5) var(--sp-4) var(--sp-6)',
          borderTop: '1px solid var(--line-faint)',
        }}
      >
        <span className="ag-kicker" style={{ color: 'var(--fg-4)' }}>
          {reverted
            ? 'Reverted'
            : `${chips.length} change${chips.length === 1 ? '' : 's'} written`}
        </span>
        <span style={{ flex: 1 }} />
        {!onAtlas && !reverted && (
          <Button
            variant="ghost"
            size="sm"
            disabled={!enabled}
            iconLeft={<Icon name="undo-2" size={14} />}
            onClick={() => turn.snapshotTurnId && onRevert(turn.snapshotTurnId)}
            title={
              enabled
                ? 'Put every task this turn touched back the way it was'
                : restorable === 0 && snapshot
                  ? 'This turn only created things, and deleting is manual by design — remove it in the app if you did not want it.'
                  : 'This turn has nothing left to undo'
            }
          >
            {label}
          </Button>
        )}
      </div>

      {/* Atlas wrote these and this browser's ring did not watch it. Said
          rather than offered: a disabled Revert would imply the button is the
          right idea and merely unavailable, while the Trash is a real answer
          available right now.

          On its own line rather than beside the count, because the count and a
          button are a row and the count and a sentence are not: at 880 the
          sentence had 298px to itself and wrapped to three, which made the
          footer taller than the changes it was describing. */}
      {onAtlas && (
        <p
          style={{
            margin: 0, padding: '0 var(--sp-6) var(--sp-5)',
            font: 'var(--type-caption)', color: 'var(--fg-3)', textWrap: 'pretty',
          }}
        >
          Atlas wrote these on the laptop, so Revert cannot reach them. Anything it deleted is in
          the Trash for 30 days; the rest is item 13’s action log.
        </p>
      )}
    </div>
  );
}
