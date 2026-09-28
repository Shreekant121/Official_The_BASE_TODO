/**
 * Public share view — the page a SimpleURL short link resolves to.
 * NOT wrapped in `ProtectedRoute`: anyone with the link can open it, signed in
 * or not. It reads a single denormalized `publicShares/{shareId}` mirror doc
 * (public read per `firestore.rules`) via `onSnapshot`, so the view stays live
 * as the owner edits — a Google-Docs-style shared link, not a stale export.
 *
 * ── BUILD-14: redrawn from his design ─────────────────────────────────────
 *
 * `design-system/screens/Share View.dc.html`. His verdict on the page before
 * it: it "looks super bad and not part of the software". The design is one
 * column that reads like a deliverable: who shared it, a title and a lede, a
 * summary card with the figures a client asks for, then each list as a
 * section of cards. The design's own top bar (Read-only / Client / … and the
 * phone frame) is the design tool's switcher, not part of the page.
 *
 * The page is V3 now, inside `App.tsx`'s scope like everything else, which is
 * what it was held out of the scope for — so a client saw it change once.
 *
 * WHAT HE DECIDED (2026-09-24), AND WHERE IT LIVES
 *
 * - **Client view, built whole.** The owner's name on the tasks he is doing,
 *   a live timer while his focus run is on one, and the time each task took.
 *   Published only when the Share dialog says so (`showPeople`); the facts are
 *   written by `buildShareDoc`, and nothing here guesses at them.
 * - **Outsourcing, the design's flow without its 48-hour lock.** Name and email
 *   to claim, a link and a note to submit, Release to give it back. There is no
 *   hold and no countdown: a task somebody else claimed is drawn as taken, and
 *   nothing more. The email, link and note go where only he can read them
 *   (`lib/shareSubmissions.ts` says why).
 * - **Links can close on a date.** Past it the page says so — from the date
 *   alone, before any rewrite has stripped the document.
 * - **His name, never an email.** The design prints a contact address and an
 *   "Ask for a new link" button; neither is here.
 *
 * WHAT IS KEPT FROM BEFORE, DELIBERATELY
 *
 * - **THERE IS NO SCORE ON THIS SCREEN (item 16).** `snapshotTask` does not
 *   write one, and nothing here reads the field an older share still carries.
 * - **Subtasks are open.** A share link is the whole point of the page, and
 *   folding away what the owner chose to publish hides it.
 * - **Money toggles ₹ / $** at the live rate, and says the rate.
 * - **The page has no store and no user.** Firestore, the share libraries and
 *   pure formatters are all it touches.
 *
 * What the design draws that this app has no data for is left out rather than
 * invented: a "Waiting on you" state, payment terms ("paid within 7 days"),
 * other people's live timers, the recipient's name.
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { formatINR } from '../store/useStore';
import { getInrToUsdRate, convertInrToUsd, formatUSD } from '../lib/exchangeRate';
import type { PublicShareDoc, PublicSubtask, PublicTask } from '../lib/publicShare';
import { Button, Icon, Input, Skeleton, Textarea, type IconName } from '../ui';
import { devShareFixture } from '../lib/devShareFixture';
import { useNow } from '../lib/useNow';
import {
  subscribeSubmissions, loadWorkerName, saveWorkerName, loadWorkerEmail, saveWorkerEmail,
  loadClaims, claimTask, submitWork, releaseTask, setSubmission, looksLikeEmail, normaliseFilesLink,
  type ShareSubmission,
} from '../lib/shareSubmissions';
import {
  clockText, dueLine, durationText, estimateText, initials, isClosed, liveRunShown, longDate,
  readSummary, shareTasks, workPhase, workSummary, type Summary, type WorkPhase,
} from '../lib/shareView';

type Currency = 'INR' | 'USD';

const KICKER_CASE = 'var(--kicker-transform)' as CSSProperties['textTransform'];

const KICKER: CSSProperties = {
  font: 'var(--type-kicker)', letterSpacing: 'var(--tracking-kicker)', textTransform: KICKER_CASE,
  color: 'var(--fg-4)',
};

/**
 * The client view's phase colours, one per list, in page order. The design
 * gives each phase a hue; a list has no colour of its own, so they are dealt
 * from the design's three and then two more of the system's.
 */
const LIST_HUES = [290, 210, 75, 162, 20];
const hueOf = (i: number, alpha?: number) =>
  `oklch(0.70 0.15 ${LIST_HUES[i % LIST_HUES.length]}${alpha === undefined ? '' : ` / ${alpha}`})`;

/** The emerald wash the design gives everything live. */
const LIVE_FILL = 'oklch(0.70 0.15 162 / 0.12)';
const LIVE_RING = 'inset 0 0 0 1px oklch(0.70 0.15 162 / 0.35)';

/** Stable empty map so a non-outsourcing share doesn't re-render on every pass. */
const NO_SUBMISSIONS: Record<string, ShareSubmission> = {};

function useCurrency() {
  const [currency, setCurrency] = useState<Currency>('INR');
  const [rate, setRate] = useState<number | null>(null);
  useEffect(() => {
    let active = true;
    void getInrToUsdRate().then((r) => { if (active) setRate(r); });
    return () => { active = false; };
  }, []);
  const usd = currency === 'USD' && rate !== null;
  const money = (inr: number) => (usd ? formatUSD(convertInrToUsd(inr, rate)) : formatINR(inr));
  return { currency, setCurrency, money, rate, usd };
}

// ─── Small pieces ────────────────────────────────────────────────────────────

function Avatar({ name, size, hue }: { name?: string; size: number; hue?: string }) {
  const text = name ? initials(name) : '';
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'grid', placeItems: 'center', width: size, height: size, flex: '0 0 auto',
        borderRadius: 'var(--r-circle)',
        ...(hue
          ? { background: hue, color: 'var(--void-0)' }
          : { backgroundImage: 'var(--glass-fill-2)', boxShadow: 'var(--glass-rim-2)', color: 'var(--fg-1)' }),
        font: 'var(--type-label)', fontSize: size >= 40 ? 'var(--text-xs)' : 10, letterSpacing: '0.03em',
      }}
    >
      {text || <img src="/brand/mark-white.png" alt="" width={size * 0.5} height={size * 0.5} style={{ display: 'block' }} />}
    </span>
  );
}

function Pulse() {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 7, height: 7, flex: '0 0 auto', borderRadius: 'var(--r-circle)',
        background: 'var(--accent)', boxShadow: '0 0 8px var(--accent)',
        animation: 'var(--kf-pulse) 1.6s var(--ease-glass) infinite',
      }}
    />
  );
}

function Track({ value, height, fill = 'var(--accent)' }: { value: number; height: number; fill?: string }) {
  return (
    <div
      style={{
        flex: '1 1 200px', height, borderRadius: 'var(--r-pill)', overflow: 'hidden',
        backgroundImage: 'var(--glass-well)', boxShadow: 'var(--glass-well-shadow)',
      }}
    >
      <div
        style={{
          width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`, height: '100%',
          borderRadius: 'var(--r-pill)', background: fill,
          transition: 'width var(--dur-sheet) var(--ease-glass)',
        }}
      />
    </div>
  );
}

function MetaItem({ icon, children, ink = 'var(--fg-3)' }: { icon?: IconName; children: ReactNode; ink?: string }) {
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-2)', whiteSpace: 'nowrap',
        font: 'var(--type-numeric)', fontSize: 'var(--text-xs)', color: ink, fontVariantNumeric: 'tabular-nums',
      }}
    >
      {icon && <Icon name={icon} size={13} style={{ color: 'inherit' }} />}
      {children}
    </span>
  );
}

function Pill({ ink, line, children }: { ink: string; line: string; children: ReactNode }) {
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', height: 24, padding: '0 var(--sp-3)',
        borderRadius: 'var(--r-pill)', boxShadow: `inset 0 0 0 1px ${line}`,
        font: 'var(--type-caption)', color: ink, whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

/** The entrance every card and the hero share: in order, 24ms apart. */
const enter = (i: number): CSSProperties => ({
  animation: `var(--kf-condense) var(--dur-slow) var(--ease-glass) ${80 + i * 24}ms both`,
});

// ─── Subtasks ────────────────────────────────────────────────────────────────

function flatSubtasks(subs: PublicSubtask[], depth = 0): Array<{ sub: PublicSubtask; depth: number }> {
  return subs.flatMap((sub) => [{ sub, depth }, ...flatSubtasks(sub.subtasks ?? [], depth + 1)]);
}

function SubtaskList({ subs, heading, allDone }: { subs: PublicSubtask[]; heading?: string; allDone?: boolean }) {
  return (
    <>
      {heading && <span style={KICKER}>{heading}</span>}
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 'var(--sp-2)' }}>
        {flatSubtasks(subs).map(({ sub, depth }) => {
          const done = allDone || sub.done;
          return (
            <li key={sub.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-3)', paddingLeft: depth * 18 }}>
              <span
                aria-label={done ? 'Done' : 'Not done'}
                style={{
                  flex: '0 0 auto', marginTop: 3, display: 'grid', placeItems: 'center', width: 14, height: 14,
                  borderRadius: 4, color: 'var(--void-0)',
                  background: done ? 'var(--fg-3)' : 'transparent',
                  boxShadow: done ? 'none' : 'inset 0 0 0 1px var(--line-strong)',
                }}
              >
                {done && <Icon name="check" size={10} stroke={2} style={{ color: 'inherit' }} />}
              </span>
              <span
                style={{
                  flex: 1, minWidth: 0, font: 'var(--type-caption)', fontSize: 'var(--text-sm)',
                  color: done ? 'var(--fg-3)' : 'var(--fg-2)', textWrap: 'pretty', overflowWrap: 'anywhere',
                }}
              >
                {sub.title}
              </span>
              {sub.deadline && !Number.isNaN(new Date(sub.deadline).getTime()) && (
                <MetaItem ink="var(--fg-4)">{longDate(new Date(sub.deadline).getTime()).replace(/ \d{4}$/, '')}</MetaItem>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

// ─── Outsourcing: the worker's half of a card ────────────────────────────────

interface WorkerCtx {
  shareId: string;
  ownerName?: string;
  name: string;
  email: string;
  setName: (v: string) => void;
  setEmail: (v: string) => void;
  /** Which card's form is open — one at a time, page-wide. */
  openForm: string | null;
  setOpenForm: (taskId: string | null) => void;
  /** Re-read this device's claims after a claim or a release. */
  refreshClaims: () => void;
}

function FormButtons({ onCancel, children }: { onCancel: () => void; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
      <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      {children}
    </div>
  );
}

function FormError({ text }: { text: string | null }) {
  if (!text) return null;
  return <p role="alert" style={{ font: 'var(--type-caption)', color: 'var(--status-overrun)', textWrap: 'pretty' }}>{text}</p>;
}

function WorkArea({ task, phase, sub, worker }: {
  task: PublicTask;
  phase: WorkPhase;
  sub: ShareSubmission | undefined;
  worker: WorkerCtx;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState('');
  const [note, setNote] = useState('');
  const formOpen = worker.openForm === task.id;
  const owner = worker.ownerName ?? 'The owner';

  const run = async (work: () => Promise<void>, failure: string) => {
    setBusy(true);
    setError(null);
    try {
      await work();
      worker.setOpenForm(null);
    } catch (err) {
      console.error(err);
      setError(failure);
    } finally {
      setBusy(false);
    }
  };

  const canClaim = worker.name.trim().length > 0 && looksLikeEmail(worker.email);
  const filesLink = normaliseFilesLink(link);

  if (phase === 'approved') return null;

  const body = (() => {
    if (phase === 'taken') {
      return (
        <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', font: 'var(--type-caption)', color: 'var(--fg-3)' }}>
          <Icon name="lock" size={14} style={{ color: 'inherit', flex: '0 0 auto' }} />
          {sub?.state === 'submitted' ? `Submitted by ${sub.workerName}, under review.` : `Claimed by ${sub?.workerName ?? 'someone else'}.`}
        </span>
      );
    }

    if (phase === 'sent') {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
          <span
            aria-hidden="true"
            style={{
              display: 'grid', placeItems: 'center', width: 32, height: 32, flex: '0 0 auto', borderRadius: 'var(--r-circle)',
              backgroundImage: 'var(--glass-fill-1)', boxShadow: 'var(--glass-rim-1)', color: 'var(--status-queued)',
            }}
          >
            <Icon name="send" size={15} style={{ color: 'inherit' }} />
          </span>
          <span style={{ flex: '1 1 200px', display: 'grid', gap: 1 }}>
            <span style={{ font: 'var(--type-label)', color: 'var(--fg-1)' }}>Submitted. Under review.</span>
            <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', textWrap: 'pretty' }}>
              {owner} will look at your link and get back to you.
            </span>
          </span>
          <Button
            variant="ghost"
            loading={busy}
            iconLeft={<Icon name="undo-2" size={16} />}
            onClick={() => void run(() => setSubmission(worker.shareId, task.id, sub?.workerName || worker.name, 'in_progress'), 'Could not take it back. Try again.')}
          >
            Undo
          </Button>
        </div>
      );
    }

    if (phase === 'mine') {
      return formOpen ? (
        <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
          <Input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="Link to the files"
            aria-label="Link to the files"
            inputMode="url"
            iconLeft={<Icon name="link" size={16} />}
            style={{ fontSize: 16 }}
          />
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder={`Anything ${owner} should know`}
            aria-label="Note"
            style={{ fontSize: 16 }}
          />
          <FormError text={error} />
          <FormButtons onCancel={() => worker.setOpenForm(null)}>
            <Button
              disabled={!filesLink}
              loading={busy}
              iconLeft={<Icon name="send" size={16} />}
              onClick={() => filesLink && void run(
                () => submitWork(worker.shareId, task.id, sub?.workerName || worker.name, filesLink, note),
                'Your work did not send. Nothing was lost; try again in a minute.',
              )}
            >
              Submit
            </Button>
          </FormButtons>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
          <span
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-3)', height: 36, padding: '0 var(--sp-4)',
              borderRadius: 'var(--r-pill)', background: LIVE_FILL, boxShadow: LIVE_RING,
              color: 'var(--accent-lift)', font: 'var(--type-label)', fontSize: 'var(--text-sm)',
            }}
          >
            <Icon name="hourglass" size={15} style={{ color: 'inherit' }} />
            Yours
          </span>
          <span style={{ flex: 1 }} />
          <div style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
            <Button
              variant="ghost"
              loading={busy}
              onClick={() => void run(
                async () => { await releaseTask(worker.shareId, task.id, sub?.workerName || worker.name); worker.refreshClaims(); },
                'Could not give it back. Try again.',
              )}
            >
              Release
            </Button>
            <Button iconLeft={<Icon name="send" size={16} />} onClick={() => { setError(null); worker.setOpenForm(task.id); }}>
              Submit work
            </Button>
          </div>
          <FormError text={error} />
        </div>
      );
    }

    // open
    return formOpen ? (
      <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
        <span style={{ font: 'var(--type-label)', color: 'var(--fg-1)' }}>Claim without an account</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--sp-3)' }}>
          <Input
            value={worker.name}
            onChange={(e) => worker.setName(e.target.value)}
            placeholder="Your name"
            aria-label="Your name"
            maxLength={60}
            autoComplete="name"
            style={{ fontSize: 16 }}
          />
          <Input
            type="email"
            value={worker.email}
            onChange={(e) => worker.setEmail(e.target.value)}
            placeholder="Email for payment"
            aria-label="Email for payment"
            maxLength={254}
            autoComplete="email"
            style={{ fontSize: 16 }}
          />
        </div>
        <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', textWrap: 'pretty' }}>
          Only {owner} sees your email. Others see your name on the task.
        </span>
        <FormError text={error} />
        <FormButtons onCancel={() => worker.setOpenForm(null)}>
          <Button
            disabled={!canClaim}
            loading={busy}
            onClick={() => void run(
              async () => { await claimTask(worker.shareId, task.id, worker.name, worker.email); worker.refreshClaims(); },
              'Could not claim it. Try again in a minute.',
            )}
          >
            Claim it
          </Button>
        </FormButtons>
      </div>
    ) : (
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
        <span style={{ flex: '1 1 180px', font: 'var(--type-caption)', color: 'var(--fg-3)', textWrap: 'pretty' }}>
          Claim it and it shows as yours.
        </span>
        <Button onClick={() => { setError(null); worker.setOpenForm(task.id); }}>Claim task</Button>
      </div>
    );
  })();

  return (
    <div style={{ display: 'grid', gap: 'var(--sp-4)', paddingTop: 'var(--sp-4)', borderTop: '1px solid var(--line-faint)' }}>
      {body}
    </div>
  );
}

// ─── Task card ───────────────────────────────────────────────────────────────

const READ_STATE = {
  done: { pill: 'Done', ink: 'var(--accent)', line: 'oklch(0.70 0.15 162 / 0.35)', bar: 'var(--accent)', ring: 'none' },
  progress: { pill: 'In progress', ink: 'var(--status-running)', line: 'var(--line-soft)', bar: 'var(--status-running)', ring: 'inset 0 0 0 2px var(--status-running)' },
  next: { pill: 'Up next', ink: 'var(--fg-3)', line: 'var(--line-faint)', bar: 'var(--fg-3)', ring: 'inset 0 0 0 1px var(--line-strong)' },
} as const;

const WORK_STATE: Record<WorkPhase, { pill: string; ink: string; line: string; ring: string }> = {
  open: { pill: 'Open', ink: 'var(--fg-2)', line: 'var(--line-soft)', ring: 'inset 0 0 0 1px var(--line-strong)' },
  mine: { pill: 'Claimed by you', ink: 'var(--accent)', line: 'oklch(0.70 0.15 162 / 0.35)', ring: 'inset 0 0 0 2px var(--accent)' },
  sent: { pill: 'In review', ink: 'var(--status-queued)', line: 'var(--line-soft)', ring: 'none' },
  taken: { pill: 'Claimed', ink: 'var(--fg-4)', line: 'var(--line-soft)', ring: 'inset 0 0 0 1px var(--line-faint)' },
  approved: { pill: 'Approved', ink: 'var(--accent)', line: 'oklch(0.70 0.15 162 / 0.35)', ring: 'none' },
};

interface CardCtx {
  now: number;
  money: (inr: number) => string;
  ownerName?: string;
  /** Client view on. */
  people: boolean;
  liveTaskId: string | null;
  liveSince: number;
  liveSegment: number;
  /** Outsourcing on. */
  worker?: WorkerCtx;
  submissions: Record<string, ShareSubmission>;
  claims: readonly string[];
}

function TaskCard({ task, ctx, hue, index, standalone = false }: {
  task: PublicTask;
  ctx: CardCtx;
  /** The client view's phase colour, or `null`. */
  hue: number | null;
  index: number;
  /** A link to this one task: the hero already carries its title. */
  standalone?: boolean;
}) {
  const sub = ctx.submissions[task.id];
  const phase = ctx.worker ? workPhase(task, sub, ctx.claims) : null;
  const read = task.done ? READ_STATE.done : task.status === 'in-progress' ? READ_STATE.progress : READ_STATE.next;
  const look = phase ? { ...WORK_STATE[phase], bar: 'var(--accent)' } : read;
  const busy = phase ? phase === 'mine' || phase === 'sent' : task.status === 'in-progress' && !task.done;
  const due = dueLine(task, ctx.now);
  const running = ctx.people && ctx.liveTaskId === task.id;

  /* The client view's who-and-how-long line. Only his own time is known: the
     focus log is his, and so is the run. */
  const spent = (task.spentSeconds ?? 0) + (running ? Math.max(0, (ctx.now - ctx.liveSegment) / 1000) : 0);
  const whoName = task.assigneeName
    ?? (task.assignedToOwner || spent > 0 || running ? ctx.ownerName : undefined);
  const spentText = spent >= 60 ? (task.done ? `Took ${durationText(spent)}` : `${durationText(spent)} so far`) : null;
  const showWho = ctx.people && (whoName || spentText || running);

  const tint = hue !== null
    ? `linear-gradient(155deg, ${hueOf(hue, busy ? 0.12 : 0.06)}, ${hueOf(hue, 0.01)} 60%), `
    : '';
  const dotDone = phase ? phase === 'sent' || phase === 'approved' : task.done;
  const dotFill = phase === 'sent' ? 'var(--status-queued)' : 'var(--accent)';
  const value = task.valueINR ? ctx.money(task.valueINR) : null;
  const indent = standalone ? 0 : 'calc(22px + var(--sp-4))';

  return (
    <article
      style={{
        display: 'grid', gap: 'var(--sp-4)', padding: 'var(--sp-6)', borderRadius: 'var(--r-card)',
        backgroundImage: `${tint}${busy ? 'var(--glass-fill-2)' : 'var(--glass-fill-1)'}`,
        WebkitBackdropFilter: 'var(--glass-bd-sm)', backdropFilter: 'var(--glass-bd-sm)',
        boxShadow: busy ? 'var(--glass-rim-2), var(--glass-cast-1)' : 'var(--glass-rim-1)',
        ...enter(index),
      }}
    >
      {!standalone && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-4)' }}>
          <span
            aria-hidden="true"
            style={{
              flex: '0 0 auto', marginTop: 1, display: 'grid', placeItems: 'center', width: 22, height: 22,
              borderRadius: 'var(--r-circle)', color: 'var(--void-0)',
              background: dotDone ? dotFill : 'transparent', boxShadow: look.ring,
            }}
          >
            {dotDone && <Icon name="check" size={12} stroke={2} style={{ color: 'inherit' }} />}
          </span>
          <span style={{ flex: 1, minWidth: 0, display: 'grid', gap: 'var(--sp-2)' }}>
            <span
              style={{
                font: 'var(--type-body)', color: task.done || phase === 'taken' ? 'var(--fg-2)' : 'var(--fg-1)',
                textWrap: 'pretty', overflowWrap: 'anywhere',
              }}
            >
              {task.title}
            </span>
          </span>
          {value && (
            <span style={{ flex: '0 0 auto', display: 'grid', justifyItems: 'end', gap: 1 }}>
              <span style={{ font: 'var(--type-numeric)', fontSize: 'var(--text-sm)', color: 'var(--fg-1)', fontVariantNumeric: 'tabular-nums' }}>
                {value}
              </span>
              {phase && <span style={KICKER}>payout</span>}
            </span>
          )}
        </div>
      )}

      {task.description && (
        <p
          style={{
            paddingLeft: indent, font: 'var(--type-caption)', fontSize: 'var(--text-sm)', color: 'var(--fg-3)',
            whiteSpace: 'pre-wrap', textWrap: 'pretty', overflowWrap: 'anywhere',
          }}
        >
          {task.description}
        </p>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--sp-2) var(--sp-5)', paddingLeft: indent }}>
        <Pill ink={look.ink} line={look.line}>{look.pill}</Pill>
        {due && <MetaItem icon="calendar" ink={due.late ? 'var(--status-review)' : 'var(--fg-3)'}>{due.text}</MetaItem>}
        {task.estimatedTime ? <MetaItem icon="clock">{estimateText(task.estimatedTime)}</MetaItem> : null}
        {task.subtaskTotal > 0 && (
          <MetaItem>
            {phase ? `${task.subtaskTotal} ${task.subtaskTotal === 1 ? 'deliverable' : 'deliverables'}` : `${task.subtaskDone} / ${task.subtaskTotal}`}
          </MetaItem>
        )}
      </div>

      {showWho && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3) var(--sp-4)', flexWrap: 'wrap', paddingLeft: indent }}>
          {whoName && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
              <Avatar name={whoName} size={26} hue={hueOf(hue ?? 0)} />
              <span style={{ font: 'var(--type-caption)', fontSize: 'var(--text-sm)', color: 'var(--fg-2)', whiteSpace: 'nowrap' }}>
                {whoName}
              </span>
            </span>
          )}
          {running && (
            <span
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-2)', height: 26, padding: '0 var(--sp-3)',
                borderRadius: 'var(--r-pill)', background: LIVE_FILL, boxShadow: LIVE_RING,
                font: 'var(--type-numeric)', fontSize: 'var(--text-xs)', color: 'var(--accent-lift)',
                fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
              }}
            >
              <Pulse />
              {clockText((ctx.now - ctx.liveSince) / 1000)} · running
            </span>
          )}
          {spentText && <MetaItem>{spentText}</MetaItem>}
        </div>
      )}

      {task.subtasks && task.subtasks.length > 0 && (
        <div style={{ display: 'grid', gap: 'var(--sp-3)', paddingLeft: indent }}>
          {!phase && task.subtaskTotal > 0 && (
            <Track value={task.subtaskDone / task.subtaskTotal} height={4} fill={read.bar} />
          )}
          <SubtaskList
            subs={task.subtasks}
            heading={phase ? 'What to deliver' : undefined}
            allDone={phase === 'sent' || phase === 'approved'}
          />
        </div>
      )}

      {ctx.worker && phase && <WorkArea task={task} phase={phase} sub={sub} worker={ctx.worker} />}
    </article>
  );
}

// ─── Page states ─────────────────────────────────────────────────────────────

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="ag-page h-screen overflow-y-auto">
      <main
        style={{
          maxWidth: 760, margin: '0 auto', boxSizing: 'border-box',
          padding: 'var(--sp-9) clamp(16px, 4vw, var(--gutter-page)) var(--sp-10)',
          display: 'grid', gap: 'var(--sp-9)',
        }}
      >
        {children}
      </main>
    </div>
  );
}

/** A link its owner closed, took down, or that never was one. */
function ClosedCard({ ownerName, closedOn }: { ownerName?: string; closedOn?: number }) {
  return (
    <section style={{ minHeight: '70vh', display: 'grid', alignContent: 'center' }}>
      <div
        style={{
          display: 'grid', justifyItems: 'center', gap: 'var(--sp-7)', padding: 'var(--sp-10) var(--sp-7)',
          borderRadius: 'var(--r-card-lg)', textAlign: 'center',
          backgroundImage: 'var(--glass-fill-2)',
          WebkitBackdropFilter: 'var(--glass-bd-md)', backdropFilter: 'var(--glass-bd-md)',
          boxShadow: 'var(--glass-shadow-pane)', ...enter(0),
        }}
      >
        <span
          aria-hidden="true"
          style={{
            display: 'grid', placeItems: 'center', width: 64, height: 64, borderRadius: 'var(--r-circle)',
            backgroundImage: 'var(--glass-well)', boxShadow: 'var(--glass-well-shadow)', color: 'var(--fg-3)',
          }}
        >
          <Icon name="unlink" size={24} style={{ color: 'inherit' }} />
        </span>
        <div style={{ display: 'grid', gap: 'var(--sp-3)', justifyItems: 'center' }}>
          <span style={KICKER}>{ownerName ?? 'BASE'}</span>
          <h1 style={{ font: 'var(--type-display)', fontSize: 'clamp(28px, 7vw, var(--text-2xl))', letterSpacing: 'var(--tracking-title)', color: 'var(--fg-1)' }}>
            This link has closed.
          </h1>
          <p style={{ maxWidth: '36ch', font: 'var(--type-body)', color: 'var(--fg-3)', textWrap: 'pretty' }}>
            {closedOn
              ? `It was open until ${longDate(closedOn)}. The work itself is untouched.`
              : 'It was turned off, or it was never a working link. Ask whoever sent it for a new one.'}
          </p>
        </div>
      </div>
    </section>
  );
}

function SummaryCard({ summary, currency, setCurrency, rate, usd }: {
  summary: Summary;
  currency: Currency;
  setCurrency: (c: Currency) => void;
  rate: number | null;
  usd: boolean;
}) {
  const showTrack = summary.progress > 0 || summary.stats.some((s) => s.key === 'progress');
  return (
    <div
      style={{
        display: 'grid', gap: 'var(--sp-6)', padding: 'var(--pad-card)', borderRadius: 'var(--r-card-lg)',
        backgroundImage: 'var(--glass-fill-2)',
        WebkitBackdropFilter: 'var(--glass-bd-md)', backdropFilter: 'var(--glass-bd-md)',
        boxShadow: 'var(--glass-shadow-pane)',
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 'var(--sp-6) var(--sp-5)' }}>
        {summary.stats.map((st) => (
          <div key={st.key} style={{ display: 'grid', gap: 'var(--sp-2)', alignContent: 'start', minWidth: 0 }}>
            <span style={KICKER}>{st.label}</span>
            <span style={{ font: 'var(--type-numeric)', fontSize: 'var(--text-md)', color: 'var(--fg-1)', fontVariantNumeric: 'tabular-nums' }}>
              {st.value}
            </span>
            <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', textWrap: 'pretty', overflowWrap: 'anywhere' }}>{st.sub}</span>
          </div>
        ))}
      </div>
      {(showTrack || summary.hasMoney) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-5)', flexWrap: 'wrap' }}>
          {showTrack ? <Track value={summary.progress} height={6} /> : <span style={{ flex: 1 }} />}
          {summary.hasMoney && (
            <div
              role="group"
              aria-label="Currency"
              style={{
                display: 'flex', gap: 2, padding: 3, borderRadius: 'var(--r-pill)',
                backgroundImage: 'var(--glass-well)', boxShadow: 'var(--glass-well-shadow)',
              }}
            >
              {(['INR', 'USD'] as Currency[]).map((c) => {
                const on = currency === c;
                return (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={on}
                    aria-label={c === 'INR' ? 'Show amounts in rupees' : 'Show amounts in US dollars'}
                    onClick={() => setCurrency(c)}
                    style={{
                      minWidth: 56, height: 36, padding: '0 var(--sp-4)', border: 0, cursor: 'pointer',
                      borderRadius: 'var(--r-pill)', whiteSpace: 'nowrap',
                      backgroundColor: 'transparent',
                      backgroundImage: on ? 'var(--glass-fill-solid)' : 'none',
                      boxShadow: on ? 'var(--glass-rim-3), var(--glass-cast-1)' : 'none',
                      color: on ? 'var(--fg-1)' : 'var(--fg-3)',
                      font: 'var(--type-numeric)', fontSize: 'var(--text-sm)', transition: 'var(--t-hover)',
                    }}
                  >
                    {c === 'INR' ? '₹ INR' : '$ USD'}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
      {usd && rate !== null && (
        <span style={{ marginTop: 'calc(var(--sp-3) * -1)', font: 'var(--type-caption)', color: 'var(--fg-4)' }}>
          Converted at ₹{(1 / rate).toFixed(2)} to $1.
        </span>
      )}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function SharePage() {
  const { shareId } = useParams<{ shareId: string }>();
  const [liveShare, setShare] = useState<PublicShareDoc | null>(null);
  const [liveStatus, setStatus] = useState<'loading' | 'ready' | 'notfound' | 'error'>('loading');
  const { currency, setCurrency, money, rate, usd } = useCurrency();

  const [liveSubmissions, setSubmissions] = useState<Record<string, ShareSubmission>>({});
  const [workerName, setWorkerName] = useState(loadWorkerName);
  const [workerEmail, setWorkerEmail] = useState(loadWorkerEmail);
  const [liveClaims, setClaims] = useState<string[]>(() => (shareId ? loadClaims(shareId) : []));
  const [openForm, setOpenForm] = useState<string | null>(null);

  /*
   * Dev-only, and stripped from every production build — see
   * `lib/devShareFixture.ts`. The screenshot harness aborts everything off
   * localhost, so a real `onSnapshot` never calls back under it and this page
   * could not otherwise be photographed at all.
   *
   * It is read during RENDER and derived over, never written into state from an
   * effect: a synchronous `setState` in an effect body is a cascading render
   * (`react-hooks/set-state-in-effect`), and the live path below then stays
   * exactly the code it was — the fixture adds an early return to each effect.
   */
  const fixture = shareId ? devShareFixture(shareId) : null;
  /** Stable across renders, unlike `fixture` itself, so it can be an effect dep. */
  const usingFixture = fixture !== null;

  const share = fixture ? fixture.share : liveShare;
  const status = fixture ? 'ready' : liveStatus;

  useEffect(() => {
    if (!shareId || usingFixture) return;
    const unsub = onSnapshot(
      doc(db, 'publicShares', shareId),
      (snap) => {
        if (!snap.exists()) { setStatus('notfound'); setShare(null); return; }
        setShare(snap.data() as PublicShareDoc);
        setStatus('ready');
      },
      () => setStatus('error'),
    );
    return unsub;
  }, [shareId, usingFixture]);

  const contributionsOn = !!share?.allowContributions && !share.expired;
  useEffect(() => {
    if (!shareId || !contributionsOn || usingFixture) return;
    return subscribeSubmissions(shareId, (subs) => {
      const map: Record<string, ShareSubmission> = {};
      for (const s of subs) map[s.taskId] = s;
      setSubmissions(map);
    });
  }, [shareId, contributionsOn, usingFixture]);

  // Derived rather than cleared in the effect: while contributions are off the
  // share has no submissions to show, and whatever the last subscription left
  // behind must not leak through.
  const submissions = fixture ? fixture.submissions : contributionsOn ? liveSubmissions : NO_SUBMISSIONS;
  const claims = fixture ? fixture.claims : liveClaims;

  // A clock only while one is on screen; otherwise the moment the page loaded.
  // The fixture's own frozen one wins, for a baseline with a timer in it.
  const ticking = useNow(!fixture?.now && !!share?.showPeople && !!share.live);
  const now = fixture?.now ?? ticking;

  if (status === 'loading') {
    return (
      <Shell>
        {/* The shape of what is coming. One live region; the bars inside it are
            hidden, or it would announce "loading" once per bar. */}
        <div role="status" aria-busy="true" aria-label="Loading this shared view" style={{ display: 'grid', gap: 'var(--sp-7)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)' }}>
            <Skeleton aria-hidden="true" width={40} height={40} radius="var(--r-circle)" />
            <Skeleton aria-hidden="true" lines={2} height={12} lastLineWidth="40%" style={{ flex: 1 }} />
          </div>
          <Skeleton aria-hidden="true" height={34} width="70%" />
          <Skeleton aria-hidden="true" height={140} radius="var(--r-card-lg)" />
          <Skeleton aria-hidden="true" height={120} radius="var(--r-card)" />
        </div>
      </Shell>
    );
  }

  if (status === 'notfound') return <Shell><ClosedCard /></Shell>;

  if (status === 'error' || !share) {
    return (
      <Shell>
        <section style={{ minHeight: '70vh', display: 'grid', alignContent: 'center', justifyItems: 'center', gap: 'var(--sp-4)', textAlign: 'center' }}>
          <h1 style={{ font: 'var(--type-title)', color: 'var(--fg-1)' }}>This page did not load.</h1>
          <p style={{ maxWidth: '40ch', font: 'var(--type-body)', color: 'var(--fg-3)', textWrap: 'pretty' }}>
            The connection dropped or the service is busy. Reload in a minute; the link itself is fine.
          </p>
        </section>
      </Shell>
    );
  }

  if (isClosed(share, now)) {
    return <Shell><ClosedCard ownerName={share.ownerName} closedOn={share.expiresAt !== undefined ? share.expiresAt - 1 : undefined} /></Shell>;
  }

  const tasks = shareTasks(share);
  const people = !!share.showPeople && !contributionsOn;
  const live = people ? liveRunShown(share, now) : null;
  const liveTask = live ? tasks.find((t) => t.id === live.taskId) : undefined;
  const cover = people ? share.project?.coverUrl : undefined;
  const lists = share.project?.lists ?? [];

  const worker: WorkerCtx | undefined = contributionsOn && shareId
    ? {
        shareId,
        ownerName: share.ownerName,
        name: workerName,
        email: workerEmail,
        setName: (v) => { setWorkerName(v); saveWorkerName(v.trim()); },
        setEmail: (v) => { setWorkerEmail(v); saveWorkerEmail(v.trim()); },
        openForm,
        setOpenForm,
        refreshClaims: () => setClaims(loadClaims(shareId)),
      }
    : undefined;

  const ctx: CardCtx = {
    now, money, ownerName: share.ownerName, people,
    liveTaskId: live?.taskId ?? null, liveSince: live?.since ?? 0, liveSegment: live?.segmentStartedAt ?? 0,
    worker, submissions, claims,
  };

  const summary = contributionsOn ? workSummary(tasks, submissions, now, money) : readSummary(tasks, now, money);

  const kicker = contributionsOn
    ? 'Open work'
    : share.type === 'project' ? 'Project' : share.type === 'list' ? 'Task list' : 'Task';
  const subtitle = share.type === 'project' ? share.subtitle?.trim() : undefined;
  const lede = subtitle || (contributionsOn
    ? 'Claim a task, do the work, send a link. No account needed.'
    : people
      ? 'Where the work stands, who is on it, and how long it has taken.'
      : 'Where the work stands today, what it costs, and what is next.');
  const modeLine = contributionsOn ? 'Open to anyone with this link' : people ? 'Client view' : 'View only';
  const minutesAgo = Math.max(0, Math.round((now - share.updatedAt) / 60000));
  const updated = minutesAgo < 1 ? 'Updated just now'
    : minutesAgo < 60 ? `Updated ${minutesAgo} min ago`
      : minutesAgo < 60 * 24 ? `Updated ${Math.round(minutesAgo / 60)} h ago`
        : `Updated ${longDate(share.updatedAt)}`;

  /* Sections: a project's lists, or the one list or task the link is for. A
     list or task needs no heading of its own — the hero is its heading. */
  const groups = share.type === 'project'
    ? lists.map((l, i) => ({ id: l.id, name: l.title, tasks: l.tasks, hue: people ? i : null }))
    : [{ id: 'only', name: null as string | null, tasks, hue: null as number | null }];
  let cardIndex = 2;

  const footLine = [
    contributionsOn
      ? `Tasks from ${share.ownerName ?? 'the owner'}.`
      : 'View only.',
    share.expiresAt !== undefined ? `Link open until ${longDate(share.expiresAt - 1)}.` : 'It updates as the work moves.',
  ].join(' ');

  return (
    <Shell>
      <header style={{ display: 'grid', gap: 'var(--sp-7)', ...enter(0) }}>
        {cover && (
          <div
            style={{
              position: 'relative', height: 'clamp(168px, 32vw, 280px)', borderRadius: 'var(--r-card-lg)', overflow: 'hidden',
              backgroundImage: 'var(--glass-well)', boxShadow: 'var(--glass-rim-2), var(--glass-cast-1)',
            }}
          >
            <img src={cover} alt="" style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} />
            {/* The phases, each as wide as its share of the tasks. */}
            <div aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 6, display: 'flex' }}>
              {lists.map((l, i) => l.tasks.length > 0 && (
                <span key={l.id} style={{ flex: l.tasks.length, background: hueOf(i) }} />
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
          <Avatar name={share.ownerName} size={40} />
          <span style={{ flex: '1 1 160px', minWidth: 0, display: 'grid', gap: 1 }}>
            <span style={{ font: 'var(--type-label)', color: 'var(--fg-1)' }}>{share.ownerName ?? 'Shared from BASE'}</span>
            <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)' }}>{modeLine}</span>
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-2)', font: 'var(--type-numeric)', fontSize: 'var(--text-xs)', color: 'var(--fg-3)', whiteSpace: 'nowrap' }}>
            <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 'var(--r-circle)', background: 'var(--accent)', boxShadow: '0 0 8px var(--accent)' }} />
            {updated}
          </span>
        </div>

        <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
          <span style={{ ...KICKER, color: 'var(--fg-3)' }}>{kicker}</span>
          <h1
            style={{
              font: 'var(--type-display)', fontSize: 'clamp(30px, 7.5vw, var(--text-2xl))',
              letterSpacing: 'var(--tracking-title)', color: 'var(--fg-1)', textWrap: 'balance', overflowWrap: 'anywhere',
            }}
          >
            {share.title}
          </h1>
          <p style={{ maxWidth: '52ch', font: 'var(--type-body)', color: 'var(--fg-3)', textWrap: 'pretty', overflowWrap: 'anywhere' }}>
            {lede}
          </p>
        </div>

        {tasks.length > 0 && (
          <SummaryCard summary={summary} currency={currency} setCurrency={setCurrency} rate={rate} usd={usd} />
        )}

        {live && liveTask && (
          <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
            <span style={{ ...KICKER, color: 'var(--fg-3)' }}>Working now</span>
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', flexWrap: 'wrap', minHeight: 60,
                padding: 'var(--sp-3) var(--sp-5) var(--sp-3) var(--sp-3)', borderRadius: 'var(--r-pill)',
                backgroundImage: 'linear-gradient(90deg, oklch(0.70 0.15 162 / 0.10), oklch(0.70 0.15 162 / 0.02)), var(--glass-fill-1)',
                boxShadow: 'inset 0 0 0 1px oklch(0.70 0.15 162 / 0.25)',
              }}
            >
              <Avatar name={share.ownerName} size={40} hue="var(--accent)" />
              <span style={{ flex: '1 1 160px', minWidth: 0, display: 'grid', gap: 1 }}>
                <span style={{ font: 'var(--type-label)', color: 'var(--fg-1)' }}>{share.ownerName ?? 'In focus'}</span>
                <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', overflowWrap: 'anywhere' }}>on {liveTask.title}</span>
              </span>
              <span
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-3)', whiteSpace: 'nowrap',
                  font: 'var(--type-numeric)', fontSize: 'var(--text-md)', color: 'var(--accent-lift)', fontVariantNumeric: 'tabular-nums',
                }}
              >
                <Pulse />
                {clockText((now - live.since) / 1000)}
              </span>
            </div>
          </div>
        )}

        {contributionsOn && (
          <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 'var(--sp-3)' }}>
            {[
              { n: '01', t: 'Claim', d: 'Your name and email. It shows as yours.' },
              { n: '02', t: 'Deliver', d: 'Send a link to the files.' },
              { n: '03', t: 'Get paid', d: `Once ${share.ownerName ?? 'the owner'} approves it.` },
            ].map((s) => (
              <li key={s.n} style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-4)', padding: 'var(--sp-5)', borderRadius: 'var(--r-lg)', boxShadow: 'inset 0 0 0 1px var(--line-faint)' }}>
                <span style={{ font: 'var(--type-numeric)', fontSize: 'var(--text-xs)', color: 'var(--fg-4)', paddingTop: 2 }}>{s.n}</span>
                <span style={{ display: 'grid', gap: 2 }}>
                  <span style={{ font: 'var(--type-label)', color: 'var(--fg-1)' }}>{s.t}</span>
                  <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', textWrap: 'pretty' }}>{s.d}</span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </header>

      {tasks.length === 0 ? (
        <section
          style={{
            display: 'grid', gap: 'var(--sp-7)', padding: 'var(--sp-9) var(--sp-7)', borderRadius: 'var(--r-card-lg)',
            boxShadow: 'inset 0 0 0 1px var(--line-faint)', background: 'oklch(0 0 0 / 0.18)', ...enter(1),
          }}
        >
          <div aria-hidden="true" style={{ display: 'grid', gap: 'var(--sp-3)' }}>
            {[1, 0.6, 0.3].map((o) => (
              <div key={o} style={{ height: 64, borderRadius: 'var(--r-md)', backgroundImage: 'var(--glass-well)', boxShadow: 'var(--glass-well-shadow)', opacity: o }} />
            ))}
          </div>
          <div style={{ display: 'grid', gap: 'var(--sp-2)', justifyItems: 'center', textAlign: 'center' }}>
            <span style={{ font: 'var(--type-title)', letterSpacing: 'var(--tracking-title)', color: 'var(--fg-1)' }}>Nothing planned yet.</span>
            <span style={{ maxWidth: '40ch', font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-3)', textWrap: 'pretty' }}>
              Tasks appear here as {share.ownerName ?? 'the owner'} plans them. Same link, no need to ask again.
            </span>
          </div>
        </section>
      ) : (
        groups.map((g) => {
          if (g.tasks.length === 0 && g.name === null) return null;
          const done = g.tasks.filter((t) => t.done).length;
          const minutes = g.tasks.reduce((a, t) => a + (t.estimatedTime ?? 0), 0);
          const open = contributionsOn ? g.tasks.filter((t) => workPhase(t, submissions[t.id], claims) === 'open').length : 0;
          const sub = contributionsOn
            ? `${open} open`
            : `${done} of ${g.tasks.length} done${minutes > 0 ? ` · ${estimateText(minutes)}` : ''}`;
          return (
            <section key={g.id} style={{ display: 'grid', gap: 'var(--sp-4)' }}>
              {g.name !== null && (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-4)', padding: '0 var(--sp-2)', flexWrap: 'wrap' }}>
                  {g.hue !== null && (
                    <span aria-hidden="true" style={{ alignSelf: 'center', width: 10, height: 10, borderRadius: 'var(--r-circle)', background: hueOf(g.hue), boxShadow: `0 0 10px ${hueOf(g.hue)}` }} />
                  )}
                  <h2 style={{ font: 'var(--type-label)', color: 'var(--fg-1)', overflowWrap: 'anywhere' }}>{g.name}</h2>
                  <span style={{ font: 'var(--type-numeric)', fontSize: 'var(--text-xs)', color: 'var(--fg-4)' }}>{sub}</span>
                </div>
              )}
              <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
                {g.tasks.length === 0 ? (
                  <p style={{ padding: 'var(--sp-5) var(--sp-2)', font: 'var(--type-caption)', color: 'var(--fg-4)' }}>Nothing in this list yet.</p>
                ) : (
                  g.tasks.map((t) => (
                    <TaskCard
                      key={t.id}
                      task={t}
                      ctx={ctx}
                      hue={g.hue}
                      index={cardIndex++}
                      standalone={share.type === 'task'}
                    />
                  ))
                )}
              </div>
            </section>
          );
        })
      )}

      <footer
        style={{
          display: 'grid', gap: 'var(--sp-3)', justifyItems: 'center', textAlign: 'center',
          padding: 'var(--sp-7) 0 var(--sp-4)', borderTop: '1px solid var(--line-faint)',
        }}
      >
        <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', textWrap: 'pretty' }}>{footLine}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-2)', font: 'var(--type-numeric)', fontSize: 'var(--text-xs)', color: 'var(--fg-4)' }}>
          <img src="/brand/mark-white.png" alt="" width={14} height={14} style={{ display: 'block', opacity: 0.8 }} />
          Shared from BASE
        </span>
      </footer>
    </Shell>
  );
}
