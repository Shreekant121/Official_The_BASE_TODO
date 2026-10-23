/* Moved out of `pages/ChatPage.tsx`, unchanged, when it was split (BUILD-7). */
import { Icon } from '../../ui';
import type { ToolChip } from '../../lib/agent/toolChip';
import { CHIP_ICONS } from './chatShared';

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
 *
 * **Since BIG-12 (27A-5) every turn is Atlas's.** The basic assistant and its
 * snapshot-ring Revert are retired, so the button this container used to carry
 * for an in-browser turn is gone with them, and every change is reverted from
 * the Log — on the laptop, or with the lid shut from the cloud copy there.
 */
export function ChangeList({
  chips,
  onAtlas,
}: {
  chips: ToolChip[];
  /** Whether Atlas wrote these — always, since 27A-5; kept so a turn that says otherwise draws no promise. */
  onAtlas: boolean;
}) {
  return (
    <div
      style={{
        borderRadius: 'var(--r-lg)',
        backgroundImage: 'var(--glass-fill-2)',
        boxShadow: 'var(--glass-rim-2), var(--glass-cast-1)',
      }}
    >
      {/* One fixed column, or the grid's own `auto` column takes the width of
          the longest title plus its date and the row never truncates — it
          runs off the right edge instead (OPT-1, `TurnBlock`'s column). */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', padding: '0 var(--sp-6)' }}>
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
              style={{ display: 'flex', flex: '0 0 auto', color: 'var(--job-violet)' }}
            >
              <Icon name={CHIP_ICONS[chip.icon]} size={16} />
            </span>
            <span
              title={chip.summary}
              style={{
                flex: 1, minWidth: 0,
                font: 'var(--type-body)', fontSize: 'var(--text-sm)',
                color: 'var(--fg-1)',
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
          {`${chips.length} change${chips.length === 1 ? '' : 's'} written`}
        </span>
      </div>

      {/* Atlas wrote these and this browser's ring did not watch it. Said
          rather than offered: a disabled Revert would imply the button is the
          right idea and merely unavailable, while the Log is a real answer
          available right now — on the laptop's log, or since BIG-12 the cloud
          copy's, where a turn Atlas ran on this tablet reverts in place. (It
          used to say "on the laptop" and point at "item 13's action log",
          which was true of neither machine once item 13 shipped.)

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
          Atlas records every change in its log — revert this turn from the Log screen. Anything it
          deleted is also in the Trash for 30 days.
        </p>
      )}
    </div>
  );
}
