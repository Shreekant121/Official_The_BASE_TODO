/**
 * Score — the session bar (UI-30). Was `AttentionHeader.tsx`.
 *
 * RECONCILED against `screens/scoring.html:900`. UI-9 built this screen's
 * header as a three-tier `--r-card` pane carrying where-you-are, the subject
 * and the queue. The source splits those into three separate objects with
 * three different jobs, and only the first of them is chrome:
 *
 *   1. this bar — a PILL, sticky at the top, the session's own state
 *   2. the queue strip, loose under it
 *   3. the subject, which is page content and not chrome at all
 *   4. …and the two verbs, which move to a sticky bar at the BOTTOM
 *
 * That is why this file lost two thirds of its contents rather than gaining
 * anything: the title, the Needs row, the score and the Previous/Skip/Save
 * buttons all live somewhere else now. See `Subject.tsx` and `CommitBar.tsx`.
 *
 * **"Needs attention" is the system voice here.** `--type-system` with
 * `--tracking-system` — bold sans at 0.30em — which `readme.md` reserves for
 * machine states and rations to *"no more than one per screen"*. This screen
 * spends it here and nowhere else. It was `--type-kicker` in `--fg-3`, which
 * is the label treatment, and made the one thing naming the mode quieter than
 * the field labels under it.
 *
 * **`SparkBars` is gone and the progress bar is back**, which reverses UI-9's
 * call. That session replaced a `position / total` bar with one bar per task,
 * height = its score, on the argument that the fraction was already printed
 * beside it in digits. The argument was right about the old bar and wrong
 * about the answer: the source's queue strip puts a **`ScoreDial` on every
 * task**, so the score profile is not merely visible, it is legible and
 * attached to the task it describes — which a 3px anonymous bar never was.
 * With that in place the bar goes back to being what a session bar's bar is:
 * how far through you are. Emerald is not loose here — a session in progress
 * is `readme.md`'s "live", the one thing the accent is for.
 */
import { Button, Icon, RollingNumber, SoftIconButton } from '../../ui';
import { AskAtlasBar } from '../../ui/overlay/AskAtlasBar';

interface SessionBarProps {
  position: number;
  total: number;
  remaining: number;
  onBack: () => void;
  onEndSession: () => void;
  /** BUILD-4: whether the AI panel is open on this task, and opening it (29-1P15c: the Ask Atlas bar). */
  asking: boolean;
  onAsk: () => void;
}

export default function SessionBar({
  position, total, remaining, onBack, onEndSession, asking, onAsk,
}: SessionBarProps) {
  const progress = total > 0 ? (position / total) * 100 : 0;

  return (
    <header
      style={{
        /*
         * Sticky INSIDE the page scroller, so the field panes slide past
         * behind its glass — the argument UI-9 made for this being a pane
         * rather than a toolbar, and the source keeps it.
         *
         * `zIndex` is load-bearing, and it is the lesson UI-7 paid for on the
         * Notifications page. Every glass surface has a `backdrop-filter`,
         * which makes it a stacking context, and stacking contexts without a
         * z-index paint in DOM order — so this bar, being the FIRST child,
         * would be painted over by every pane that scrolls up to meet it.
         */
        position: 'sticky',
        top: 'var(--sp-5)',
        zIndex: 2,
        display: 'flex', alignItems: 'center', gap: 'var(--sp-5)', flexWrap: 'wrap',
        padding: 'var(--sp-4) var(--sp-5) var(--sp-4) var(--sp-4)',
        borderRadius: 'var(--r-pill)',
        backgroundImage: 'var(--glass-fill-2)',
        backdropFilter: 'var(--glass-bd-lg)',
        WebkitBackdropFilter: 'var(--glass-bd-lg)',
        boxShadow: 'var(--glass-shadow-pane)',
        animation: 'var(--kf-condense) var(--dur-base) var(--ease-glass) both',
      }}
    >
      {/* Round soft since 29-1P2, as the board's and Focus's Back. */}
      <SoftIconButton label="Go back" onClick={onBack}>
        <Icon name="arrow-left" size={18} />
      </SoftIconButton>

      {/* Capitals in V3 too (V3-5): the system voice, not a kicker — v4's
          readme keeps it uppercase, as Focus's "FOCUS". */}
      <span
        style={{
          font: 'var(--type-system)', textTransform: 'uppercase',
          letterSpacing: 'var(--tracking-system)', color: 'var(--fg-1)',
          whiteSpace: 'nowrap', flex: '0 0 auto',
        }}
      >
        Needs attention
      </span>

      <span
        style={{
          display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', flex: '0 0 auto',
          font: 'var(--type-numeric)', fontSize: 'var(--text-sm)',
          fontVariantNumeric: 'tabular-nums', color: 'var(--fg-3)',
        }}
      >
        {/* 29-1P4c, idea 49: the counts roll as he moves through. */}
        <span style={{ color: 'var(--fg-1)' }}><RollingNumber value={position} /></span>
        <span>/<RollingNumber value={total} /></span>
      </span>

      <div
        role="progressbar"
        aria-label="Session progress"
        aria-valuenow={position}
        aria-valuemin={0}
        aria-valuemax={total}
        style={{
          flex: 1, minWidth: 120, height: 6, borderRadius: 'var(--r-pill)',
          backgroundImage: 'var(--glass-well)', boxShadow: 'var(--glass-well-shadow)',
          overflow: 'hidden',
        }}
      >
        <span
          style={{
            display: 'block', height: '100%', width: `${progress}%`,
            borderRadius: 'var(--r-pill)',
            background: 'linear-gradient(90deg, oklch(0.84 0.17 130 / 0.55), var(--job-lime))',
            boxShadow: '0 0 14px -2px var(--job-lime)',
            transition: 'width var(--dur-slow) var(--ease-glass)',
          }}
        />
      </div>

      <span
        style={{
          font: 'var(--type-caption)', color: 'var(--fg-3)',
          fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', flex: '0 0 auto',
        }}
      >
        <RollingNumber value={remaining} /> remaining
      </span>

      {/* BUILD-4 — his #13: "AI can ask me questions and score things itself
          based on my answers". Since 29-1P15c (idea 74, his call) the "Ask
          AI" button that sat here is the Ask Atlas bar, which grows into the
          panel and takes it back when it closes. Up here rather than at the
          foot, where every other screen's bar sits: this screen's foot is its
          Save bar and the nav, with no room for a third. Sunk into this pill
          as a well, the shape of a field, rather than glass on glass. */}
      <AskAtlasBar
        open={asking}
        onOpen={onAsk}
        label="Ask Atlas about this task"
        /* Out of the row while the panel is open: an empty slot pushed End
           session onto a second line. */
        collapse
        style={{
          flex: '0 1 240px', minWidth: 150, height: 44,
          backgroundImage: 'var(--glass-well)', boxShadow: 'var(--glass-well-shadow)',
        }}
      />

      <Button
        variant="ghost"
        size="sm"
        onClick={onEndSession}
        iconLeft={<Icon name="log-out" size={15} />}
        style={{ flex: '0 0 auto' }}
      >
        End session
      </Button>
    </header>
  );
}
