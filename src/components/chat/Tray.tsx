/* Moved out of `pages/ChatPage.tsx` when it was split (BUILD-7). BUILD-8 made
   a tap answer on the card it was made on. The state behind it is
   `useApprovalTray.ts`. */
import { Link } from 'react-router-dom';
import { Button, Icon, IconButton } from '../../ui';
import { Z } from '../../lib/zLayers';
import { relativeWhen } from '../../lib/atlas/relativeWhen';
import type { AtlasApproval } from '../../lib/atlas/client';
import { approvalCopy } from './approvalCopy';

/**
 * The waiting-for-you tray (item 13, §5.2).
 *
 * **Nothing in it expires**, and the subtitle says so, because that is the
 * property that makes the front door tolerable rather than a deadline: Atlas
 * asks, carries on with everything else, and the answer can come whenever it
 * comes. A tray that quietly dropped an unanswered item after a day would make
 * "one tap from Shreekant" mean "one tap from Shreekant, today".
 *
 * It is a panel and not a page, deliberately. The decision belongs beside the
 * conversation that produced it — and the row that opens it is the same
 * gesture on both.
 */
export function Tray({
  open,
  items,
  deciding,
  failureOf,
  onClose,
  onDecide,
}: {
  open: boolean;
  /** Everything waiting, plus a receipt for each item answered since the tray opened (BUILD-8). */
  items: AtlasApproval[];
  deciding: string | null;
  /** Why the last tap on an item did not happen, or null. */
  failureOf: (id: string) => string | null;
  onClose: () => void;
  onDecide: (id: string, choice: 'approve' | 'discard') => Promise<void>;
}) {
  return (
    <aside
      aria-hidden={!open}
      aria-label="Waiting for you"
      style={{
        position: 'fixed', top: 'calc(var(--sp-7) + var(--safe-t))', right: 'calc(var(--sp-7) + var(--safe-r))', bottom: 'calc(var(--sp-7) + var(--safe-b))',
        width: 'min(372px, calc(100vw - var(--sp-9)))', zIndex: Z.panel,
        display: 'grid', gridTemplateRows: 'auto minmax(0,1fr) auto',
        borderRadius: 'var(--r-sheet)',
        backgroundColor: 'oklch(0.145 0.004 260 / 0.96)', backgroundImage: 'var(--glass-fill-1)',
        border: '1px solid oklch(1 0 0 / 0.10)',
        backdropFilter: 'var(--glass-bd-xl)', WebkitBackdropFilter: 'var(--glass-bd-xl)',
        boxShadow: 'var(--glass-cast-3), var(--glass-inner-1)',
        transform: open ? 'translateX(0)' : 'translateX(calc(100% + var(--sp-9)))',
        opacity: open ? 1 : 0, visibility: open ? 'visible' : 'hidden',
        pointerEvents: open ? 'auto' : 'none',
        transition:
          `transform var(--dur-sheet) var(--ease-glass), opacity var(--dur-base) var(--ease-glass), ` +
          `visibility 0s linear ${open ? '0s' : 'var(--dur-sheet)'}`,
      }}
    >
      <header
        style={{
          display: 'flex', alignItems: 'center', gap: 'var(--sp-4)',
          padding: 'var(--sp-7) var(--sp-6) var(--sp-5) var(--sp-8)',
        }}
      >
        <div style={{ display: 'grid', gap: 2, flex: 1, minWidth: 0 }}>
          <h2
            style={{
              font: 'var(--type-title)', letterSpacing: 'var(--tracking-title)',
              color: 'var(--fg-1)', margin: 0,
            }}
          >
            Waiting for you
          </h2>
          <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)' }}>
            Nothing here expires. Atlas kept working.
          </span>
        </div>
        <IconButton label="Close" variant="ghost" onClick={onClose}>
          <Icon name="x" size={18} />
        </IconButton>
      </header>

      <div
        style={{
          overflowY: 'auto', overscrollBehavior: 'contain', padding: '0 var(--sp-7)',
          display: 'grid', gap: 'var(--sp-4)', alignContent: 'start',
        }}
      >
        {items.length === 0 ? (
          <div
            style={{
              display: 'grid', gap: 'var(--sp-4)', justifyItems: 'center',
              padding: 'var(--sp-12) 0', textAlign: 'center',
            }}
          >
            <span
              style={{
                display: 'grid', placeItems: 'center', width: 44, height: 44, borderRadius: '50%',
                backgroundImage: 'var(--glass-fill-1)', boxShadow: 'var(--glass-rim-1)', color: 'var(--fg-4)',
              }}
            >
              <Icon name="check" size={20} />
            </span>
            <span
              style={{
                font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-3)',
                maxWidth: '28ch', textWrap: 'pretty',
              }}
            >
              Nothing needs your tap. Only a public link, deleting a project or a list, and mail once Atlas can send it ever do.
            </span>
          </div>
        ) : (
          items.map((item) =>
            item.state !== 'waiting' ? (
              <TrayReceipt key={item.id} item={item} />
            ) : (
              <TrayCard
                key={item.id}
                item={item}
                busy={deciding === item.id}
                failure={failureOf(item.id)}
                onDecide={onDecide}
              />
            ),
          )
        )}
      </div>

      <footer style={{ padding: 'var(--sp-6) var(--sp-8) var(--sp-7)', borderTop: '1px solid var(--line-faint)' }}>
        <Link
          to="/log"
          style={{
            font: 'var(--type-caption)', color: 'var(--fg-3)',
            display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-3)',
          }}
        >
          <Icon name="scroll-text" size={14} />
          Everything Atlas did today
        </Link>
      </footer>
    </aside>
  );
}

/**
 * One act still waiting (BUILD-8).
 *
 * While it runs it says where the time is going: approving runs the real tool
 * on the laptop, which re-reads the whole board first, so a few seconds of
 * "Doing it…" with nothing else on screen read as a tap that had not landed.
 * A failure stays on the card with the laptop's own reason, and the verb turns
 * into "Try again" — the approval is still waiting, and now it looks it.
 */
function TrayCard({
  item,
  busy,
  failure,
  onDecide,
}: {
  item: AtlasApproval;
  busy: boolean;
  failure: string | null;
  onDecide: (id: string, choice: 'approve' | 'discard') => Promise<void>;
}) {
  const copy = approvalCopy(item.kind, 1);
  return (
    <div
      style={{
        display: 'grid', gap: 'var(--sp-5)', padding: 'var(--sp-6)',
        borderRadius: 'var(--r-card)',
        backgroundImage: 'var(--glass-tint-amber)',
        boxShadow: 'var(--glass-rim-2), var(--glass-cast-2)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-4)' }}>
        <span
          style={{
            display: 'grid', placeItems: 'center', width: 32, height: 32, flex: '0 0 auto',
            borderRadius: '50%', backgroundImage: 'var(--glass-fill-2)',
            boxShadow: 'var(--glass-rim-2)', color: 'var(--status-review)',
          }}
        >
          <Icon name={copy.icon} size={16} />
        </span>
        <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
          <span style={{ font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-1)', textWrap: 'pretty' }}>
            {item.preview}
          </span>
          <span className="ag-kicker" style={{ color: 'var(--fg-4)' }}>
            {item.conversationTitle ?? 'Atlas'} · {relativeWhen(item.createdAt)}
          </span>
        </div>
      </div>
      {failure !== null && !busy && (
        <div
          role="alert"
          style={{
            display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-3)',
            padding: 'var(--sp-4) var(--sp-5)', borderRadius: 'var(--r-sm)',
            backgroundImage: 'var(--glass-well)', boxShadow: 'var(--glass-well-shadow)',
          }}
        >
          <span style={{ display: 'flex', flex: '0 0 auto', paddingTop: 2, color: 'var(--status-overrun)' }}>
            <Icon name="triangle-alert" size={14} />
          </span>
          <span style={{ font: 'var(--type-caption)', color: 'var(--fg-2)', textWrap: 'pretty', minWidth: 0 }}>
            That did not happen. {failure}
          </span>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
        <Button size="sm" variant="frost" disabled={busy} onClick={() => void onDecide(item.id, 'approve')}>
          {busy ? 'Doing it…' : failure !== null ? 'Try again' : copy.action}
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void onDecide(item.id, 'discard')}>
          Discard
        </Button>
        {busy && (
          <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)' }}>
            On the laptop — a few seconds.
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * What an answered act became, in the laptop's own words (BUILD-8).
 *
 * The same line the conversation's card collapses to, for the same reason:
 * what happened here is the thing worth keeping on screen. It stays until the
 * tray is closed; after that the log has it.
 */
function TrayReceipt({ item }: { item: AtlasApproval }) {
  const done = item.state === 'approved';
  const summary = item.outcome?.summary ?? (done ? 'Done.' : 'Discarded — nothing left the laptop.');
  return (
    <div
      role="status"
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-4)', padding: 'var(--sp-5) var(--sp-6)',
        borderRadius: 'var(--r-card)',
        backgroundImage: 'var(--glass-fill-1)', boxShadow: 'var(--glass-rim-1)',
        animation: 'var(--kf-condense) var(--dur-base) var(--ease-glass) both',
      }}
    >
      <span style={{ display: 'flex', flex: '0 0 auto', paddingTop: 2, color: done ? 'var(--accent)' : 'var(--fg-4)' }}>
        <Icon name={done ? 'check' : 'x'} size={16} />
      </span>
      <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
        <span style={{ font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-1)', textWrap: 'pretty' }}>
          {summary}
        </span>
        <span className="ag-kicker" style={{ color: 'var(--fg-4)' }}>
          {done ? 'Done' : 'Discarded'} · in the log
        </span>
      </div>
    </div>
  );
}
