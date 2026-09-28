/**
 * Aurora Glass — AIPanel
 * Ported from design-system/components/overlay/AIPanel.{jsx,d.ts} (v3, BUILD-4).
 * Guidance: design-system/components/overlay/AIPanel.prompt.md
 *
 * A short exchange about ONE object, docked to the screen that object lives
 * on. The prompt's three laws are the component: it docks and never covers
 * (the HOST owns the split — see `AIPanelDock`), it always names its subject,
 * and it states what it did in the past tense.
 *
 * WHERE THIS DEPARTS FROM THE PROTOTYPE, AND WHY
 * ----------------------------------------------
 * - **Undo and approval are controlled.** The sketch keeps `undone` and the
 *   approval's answer in its own state, which is right for a drawing and
 *   wrong for an app: an undo can fail, and an approval is a network call to
 *   the laptop that can too. The host passes both in (`undoFor`, `item.state`)
 *   and the panel draws what is true rather than what was tapped.
 * - **Escape and the Android back gesture go through `useOverlayDismiss`**,
 *   not the sketch's own `keydown` listener, so one press closes the topmost
 *   thing and a panel over a board never takes the board's select mode with
 *   it. `hideNav: false` — the panel docks beside the page and the nav stays
 *   where the host put it.
 * - **A `note` item**, which the sketch has no kind for: a failure, or a fact
 *   about the turn (the laptop is asleep; nothing was changed). The panel must
 *   say those somewhere, and a fake `ai` reply would put words in the model's
 *   mouth.
 * - **`answeredBy`** under the empty state's sentence. `/chat` refuses to
 *   switch machines silently and neither does this.
 * - **Questions are the question card (BUILD-16)**, compact, not the sketch's
 *   chips under a reply — the chat's card, so the panel beside a board asks
 *   the way `/chat` does (`Atlas Questions.dc.html`, 1c). It answers only
 *   while it is the last question: an old card taking answers after the
 *   conversation moved on would answer something nobody is asking. Once
 *   answered it gives way to the receipt, which stands in for his message.
 * - **A Stop button while working.** The prompt's working pill is "one pill,
 *   one label, the tool named", and that is still what is drawn — the stop is
 *   the send button's slot, which is empty while a turn is running anyway.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Button } from '../actions/Button';
import { IconButton } from '../actions/IconButton';
import { Icon, type IconName } from '../core/Icon';
import { AskCard, AskReceipt } from '../data/AskCard';
import { useOverlayDismiss } from '../../lib/useOverlayDismiss';
import { useFooterReserve } from '../../lib/useFooterReserve';
import { plainText, type DidSummary } from '../../lib/aiPanel';
import type { PanelItem, PanelWorking, UndoState } from '../../lib/aiPanelRun';

export type AIPanelDock = 'bottom' | 'right';

export interface AIPanelSubjectView {
  kicker: string;
  title: string;
  meta?: string;
  icon?: IconName;
}

export interface AIPanelProps {
  subject: AIPanelSubjectView;
  items: PanelItem[];
  working: PanelWorking | null;
  prompts?: string[];
  /** The empty state's sentence: what this panel can do to this object. */
  scope: string;
  /** Who will answer, in words. Shown in the empty state only. */
  answeredBy?: string;
  placeholder?: string;
  dock: AIPanelDock;
  onClose: () => void;
  onSend: (text: string) => void;
  onStop?: () => void;
  undoFor: (turn: string) => UndoState | undefined;
  onUndo: (turn: string) => void;
  onDecide: (itemId: string, decision: 'approve' | 'discard') => void;
  /**
   * A control above the message box — the model picker (2026-09-17,
   * Shreekant: *"let me select the AI model at least in the AI panel"*). A
   * slot rather than an import, so this file stays a design-system component
   * that knows nothing about where models come from.
   */
  footer?: ReactNode;
  style?: CSSProperties;
}

/**
 * The subject of an open panel, marked in its host. **A brighter rim, never
 * emerald** — emerald means running, and nothing here is (`ai-panel.html`'s
 * `.subj`). Inline because every host writes its own box-shadow inline.
 */
export const AI_SUBJECT_RIM = 'var(--glass-rim-3), var(--glass-cast-2), 0 0 0 1px var(--line-strong)';

const DOCK: Record<AIPanelDock, { width: CSSProperties['width']; radius: string }> = {
  bottom: { width: '100%', radius: 'var(--r-card-lg) var(--r-card-lg) 0 0' },
  right: { width: 404, radius: 'var(--r-card-lg) 0 0 var(--r-card-lg)' },
};

const BODY_SM: CSSProperties = { font: 'var(--type-body)', fontSize: 'var(--text-sm)' };

/* The message box grows with what is typed to about five lines, then scrolls
   (FIX-11). Pixels rather than `lh`, because the height is set from
   `scrollHeight`, which is pixels. */
const FIELD_LINE_PX = 24;
const FIELD_PAD_PX = 10;
const FIELD_CAP_PX = FIELD_LINE_PX * 5 + FIELD_PAD_PX * 2;

/* How near the bottom still counts as following the conversation. A few
   pixels, not the chat's 240: the panel on a phone is barely taller than that. */
const FOLLOW_SLACK_PX = 8;

function Kicker({ children, color = 'var(--fg-4)', style }: { children: ReactNode; color?: string; style?: CSSProperties }) {
  return (
    <span
      style={{
        font: 'var(--type-kicker)', letterSpacing: 'var(--tracking-kicker)',
        textTransform: 'var(--kicker-transform)' as CSSProperties['textTransform'], color, whiteSpace: 'nowrap', ...style,
      }}
    >
      {children}
    </span>
  );
}

/** What you said. Right-aligned, level-3 glass, nothing else. */
function You({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', minWidth: 0 }}>
      <p
        style={{
          margin: 0, maxWidth: 'min(86%, 46ch)', padding: 'var(--sp-3) var(--sp-5)',
          borderRadius: 'var(--r-lg)', backgroundImage: 'var(--glass-fill-3)',
          boxShadow: 'var(--glass-rim-2), var(--glass-cast-1)',
          ...BODY_SM, color: 'var(--fg-1)',
          textWrap: 'pretty', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap',
          animation: 'var(--kf-condense) var(--dur-base) var(--ease-glass) both',
        }}
      >
        {text}
      </p>
    </div>
  );
}

/** What it said. Plain text on the panel, never a bubble. */
function Reply({ text }: { text: string }) {
  return (
    <div style={{ display: 'grid', gap: 'var(--sp-4)', minWidth: 0, animation: 'var(--kf-condense) var(--dur-base) var(--ease-glass) both' }}>
      <p
        style={{
          margin: 0, maxWidth: '54ch', ...BODY_SM,
          lineHeight: 'var(--leading-normal)', color: 'var(--fg-2)', textWrap: 'pretty',
          whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
        }}
      >
        {plainText(text)}
      </p>
    </div>
  );
}

function Rows({ rows, struck }: { rows: DidSummary['rows']; struck?: boolean }) {
  return (
    <div
      style={{
        display: 'grid', minWidth: 0, padding: '0 var(--sp-4)',
        borderRadius: 'var(--r-sm)', backgroundImage: 'var(--glass-well)', boxShadow: 'var(--glass-well-shadow)',
      }}
    >
      {rows.map((row, i) => (
        <div
          key={`${row.label}-${i}`}
          style={{
            display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', alignItems: 'center',
            gap: 'var(--sp-4)', minHeight: 38, padding: 'var(--sp-2)',
            borderTop: i === 0 ? 'none' : '1px solid var(--line-faint)',
          }}
        >
          <span
            style={{
              minWidth: 0, ...BODY_SM,
              color: struck ? 'var(--fg-3)' : 'var(--fg-1)',
              textDecoration: struck ? 'line-through' : 'none', textDecorationColor: 'var(--fg-4)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}
          >
            {row.label}
          </span>
          {row.meta && (
            <span style={{ font: 'var(--type-numeric)', fontSize: 'var(--text-2xs)', color: 'var(--fg-3)', whiteSpace: 'nowrap' }}>
              {row.meta}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * THE TOOL RESULT. A kicker naming the tool, hairline rows of what it
 * touched, and — once the turn has finished and the log has it — the way
 * back, on the change itself.
 */
function Did({ did, undo, showUndo, onUndo }: { did: DidSummary; undo?: UndoState; showUndo: boolean; onUndo: () => void }) {
  const undone = undo?.status === 'done';
  return (
    <div
      style={{
        display: 'grid', gap: 'var(--sp-3)', minWidth: 0,
        opacity: undone ? 0.5 : 1, transition: 'opacity var(--dur-base) var(--ease-glass)',
        animation: 'var(--kf-condense) var(--dur-base) var(--ease-glass) both',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', minWidth: 0 }}>
        <span style={{ display: 'flex', color: did.ok ? 'var(--fg-3)' : 'var(--status-review)' }}>
          <Icon name={did.icon} size={13} />
        </span>
        <Kicker color="var(--fg-3)">{did.tool}</Kicker>
        <span style={{ flex: 1, height: 1, background: 'var(--line-faint)' }} />
        {did.count && <Kicker color={did.ok ? 'var(--fg-4)' : 'var(--status-review)'}>{did.count}</Kicker>}
      </div>

      {did.rows.length > 0 && <Rows rows={did.rows} struck={undone} />}

      {did.ok && showUndo && undo && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', minHeight: 44 }}>
          <span style={{ display: 'flex', color: undone || undo.status === 'unavailable' ? 'var(--fg-4)' : 'var(--accent)' }}>
            <Icon name={undone ? 'rotate-ccw' : 'check'} size={14} />
          </span>
          <span style={{ flex: 1, minWidth: 0, font: 'var(--type-caption)', color: 'var(--fg-3)', textWrap: 'pretty' }}>
            {undo.status === 'done'
              ? undo.summary
              : undo.status === 'unavailable'
                ? `Applied. ${undo.reason}`
                : 'Applied. Undo puts back everything from this answer.'}
          </span>
          {(undo.status === 'ready' || undo.status === 'busy') && (
            <Button
              variant="ghost"
              size="sm"
              disabled={undo.status === 'busy'}
              onClick={onUndo}
              iconLeft={<Icon name="rotate-ccw" size={14} />}
              style={{ minHeight: 44 }}
            >
              {undo.status === 'busy' ? 'Undoing' : 'Undo'}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * THE APPROVAL. Nothing irreversible happens without one tap. Amber tint,
 * amber glow, the cost stated in words, and the affirmative is the frost
 * surface — the loudest thing the system owns.
 */
function Ask({ item, onDecide }: { item: Extract<PanelItem, { kind: 'approve' }>; onDecide: (d: 'approve' | 'discard') => void }) {
  const { hard } = item;

  if (item.state === 'yes' || item.state === 'no') {
    const yes = item.state === 'yes';
    return (
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', minHeight: 44,
          padding: 'var(--sp-3) var(--sp-5)', borderRadius: 'var(--r-lg)',
          backgroundImage: 'var(--glass-fill-1)', boxShadow: 'var(--glass-rim-1)',
          animation: 'var(--kf-condense) var(--dur-base) var(--ease-glass) both',
        }}
      >
        <span style={{ display: 'flex', color: yes ? 'var(--accent)' : 'var(--fg-4)' }}>
          <Icon name={yes ? 'check' : 'x'} size={15} />
        </span>
        <span style={{ flex: 1, minWidth: 0, ...BODY_SM, color: 'var(--fg-2)', textWrap: 'pretty' }}>
          {item.done ?? (yes ? 'Done.' : 'Rejected — nothing changed.')}
        </span>
        <Kicker>in the log</Kicker>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'grid', gap: 'var(--sp-4)', padding: 'var(--sp-5)', minWidth: 0,
        borderRadius: 'var(--r-card)',
        backgroundColor: hard ? 'oklch(0.16 0.02 82 / 0.42)' : 'transparent',
        backgroundImage: hard ? 'var(--glass-tint-amber)' : 'var(--glass-fill-2)',
        boxShadow: hard
          ? 'var(--glass-rim-3), var(--glass-inner-1), var(--glass-cast-2), var(--glow-amber-md)'
          : 'var(--glass-rim-2), var(--glass-cast-1)',
        animation: 'var(--kf-condense) var(--dur-slow) var(--ease-glass) both',
      }}
    >
      <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
        <Kicker color={hard ? 'var(--status-review)' : 'var(--fg-4)'}>
          {hard ? 'Cannot be undone · needs your tap' : 'Needs your tap'}
        </Kicker>
        <span
          style={{
            font: 'var(--type-title)', fontSize: 'var(--text-md)',
            letterSpacing: 'var(--tracking-title)', color: 'var(--fg-1)', textWrap: 'pretty',
          }}
        >
          {item.title}
        </span>
      </div>

      {item.note && (
        <span style={{ font: 'var(--type-caption)', color: hard ? 'var(--status-overrun)' : 'var(--fg-3)', textWrap: 'pretty' }}>
          {item.note}
        </span>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
        <Button
          variant={hard ? 'frost' : 'tint'}
          size="sm"
          disabled={item.state === 'deciding'}
          onClick={() => onDecide('approve')}
          iconLeft={<Icon name={hard ? 'triangle-alert' : 'check'} size={15} />}
          style={{ minHeight: 44 }}
        >
          Go ahead
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={item.state === 'deciding'}
          onClick={() => onDecide('discard')}
          style={{ minHeight: 44 }}
        >
          Discard
        </Button>
      </div>
    </div>
  );
}

/** A FIELD IT FILLED. The Score screen's whole reason for having a panel. */
function Filled({ field, value }: { field: string; value: string }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', minHeight: 48,
        padding: 'var(--sp-3) var(--sp-5)', borderRadius: 'var(--r-lg)',
        backgroundImage: 'var(--glass-tint-accent)', boxShadow: 'var(--glass-rim-2), var(--glow-accent-sm)',
        animation: 'var(--kf-condense) var(--dur-base) var(--ease-glass) both',
      }}
    >
      <span style={{ display: 'flex', color: 'oklch(0.93 0.07 162)' }}>
        <Icon name="check" size={15} />
      </span>
      <span style={{ display: 'grid', gap: 1, flex: 1, minWidth: 0 }}>
        <Kicker color="var(--fg-3)">{field} · on screen, not saved</Kicker>
        <span
          style={{
            ...BODY_SM, color: 'var(--fg-1)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}
        >
          {value}
        </span>
      </span>
    </div>
  );
}

function Note({ text, tone }: { text: string; tone: 'error' | 'quiet' }) {
  return (
    <p
      role={tone === 'error' ? 'alert' : undefined}
      style={{
        margin: 0, display: 'flex', gap: 'var(--sp-3)', alignItems: 'flex-start',
        font: 'var(--type-caption)', textWrap: 'pretty',
        color: tone === 'error' ? 'var(--status-overrun)' : 'var(--fg-3)',
        animation: 'var(--kf-condense) var(--dur-base) var(--ease-glass) both',
      }}
    >
      <span style={{ display: 'flex', flex: '0 0 auto', paddingTop: 2 }}>
        <Icon name={tone === 'error' ? 'circle-alert' : 'info'} size={13} />
      </span>
      {text}
    </p>
  );
}

/** WORKING. One pill, one label, named tool or nothing. Never a log. */
function Working({ label, tool }: PanelWorking) {
  const [dots, setDots] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setDots((n) => (n + 1) % 3), 420);
    return () => clearInterval(iv);
  }, []);
  return (
    <div
      role="status"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-4)', justifySelf: 'start',
        minHeight: 36, padding: '0 var(--sp-5) 0 var(--sp-4)', borderRadius: 'var(--r-pill)',
        backgroundImage: 'var(--glass-fill-1)', boxShadow: 'var(--glass-rim-1), var(--glass-cast-1)',
        animation: 'var(--kf-condense) var(--dur-base) var(--ease-glass) both',
      }}
    >
      <span
        style={{
          display: 'grid', placeItems: 'center', width: 20, height: 20, flex: '0 0 auto',
          borderRadius: '50%', backgroundImage: 'var(--glass-tint-accent)',
          boxShadow: 'var(--glass-rim-1), var(--glow-accent-sm)', color: 'oklch(0.93 0.07 162)',
          animation: 'var(--kf-pulse) 1600ms var(--ease-glass) infinite',
        }}
      >
        <Icon name={tool ? 'wrench' : 'sparkles'} size={11} />
      </span>
      <span style={{ font: 'var(--type-caption)', color: 'var(--fg-2)', whiteSpace: 'nowrap' }}>
        {label}
        <span style={{ font: 'var(--type-numeric)', fontSize: 'var(--text-xs)', color: 'var(--fg-4)' }}>
          {'.'.repeat(dots + 1)}
        </span>
      </span>
      {tool && (
        <Kicker style={{ borderLeft: '1px solid var(--line-faint)', paddingLeft: 'var(--sp-4)' }}>{tool}</Kicker>
      )}
    </div>
  );
}

export function AIPanel({
  subject, items, working, prompts = [], scope, answeredBy,
  placeholder = 'Ask about this task',
  dock, onClose, onSend, onStop, undoFor, onUndo, onDecide, footer, style,
}: AIPanelProps) {
  const [draft, setDraft] = useState('');
  const bodyRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  /* Where the caret goes after a Ctrl+Enter newline. Setting `value` from
     React puts it at the end, which is wrong for a newline typed mid-draft. */
  const caretRef = useRef<number | null>(null);
  const geom = DOCK[dock];
  const empty = items.length === 0 && !working;
  const busy = working !== null;

  useOverlayDismiss(true, onClose, { hideNav: false });
  /* Docked at the bottom, the message box is this screen's bottom furniture,
     and the focus pill has to float above it rather than on it — the chat
     composer's arrangement (BUILD-1). On the right it is out of the pill's way. */
  useFooterReserve(composerRef, dock === 'bottom');

  /*
   * FOLLOW THE NEWEST MESSAGE, AND KEEP FOLLOWING WHILE IT SETTLES.
   *
   * One pin on the render that added the items is not enough, because what
   * it measured is not what ends up on screen: Inter swaps in after first
   * paint and re-wraps every line and chip row. Measured on the phone
   * (2026-09-24, the `scoring-ai` shot): pinned at 295px of content, settled
   * at 366 — 71px short, with "9 · Critical", the last answer to the last
   * question, below the fold. So a message that changes size re-pins, and so
   * does the end of an entrance (its transform counts as overflow while it
   * runs) — but only while the body is still at the bottom. Scrolled up to
   * read, it stays put: the chat's rule (`chat/usePinToBottom.ts`).
   */
  const followingRef = useRef(true);
  const lastTopRef = useRef(0);
  const pinIfFollowing = () => {
    const body = bodyRef.current;
    if (body && followingRef.current) body.scrollTop = body.scrollHeight;
  };
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    followingRef.current = true;
    body.scrollTop = body.scrollHeight;
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (followingRef.current) body.scrollTop = body.scrollHeight;
    });
    for (const child of body.children) observer.observe(child);
    return () => observer.disconnect();
  }, [items, working]);

  /* Grow with the draft — `chat/Composer.tsx`'s recipe. The height is reset
     to `auto` first because `scrollHeight` on a box already sized to its
     content never reports a smaller number, so a deleted line would never
     give its height back. Past the cap the box scrolls, and it is the line
     being typed that has to stay in view. */
  useEffect(() => {
    const el = fieldRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, FIELD_CAP_PX)}px`;
    if (caretRef.current !== null) {
      el.setSelectionRange(caretRef.current, caretRef.current);
      caretRef.current = null;
    }
    if (el.scrollHeight > FIELD_CAP_PX && el.selectionEnd === draft.length) el.scrollTop = el.scrollHeight;
  }, [draft]);

  /* Undo sits on the LAST change of a turn, so a turn that wrote three things
     carries one button rather than three that all do the same thing. */
  const lastDidOfTurn = new Map<string, string>();
  for (const item of items) if (item.kind === 'did') lastDidOfTurn.set(item.turn, item.id);
  /* The live card is the last one asked, with nothing he said after it. */
  let liveAsk: string | null = null;
  for (const item of items) {
    if (item.kind === 'ask') liveAsk = item.id;
    else if (item.kind === 'you' || item.kind === 'answered') liveAsk = null;
  }
  /* A card someone answered gives way to its receipt. */
  const answeredAsks = new Set<string>();
  items.forEach((item, i) => {
    if (item.kind !== 'ask') return;
    const next = items.slice(i + 1).find((later) => later.kind === 'you' || later.kind === 'answered');
    if (next?.kind === 'answered') answeredAsks.add(item.id);
  });

  const send = (text: string) => {
    const trimmed = text.trim();
    if (trimmed === '' || busy) return;
    onSend(trimmed);
  };

  return (
    <aside
      aria-label={`Ask about ${subject.title}`}
      data-ai-panel={dock}
      style={{
        position: 'relative', boxSizing: 'border-box', minWidth: 0, minHeight: 0,
        width: geom.width, height: '100%',
        display: 'grid', gridTemplateRows: 'auto minmax(0,1fr) auto',
        borderRadius: geom.radius,
        backgroundColor: 'oklch(0.145 0.004 260 / 0.82)',
        backgroundImage: 'var(--glass-fill-2)',
        WebkitBackdropFilter: 'var(--glass-bd-lg)',
        backdropFilter: 'var(--glass-bd-lg)',
        boxShadow: 'var(--glass-rim-2), var(--glass-inner-1), var(--glass-cast-3)',
        ...style,
      }}
    >
      {/* THE SUBJECT. Always. You must know what it is about to act on. */}
      <header
        style={{
          display: 'grid', gap: 'var(--sp-4)',
          padding: dock === 'bottom' ? 'var(--sp-3) var(--sp-6) var(--sp-5)' : 'var(--sp-6) var(--sp-6) var(--sp-5)',
          borderBottom: '1px solid var(--line-faint)',
        }}
      >
        {dock === 'bottom' && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Dismiss panel"
            style={{
              justifySelf: 'center', width: 96, minHeight: 20, border: 0, padding: 0,
              background: 'transparent', cursor: 'pointer', display: 'grid', placeItems: 'center',
            }}
          >
            <span style={{ width: 44, height: 4, borderRadius: 'var(--r-pill)', background: 'var(--line-strong)' }} />
          </button>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', minWidth: 0 }}>
          <span
            style={{
              display: 'grid', placeItems: 'center', width: 30, height: 30, flex: '0 0 auto',
              borderRadius: '50%', backgroundImage: 'var(--glass-fill-2)', boxShadow: 'var(--glass-rim-2)',
              color: 'var(--fg-2)',
            }}
          >
            <Icon name={subject.icon ?? 'sparkles'} size={15} />
          </span>
          <span style={{ display: 'grid', gap: 1, flex: 1, minWidth: 0 }}>
            <Kicker style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{subject.kicker}</Kicker>
            <span
              style={{
                font: 'var(--type-label)', color: 'var(--fg-1)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}
            >
              {subject.title}
            </span>
          </span>
          {subject.meta && (
            <span style={{ font: 'var(--type-numeric)', fontSize: 'var(--text-2xs)', color: 'var(--fg-4)', whiteSpace: 'nowrap' }}>
              {subject.meta}
            </span>
          )}
          <IconButton label="Dismiss panel" variant="ghost" onClick={onClose}>
            <Icon name="x" size={17} />
          </IconButton>
        </div>
      </header>

      <div
        ref={bodyRef}
        className="ag-scroll"
        onScroll={(e) => {
          /* Only scrolling UP stops the following. A scroll event arrives a
             frame after the write that caused it, and on the phone the font
             had grown the content in between — judged by distance alone, the
             panel's own pin read as him scrolling away. */
          const body = e.currentTarget;
          if (body.scrollHeight - body.scrollTop - body.clientHeight < FOLLOW_SLACK_PX) followingRef.current = true;
          else if (body.scrollTop < lastTopRef.current) followingRef.current = false;
          lastTopRef.current = body.scrollTop;
        }}
        onAnimationEnd={pinIfFollowing}
        style={{
          display: 'grid', alignContent: empty ? 'center' : 'start', gap: 'var(--sp-6)',
          minWidth: 0, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain',
          padding: 'var(--sp-6)',
        }}
      >
        {empty && (
          <div style={{ display: 'grid', gap: 'var(--sp-5)', justifyItems: 'start' }}>
            <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
              <p style={{ margin: 0, maxWidth: '44ch', ...BODY_SM, color: 'var(--fg-3)', textWrap: 'pretty' }}>
                {scope}
              </p>
              {answeredBy && (
                <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)' }}>Answered by {answeredBy}.</span>
              )}
            </div>
            {prompts.length > 0 && (
              <div style={{ display: 'grid', gap: 'var(--sp-3)', width: '100%' }}>
                {prompts.slice(0, 3).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => send(p)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', width: '100%',
                      minHeight: 46, padding: '0 var(--sp-5)', border: 0, cursor: 'pointer', textAlign: 'left',
                      borderRadius: 'var(--r-pill)', backgroundImage: 'var(--glass-fill-1)',
                      boxShadow: 'var(--glass-rim-1)', color: 'var(--fg-2)',
                      ...BODY_SM, transition: 'var(--t-hover)',
                    }}
                  >
                    <span style={{ display: 'flex', color: 'var(--fg-4)' }}>
                      <Icon name="corner-down-right" size={14} />
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>{p}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {items.map((item) => {
          switch (item.kind) {
            case 'you':
              return <You key={item.id} text={item.text} />;
            case 'ai':
              return <Reply key={item.id} text={item.text} />;
            case 'ask':
              return answeredAsks.has(item.id) ? null : (
                <AskCard key={item.id} card={item.card} compact live={item.id === liveAsk && !busy} onSubmit={send} />
              );
            case 'answered':
              return <AskReceipt key={item.id} receipt={item.receipt} />;
            case 'did':
              return (
                <Did
                  key={item.id}
                  did={item.did}
                  undo={undoFor(item.turn)}
                  showUndo={lastDidOfTurn.get(item.turn) === item.id}
                  onUndo={() => onUndo(item.turn)}
                />
              );
            case 'filled':
              return <Filled key={item.id} field={item.field} value={item.value} />;
            case 'approve':
              return <Ask key={item.id} item={item} onDecide={(d) => onDecide(item.id, d)} />;
            case 'note':
              return <Note key={item.id} text={item.text} tone={item.tone} />;
          }
        })}

        {working && <Working label={working.label} tool={working.tool} />}
      </div>

      {/* One field, one send — and, since 2026-09-17, which model answers it.
          The mockup keeps this strip to the field alone; his instruction
          outranks it, and the picker sits above the field rather than inside
          it so the field keeps its full width on the tablet. */}
      <div
        ref={composerRef}
        style={{
          padding: 'var(--sp-5) var(--sp-6) calc(var(--sp-6) + var(--safe-b, 0px))',
          borderTop: '1px solid var(--line-faint)',
          display: 'grid', gap: 'var(--sp-4)',
        }}
      >
        {footer && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', minWidth: 0 }}>
            {footer}
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim() === '' || busy) return;
            send(draft);
            setDraft('');
          }}
          style={{
            /* Send sits on the last line as the box grows, and the radius is
               `--r-lg` rather than a pill: 26px is exactly half of 52, so one
               line still reads as the pill it was, and five lines read as a
               rounded box instead of a capsule. */
            display: 'flex', alignItems: 'flex-end', gap: 'var(--sp-3)', minHeight: 52,
            padding: 'var(--sp-2) var(--sp-2) var(--sp-2) var(--sp-5)', borderRadius: 'var(--r-lg)',
            backgroundImage: 'var(--glass-well)', boxShadow: 'var(--glass-well-shadow)',
          }}
        >
          <textarea
            ref={fieldRef}
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            /* FIX-11, his rule: **Enter sends, Ctrl+Enter is a new line.** It
               was a single-line `<input>` with nowhere for a newline to go.
               Shift+Enter makes one too, because that is what `/chat`'s
               composer does and the hand does not know which box it is in.
               A textarea inserts nothing on Ctrl+Enter by itself, so the
               newline is written by hand at the caret.
               Enter sends by hand rather than by the form's implicit
               submission: a key event with no `keypress` behind it — which
               is what an automated press and some soft keyboards send —
               never reaches the form. A composing IME keeps its Enter. */
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
              if (e.shiftKey) return;
              e.preventDefault();
              if (e.ctrlKey || e.metaKey) {
                const el = e.currentTarget;
                const at = el.selectionStart;
                const next = `${draft.slice(0, at)}\n${draft.slice(el.selectionEnd)}`;
                setDraft(next);
                caretRef.current = at + 1;
                return;
              }
              e.currentTarget.form?.requestSubmit();
            }}
            placeholder={placeholder}
            aria-label={placeholder}
            data-ag-field
            className="ag-field ag-scroll"
            style={{
              flex: 1, minWidth: 0, display: 'block', boxSizing: 'border-box',
              border: 0, outline: 'none', background: 'transparent', resize: 'none',
              ...BODY_SM, color: 'var(--fg-1)', letterSpacing: 'var(--tracking-ui)',
              /* After `BODY_SM`, whose `font` shorthand would reset it. 44px
                 tall on one line, as the input was: a 24px line and 10px
                 above and below it. */
              lineHeight: `${FIELD_LINE_PX}px`, padding: `${FIELD_PAD_PX}px 0`,
              maxHeight: FIELD_CAP_PX, overflowY: 'auto',
            }}
          />
          {busy && onStop ? (
            <IconButton label="Stop" type="button" variant="glass" onClick={onStop}>
              <Icon name="square" size={15} />
            </IconButton>
          ) : (
            <IconButton
              label="Send"
              type="submit"
              disabled={busy}
              variant={draft.trim() ? 'tint' : 'glass'}
              tone={draft.trim() ? 'accent' : undefined}
            >
              <Icon name="arrow-up" size={17} />
            </IconButton>
          )}
        </form>
      </div>
    </aside>
  );
}

/**
 * THE DOCK, which is the host's half of law 1. The panel never covers its
 * subject: on a narrow screen the host keeps the top and the panel takes a
 * 56% row; on a wide one the host column shrinks and the panel takes an
 * `auto` column 404px wide. **Never an `auto` row** — the prompt's own
 * warning; it collapses the panel to its content.
 */
export function AIPanelDock({
  dock, panel, children, style,
}: { dock: AIPanelDock; panel: ReactNode; children: ReactNode; style?: CSSProperties }) {
  const bottom = dock === 'bottom';
  return (
    <div
      style={{
        flex: 1, minWidth: 0, minHeight: 0, display: 'grid',
        gridTemplateRows: panel && bottom ? 'minmax(0,1fr) 56%' : 'minmax(0,1fr)',
        gridTemplateColumns: panel && !bottom ? 'minmax(0,1fr) auto' : 'minmax(0,1fr)',
        ...style,
      }}
    >
      {children}
      {panel}
    </div>
  );
}
