/* Moved out of `pages/ChatPage.tsx` when it was split (BUILD-7); BUILD-8 gave
   it the line that says a tap did not happen. */
import { Button, Icon } from '../../ui';
import type { AtlasPendingApproval } from '../../lib/atlas/client';
import { approvalCopy, readApprovalTargets } from './approvalCopy';

/**
 * The front door (item 13, DESIGN.md §5.2).
 *
 * WHY IT IS THE HEAVIEST THING ON THIS SCREEN
 * ---------------------------------------------
 * Because it is the only one that cannot be taken back. §5.2 asks for the
 * difference to be *visible*: *"approvals look different, so that tapping
 * through cards never becomes a habit that carries someone through a door they
 * meant to notice."* So this is near-opaque where everything else is
 * translucent, amber-rimmed where everything else is neutral, and it is the
 * one surface in the conversation that cannot be dismissed by any gesture —
 * the two buttons are the only exits, and neither of them is the one a thumb
 * reaches for by habit.
 *
 * WHAT IT SAYS IS THE TOOL'S OWN SENTENCE
 * -----------------------------------------
 * `preview` came back from running the call **in preview** on the laptop: the
 * same lookups, no write. So the card says *"Publish a public, read-only page
 * for the project 'Studio Launch' — 3 lists and 14 tasks"*, which is a thing a
 * person can agree to, rather than *"Atlas would like to call
 * publish_share_link"*, which is not. Nothing on this card is composed here.
 *
 * **The share link is spelled out on this side.** The tool returns a path,
 * because the laptop does not know what origin this app is served from — this
 * browser does, and `shareUrl` is the app's own answer to that question.
 */
export function ApprovalCard({
  approval,
  state,
  failure = null,
  busy,
  onApprove,
  onDiscard,
}: {
  approval: AtlasPendingApproval;
  state: 'waiting' | 'approved' | 'discarded';
  /** Why the last tap did not happen, in the laptop's words (BUILD-8). The card stays open. */
  failure?: string | null;
  busy: boolean;
  onApprove: () => void;
  onDiscard: () => void;
}) {
  /*
   * ITEM 13D — ONE TAP COVERS THE WHOLE BATCH, SO THE CARD HAS TO LIST IT.
   *
   * Shreekant's call, 2026-09-08, put to him with the alternatives: five links
   * should cost one tap, not five. What makes that safe rather than lazy is
   * that the card still shows him all five — a tap is only meaningful if he
   * read what he agreed to, and one card he reads beats five he clicks through.
   *
   * These rows are the tool's own `previewData`, produced by running the call
   * in preview on the laptop exactly like the sentence above them. Nothing here
   * composes them. A single target keeps the paragraph it always had: one line
   * of prose reads better than a list of one.
   */
  const targets = readApprovalTargets(approval.previewData);
  const copy = approvalCopy(approval.kind, targets.length);
  /* Once decided it collapses to a line. It stays on screen rather than
     disappearing, because what happened here is exactly the kind of thing the
     conversation has to keep a record of — and the line says the log has it
     too, which is where the record actually lives. */
  if (state !== 'waiting') {
    const sent = state === 'approved';
    return (
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', minHeight: 52,
          padding: '0 var(--sp-6)', borderRadius: 'var(--r-lg)',
          backgroundImage: 'var(--glass-fill-1)', boxShadow: 'var(--glass-rim-1)',
          /* ITEM 13G — the receipt condenses out of the card it replaces, at
             `--dur-base`. The card itself arrives on the slower `--dur-slow`
             below: it is asking for something and is meant to be noticed,
             where this is only reporting that the asking is over. */
          animation: 'var(--kf-condense) var(--dur-base) var(--ease-glass) both',
        }}
      >
        <span style={{ display: 'flex', color: sent ? 'var(--accent)' : 'var(--fg-4)' }}>
          <Icon name={sent ? 'check' : 'x'} size={16} />
        </span>
        <span style={{ flex: 1, font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-2)' }}>
          {sent
            ? approval.kind === 'delete'
              ? 'You approved this. It is in the Trash, and Revert on the log puts it back.'
              : 'You approved this. It happened.'
            : 'Discarded — nothing left the laptop.'}
        </span>
        <span className="ag-kicker" style={{ color: 'var(--fg-4)' }}>
          in the log
        </span>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'grid', gap: 'var(--sp-6)', padding: 'var(--sp-7)',
        borderRadius: 'var(--r-card)',
        backgroundColor: 'oklch(0.16 0.02 82 / 0.55)',
        backgroundImage: 'var(--glass-tint-amber)',
        backdropFilter: 'var(--glass-bd-lg)', WebkitBackdropFilter: 'var(--glass-bd-lg)',
        boxShadow: 'var(--glass-rim-3), var(--glass-inner-2), var(--glass-cast-3), var(--glow-amber-md)',
        /* ITEM 13G — `--dur-slow`, the longest arrival on the screen. The
           mockup gives the asking card its own duration and it is the one
           piece of motion here that is a safety property: a card that
           condenses into place over 420ms is a card a thumb already travelling
           toward the last button cannot hit by accident. */
        animation: 'var(--kf-condense) var(--dur-slow) var(--ease-glass) both',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)' }}>
        <span
          style={{
            display: 'grid', placeItems: 'center', width: 34, height: 34, flex: '0 0 auto',
            borderRadius: 'var(--r-circle)', backgroundImage: 'var(--glass-fill-2)',
            boxShadow: 'var(--glass-rim-2)', color: 'var(--status-review)',
          }}
        >
          <Icon name={copy.icon} size={17} />
        </span>
        <div style={{ display: 'grid', gap: 1, minWidth: 0 }}>
          <span className="ag-kicker" style={{ color: 'var(--status-review)' }}>
            {copy.kicker}
          </span>
          <span
            style={{
              font: 'var(--type-title)', fontSize: 'var(--text-lg)',
              letterSpacing: 'var(--tracking-title)', color: 'var(--fg-1)',
            }}
          >
            {copy.title}
          </span>
        </div>
      </div>

      <div
        style={{
          display: 'grid', gap: 'var(--sp-3)', padding: 'var(--sp-5) var(--sp-6)',
          borderRadius: 'var(--r-sm)', backgroundImage: 'var(--glass-well)',
          boxShadow: 'var(--glass-well-shadow)',
        }}
      >
        {targets.length > 1 ? (
          /* One row per thing, on its own hairline, so five are five and not a
             paragraph a thumb scrolls past. The extent is the half he is
             actually agreeing to: not "the project" but how much of it. */
          targets.map((target, position) => (
            <div
              key={target.id}
              style={{
                display: 'grid', gap: 1, paddingTop: position === 0 ? 0 : 'var(--sp-3)',
                marginTop: position === 0 ? 0 : 'var(--sp-3)',
                borderTop: position === 0 ? 'none' : '1px solid var(--line-faint)',
              }}
            >
              <span style={{ font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-1)', textWrap: 'pretty' }}>
                {target.title}
              </span>
              <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)' }}>
                {target.type} · {target.extent}
              </span>
            </div>
          ))
        ) : (
          <p
            style={{
              font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-2)',
              textWrap: 'pretty', margin: 0,
            }}
          >
            {approval.preview}
          </p>
        )}
      </div>

      {/* BUILD-8 — a tap that did not happen says so here, beside the button
          that was pressed, rather than only in a toast that goes away. */}
      {failure !== null && !busy && (
        <div role="alert" style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-3)' }}>
          <span style={{ display: 'flex', flex: '0 0 auto', paddingTop: 2, color: 'var(--status-overrun)' }}>
            <Icon name="triangle-alert" size={14} />
          </span>
          <span style={{ font: 'var(--type-caption)', color: 'var(--fg-2)', textWrap: 'pretty' }}>
            That did not happen. {failure}
          </span>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
        <Button
          variant="frost"
          disabled={busy}
          iconLeft={<Icon name={copy.actionIcon} size={16} />}
          onClick={onApprove}
        >
          {busy ? 'Doing it…' : failure !== null ? 'Try again' : copy.action}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={onDiscard}>
          Discard
        </Button>
        <span style={{ flex: 1 }} />
        <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', maxWidth: '36ch', textWrap: 'pretty' }}>
          {copy.footnote}
        </span>
      </div>
    </div>
  );
}
