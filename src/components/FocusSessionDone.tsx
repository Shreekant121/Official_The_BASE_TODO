/**
 * "Session done" (29-1P11a, idea 105, after Apple Fitness and Strava): Focus's
 * end pane, when the queue is finished. It replaced UI-32's "Session
 * complete" / "Session ended" pane and keeps its report — the time the closed
 * tasks took as the loudest number, then one line per task — and adds what
 * the card asked for.
 *
 * His calls (2026-10-15):
 *   - **All four numbers**: the time, then subtasks ticked, ideas captured and
 *     pauses, this session's — all the run's since FIX-14 (`useFocusRun`), so
 *     a task closed from the pill or another screen is on the card too.
 *   - **Three ways on**: Another 25, Break, Done. **Another 25 starts the next
 *     best task** — the top of a 25-minute Smart Start, so a blocked task
 *     brings what it waits on first — with 25 minutes on it. **Break** is
 *     offered in pomodoro mode only, like every real break. **Done** goes to
 *     the Dashboard, where BASE opens.
 *   - It shows **only when the queue ends**; a pomodoro block ending offers a
 *     break on its own card (`FocusBreak.tsx`).
 *
 * A queue can also empty without closing anything (skips, a delete). That
 * keeps UI-32's quiet answer, "Queue cleared", with none of the report's
 * furniture — no glowing number, no counts — and the same three ways on.
 *
 * **A new best (29-1P14a, idea 108) is a gold row under the counts**, one per
 * record today beat — most focus in a day, most tasks, the longest run — with
 * who it beat. They are the day's, not the session's, so a "Queue cleared"
 * card shows them too. `LiveSessionDone` reads them; the card itself only
 * draws what it is handed, so `/design` can show it on pretend numbers.
 */
import { GelButton, Icon, Lit, LitLine, MetaKicker, NewBestBadge, SoftButton } from '../ui';
import { formatSpan } from '../lib/timeSpan';
import { bestWords, newBests, type Best } from '../lib/stats';
import { formatMinutes } from '../lib/dashboard/blockData';
import { useBests } from '../lib/dashboard/todayHours';

/** What Another 25 gives the next task. */
export const ANOTHER_SECONDS = 25 * 60;

export interface SessionDoneStats {
  subtasks: number;
  ideas: number;
  pauses: number;
}

interface SessionDoneProps {
  /** The tasks this session closed, in order, with the seconds each took. */
  log: Array<{ id: string; title: string; used: number }>;
  stats: SessionDoneStats;
  /** There is an open task for Another 25 to start. */
  canAnother: boolean;
  /** The break's length in pomodoro mode; `null` outside it (no Break). */
  breakMinutes: number | null;
  onAnother: () => void;
  onBreak: () => void;
  onDone: () => void;
  /** Today's new bests, in order; none draws nothing. */
  bests?: readonly Best[];
}

/** Seconds as the Dashboard's Hours block writes them, so the two agree. */
const asHours = (seconds: number) => formatMinutes(seconds / 60);

/** The card with today's new bests read live — what Focus mounts. */
export function LiveSessionDone(props: Omit<SessionDoneProps, 'bests'>) {
  const bests = newBests(useBests());
  return <FocusSessionDone {...props} bests={bests} />;
}

export function FocusSessionDone({
  log, stats, canAnother, breakMinutes, onAnother, onBreak, onDone, bests = [],
}: SessionDoneProps) {
  const closed = log.length > 0;
  const total = log.reduce((n, entry) => n + entry.used, 0);
  const counts: Array<[number, string, string]> = [
    [stats.subtasks, 'subtask ticked', 'subtasks ticked'],
    [stats.ideas, 'idea captured', 'ideas captured'],
    [stats.pauses, 'pause', 'pauses'],
  ];
  return (
    <div
      style={{
        width: '100%', maxWidth: 640,
        display: 'grid', gap: 'var(--sp-7)', justifyItems: 'center',
        padding: 'var(--sp-10) var(--pad-card-lg)',
        borderRadius: 'var(--r-card-lg)',
        backgroundImage: 'var(--glass-fill-2)',
        backdropFilter: 'var(--glass-bd-lg)',
        WebkitBackdropFilter: 'var(--glass-bd-lg)',
        boxShadow: closed
          ? 'var(--glass-shadow-pane), var(--job-lime-shine)'
          : 'var(--glass-shadow-pane)',
        animation: 'var(--kf-condense) var(--dur-slow) var(--ease-glass) both',
      }}
    >
      <MetaKicker icon="flag-triangle-right" tone={closed ? 'var(--job-lime)' : 'var(--fg-3)'}>
        {closed ? 'Session done' : 'Session ended'}
      </MetaKicker>

      {closed ? (
        <h1
          style={{
            font: 'var(--type-numeric)', fontSize: 'var(--text-5xl)', color: 'var(--fg-1)',
            fontVariantNumeric: 'tabular-nums', lineHeight: 1,
            textShadow: '0 0 34px oklch(0.84 0.17 130 / 0.4)',
          }}
        >
          {formatSpan(total)}
        </h1>
      ) : (
        <h1
          style={{
            font: 'var(--type-display)', fontSize: 'var(--text-3xl)',
            letterSpacing: 'var(--tracking-display)', color: 'var(--fg-1)',
          }}
        >
          Queue cleared
        </h1>
      )}

      <LitLine as="p" style={{ font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-3)', textAlign: 'center' }}>
        {closed
          ? `${log.length} ${log.length === 1 ? 'task' : 'tasks'} closed. Time spent on each, below.`
          : <><Lit>Nothing closed</Lit> this time. Every task is <Lit>still open</Lit> for next time.</>}
      </LitLine>

      {closed && (
        <div
          style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 'var(--sp-3)', width: '100%' }}
        >
          {counts.map(([n, one, many], i) => (
            <div
              key={many}
              style={{
                display: 'grid', justifyItems: 'center', gap: 'var(--sp-1)',
                padding: 'var(--sp-4) var(--sp-3)', borderRadius: 'var(--r-sm)',
                backgroundImage: 'var(--glass-fill-1)', boxShadow: 'var(--glass-rim-1)',
                /* One after another, once, as the card lands (the idea's pop). */
                animation: 'var(--kf-condense) var(--dur-slow) var(--ease-glass) both',
                animationDelay: `calc(var(--dur-base) + ${i * 90}ms)`,
              }}
            >
              <span
                style={{
                  font: 'var(--type-numeric)', fontSize: 'var(--text-2xl)', color: 'var(--fg-1)',
                  fontVariantNumeric: 'tabular-nums', lineHeight: 1,
                }}
              >
                {n}
              </span>
              <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', textAlign: 'center' }}>
                {n === 1 ? one : many}
              </span>
            </div>
          ))}
        </div>
      )}

      {bests.length > 0 && (
        <div style={{ display: 'grid', gap: 'var(--sp-2)', width: '100%' }}>
          {bests.map((best) => {
            const words = bestWords(best, asHours);
            return (
              <div
                key={best.kind}
                data-session-best={best.kind}
                style={{
                  display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--sp-2) var(--sp-4)',
                  minHeight: 44, padding: 'var(--sp-2) var(--sp-5)', borderRadius: 'var(--r-sm)',
                  backgroundColor: 'var(--job-gold-tag)',
                  boxShadow: 'inset 0 0 0 1px oklch(0.8 0.16 82 / 0.35)',
                }}
              >
                <NewBestBadge />
                <span style={{ flex: 1, minWidth: 0, font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--job-gold-tag-fg)' }}>
                  {words.headline}
                </span>
                <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)' }}>{words.beat}</span>
              </div>
            );
          })}
        </div>
      )}

      {closed && (
        <div style={{ display: 'grid', gap: 'var(--sp-2)', width: '100%' }}>
          {log.map((entry) => (
            <div
              key={entry.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', minHeight: 44,
                padding: '0 var(--sp-5)', borderRadius: 'var(--r-sm)',
                backgroundImage: 'var(--glass-fill-1)', boxShadow: 'var(--glass-rim-1)',
              }}
            >
              <span style={{ display: 'flex', color: 'var(--job-lime)', flex: '0 0 auto' }}>
                <Icon name="check" size={15} />
              </span>
              <span
                className="flex-1 min-w-0 truncate"
                style={{ font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-2)' }}
              >
                {entry.title}
              </span>
              <span
                style={{
                  font: 'var(--type-numeric)', fontSize: 'var(--text-xs)', color: 'var(--fg-3)',
                  fontVariantNumeric: 'tabular-nums', flex: '0 0 auto',
                }}
              >
                {formatSpan(entry.used)}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-center" style={{ gap: 'var(--sp-4)' }}>
        {canAnother && (
          <GelButton colour="orange" tile={false} size="md" onClick={onAnother}>
            Another 25
          </GelButton>
        )}
        {breakMinutes !== null && (
          <GelButton colour="teal" tile={false} size="md" onClick={onBreak}>
            Break · {breakMinutes} min
          </GelButton>
        )}
        <SoftButton onClick={onDone}>Done</SoftButton>
      </div>
    </div>
  );
}
