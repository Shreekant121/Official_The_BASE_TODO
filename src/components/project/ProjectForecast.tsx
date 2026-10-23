/**
 * The project header's "40% done", and what folds down behind it (29-1P9b,
 * ideas 155 and 156, his picks 2026-10-14 on `docs/design/project-header.html`).
 *
 *   - **C, behind "40% done".** The glowing words became a button with the
 *     day it lands beside them; a press folds the milestone line and the
 *     chart down inside the island, and folds them away again. Open or shut
 *     is remembered per project on this device. Nothing is built until the
 *     first open (hidden UI is built on first open), and once built it stays.
 *   - **B, a milestone waits on what is linked to it**: its own "Depends on".
 *     Tapping a milestone lists those tasks; tapping one opens its sheet.
 *   - **C, the deadline is the project's own Finish by**, set here or in the
 *     edit sheet on Home. Without one the chart has no coral line and the
 *     words never say "late".
 *
 * The chart is the last four weeks of tasks done (lime) carried on at the
 * last two weeks' pace (dotted) to the day it lands, and a finger or the
 * mouse run along it reads any day (idea 10, a curve you can scrub). Its
 * strokes are an SVG stretched to the box (`vector-effect` keeps their
 * width); its words and dots are HTML laid over it by percentage, so nothing
 * is measured on the way in and no text is squashed.
 *
 * Colours by job: done and the current milestone lime, Finish by and late
 * coral, dates sky. Nothing here moves at rest.
 */
import { useState, type CSSProperties, type PointerEvent } from 'react';
import { Icon, IconButton, Input, SoftButton } from '../../ui';
import {
  addDays, daysFrom, finishPhrase, forecastDoneBy, longDay, milestoneDay, shortDay,
  type FinishTone, type Milestone,
} from '../../lib/projectForecast';
import type { Task } from '../../store/useStore';
import type { ForecastModel } from './useForecast';

const TONE: Record<FinishTone, string> = {
  early: 'var(--job-lime)',
  on: 'var(--job-lime)',
  late: 'var(--job-coral)',
  plain: 'var(--fg-2)',
};

const MONO: CSSProperties = { font: 'var(--type-numeric)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };

/** "40% done · Done 12 Nov ▾" — the island's button. */
export function ForecastButton({ progress, model, open, onToggle }: {
  progress: number;
  model: ForecastModel;
  open: boolean;
  onToggle: () => void;
}) {
  const phrase = finishPhrase(model.forecast, model.today);
  return (
    <SoftButton
      size="sm"
      aria-expanded={open}
      aria-label={`${progress}% done${phrase ? `, ${phrase.text}${phrase.detail ? `, ${phrase.detail}` : ''}` : ''}. ${open ? 'Hide' : 'Show'} milestones and when it will be done`}
      onClick={onToggle}
      style={{ flex: '0 1 auto', minWidth: 0 }}
    >
      {/* The ring, as words (OPT-6, his ask): lime, done's colour job. */}
      <span style={{ ...MONO, font: 'var(--type-title)', color: 'var(--job-lime)', textShadow: 'var(--text-glow-lime)' }}>
        {progress}% done
      </span>
      {phrase && (
        <span style={{ ...MONO, fontSize: 'var(--text-sm)', color: TONE[phrase.tone], overflow: 'hidden', textOverflow: 'ellipsis' }}>
          · {phrase.text}
          {phrase.detail && <span style={{ color: phrase.tone === 'plain' ? 'var(--fg-4)' : undefined }}> · {phrase.detail}</span>}
        </span>
      )}
      <Icon
        name="chevron-down"
        size={14}
        style={{
          flex: '0 0 auto', color: 'var(--fg-3)',
          rotate: open ? '180deg' : '0deg',
          transition: 'rotate var(--dur-base) var(--ease-glide)',
        }}
      />
    </SoftButton>
  );
}

/**
 * What folds down. Rendered by the island only once it has been opened; the
 * fold itself is a grid row going from `0fr` to `1fr`, a CSS transition.
 */
export function ForecastPanel({ finishBy, onFinishBy, model, open, onOpenTask }: {
  /** The project's Finish by, and how to change it (the store's `updateProject` on a board). */
  finishBy: string | undefined;
  onFinishBy: (day: string | undefined) => void;
  model: ForecastModel;
  open: boolean;
  onOpenTask: (task: Task) => void;
}) {
  return (
    <div
      inert={!open}
      data-forecast-panel={open ? 'open' : 'shut'}
      style={{
        display: 'grid', gridTemplateRows: open ? '1fr' : '0fr',
        transition: 'grid-template-rows var(--dur-sheet) var(--ease-glide)',
      }}
    >
      <div style={{ minHeight: 0, overflow: 'hidden' }}>
        {/* Scrolls inside itself, never the island, and at most 40% of the
            screen tall: the island is frozen over the board, and open in full
            it took two thirds of a laptop window (measured, 608 of 900px). */}
        <div
          className="ag-scroll ag-fade"
          style={{
            maxHeight: 'min(40vh, 400px)', overflowY: 'auto',
            display: 'grid', gap: 'var(--sp-6)',
            paddingTop: 'var(--sp-5)', marginTop: 'var(--sp-2)',
            borderTop: '1px solid var(--line-faint)',
          }}
        >
          <MilestoneLine model={model} onOpenTask={onOpenTask} />
          <ForecastChart finishBy={finishBy} onFinishBy={onFinishBy} model={model} />
        </div>
      </div>
    </div>
  );
}

// ─── 155: milestones on a line ───────────────────────────────────────────────

function MilestoneLine({ model, onOpenTask }: { model: ForecastModel; onOpenTask: (task: Task) => void }) {
  const { milestones, timeZone, today } = model;
  const nowAt = milestones.findIndex((m) => m.state === 'now');
  const [picked, setPicked] = useState<string | null>(null);
  const shown = milestones.find((m) => m.task.id === picked)
    ?? milestones[nowAt >= 0 ? nowAt : milestones.length - 1];

  if (milestones.length === 0) {
    return (
      <p style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
        <Icon name="flag-triangle-right" size={14} style={{ color: 'var(--fg-3)' }} />
        No milestones yet. Switch a task to one under Optional in its sheet.
      </p>
    );
  }

  const n = milestones.length;
  /* Each flag has an equal share of the width; the line runs between the
     first centre and the last, and fills to the one he is on. */
  const centre = (i: number) => `${((i + 0.5) / n) * 100}%`;
  const fillTo = nowAt >= 0 ? nowAt : n - 1;

  return (
    <section aria-label="Milestones" style={{ display: 'grid', gap: 'var(--sp-4)' }}>
      <div className="ag-scroll" style={{ overflowX: 'auto' }}>
        <div style={{ position: 'relative', display: 'flex', minWidth: n * 104 }}>
          <span aria-hidden="true" style={{ ...LINE, left: centre(0), right: `${(0.5 / n) * 100}%`, backgroundColor: 'var(--line-soft)' }} />
          {fillTo > 0 && (
            <span
              aria-hidden="true"
              style={{
                ...LINE, left: centre(0), width: `${(fillTo / n) * 100}%`,
                backgroundColor: 'var(--job-lime)', boxShadow: '0 0 10px -2px var(--job-lime-line)',
              }}
            />
          )}
          {milestones.map((m) => {
            const day = milestoneDay(m.task, timeZone);
            const sel = m === shown;
            return (
              <button
                key={m.task.id}
                type="button"
                aria-pressed={sel}
                aria-label={`${m.task.title}, ${m.state === 'done' ? 'done' : m.state === 'now' ? 'the next one' : 'ahead'}${day ? `, ${longDay(day)}` : ''}`}
                onClick={() => setPicked(m.task.id)}
                data-milestone={m.state}
                style={{
                  flex: '1 1 0', minWidth: 0, position: 'relative',
                  display: 'grid', justifyItems: 'center', alignContent: 'start', gap: 4,
                  padding: '0 var(--sp-2) var(--sp-2)', border: 0, background: 'none', cursor: 'pointer',
                  color: 'var(--fg-1)', textAlign: 'center',
                }}
              >
                <span
                  style={{
                    width: 24, height: 24, borderRadius: '50%', display: 'grid', placeItems: 'center',
                    backgroundColor: m.state === 'done' ? 'var(--job-lime)' : 'transparent',
                    backgroundImage: m.state === 'done' ? 'none' : 'var(--glass-well)',
                    color: 'var(--fg-on-light)',
                    boxShadow: m.state === 'now'
                      ? 'var(--glass-well-shadow), inset 0 0 0 2.5px var(--job-lime), 0 0 14px -2px var(--job-lime-line)'
                      : m.state === 'ahead' ? 'var(--glass-well-shadow), inset 0 0 0 1.5px var(--fg-4)' : 'none',
                    scale: sel ? '1.18' : '1',
                    transition: 'scale var(--dur-base) var(--ease-springy)',
                  }}
                >
                  {m.state === 'done' && <Icon name="check" size={13} style={{ color: 'inherit' }} />}
                </span>
                <span className="ag-clamp-2" style={{ font: 'var(--type-caption)', fontWeight: 600, color: sel ? 'var(--fg-1)' : 'var(--fg-2)' }}>
                  {m.task.title}
                </span>
                <span style={{ ...MONO, fontSize: 'var(--text-2xs)', color: m.state === 'done' ? 'var(--fg-4)' : 'var(--job-sky)' }}>
                  {day ? shortDay(day, today) : 'No date'}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      {shown && <WaitsOn milestone={shown} onOpenTask={onOpenTask} />}
    </section>
  );
}

const LINE: CSSProperties = { position: 'absolute', top: 11, height: 3, borderRadius: 2 };

function WaitsOn({ milestone, onOpenTask }: { milestone: Milestone<Task>; onOpenTask: (task: Task) => void }) {
  const { task, waitsOn, waitsDone } = milestone;
  return (
    <div style={{ display: 'grid', gap: 'var(--sp-2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', minWidth: 0 }}>
        <span
          style={{
            flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            font: 'var(--type-kicker)', letterSpacing: 'var(--tracking-kicker)',
            textTransform: 'var(--kicker-transform)' as CSSProperties['textTransform'], color: 'var(--fg-3)',
          }}
        >
          {waitsOn.length > 0
            ? `${task.title} waits on ${waitsOn.length} · ${waitsDone} done`
            : `${task.title} waits on nothing yet`}
        </span>
        <SoftButton size="sm" onClick={() => onOpenTask(task)} style={{ flex: '0 0 auto' }}>
          Open
        </SoftButton>
      </div>
      {waitsOn.length === 0 ? (
        <p style={{ font: 'var(--type-caption)', color: 'var(--fg-4)' }}>
          Open it and pick what it waits on under Depends on.
        </p>
      ) : waitsOn.map((t) => {
        const done = t.status === 'completed';
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onOpenTask(t)}
            style={{
              display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', minHeight: 36, width: '100%',
              padding: 'var(--sp-2) var(--sp-4)', borderRadius: 'var(--r-sm)', border: 0, cursor: 'pointer',
              backgroundColor: 'transparent', backgroundImage: 'var(--glass-well)', textAlign: 'left',
              font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: done ? 'var(--fg-3)' : 'var(--fg-1)',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                flex: '0 0 auto', width: 16, height: 16, borderRadius: '50%', display: 'grid', placeItems: 'center',
                /* The app's done box (`TickBox`): a lime hairline and a lime
                   check, no fill. Not a TickBox itself — this row opens the
                   task, it does not tick it. */
                boxShadow: done ? 'inset 0 0 0 1px var(--job-lime-line)' : 'inset 0 0 0 1.5px var(--fg-4)',
                color: 'var(--job-lime)',
              }}
            >
              {done && <Icon name="check" size={11} style={{ color: 'inherit' }} />}
            </span>
            <span style={{ flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecorationLine: done ? 'line-through' : undefined }}>
              {t.title}
            </span>
            {t.listName && (
              <span style={{ flex: '0 0 auto', font: 'var(--type-caption)', color: 'var(--fg-4)' }}>{t.listName}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── 156: when it'll be done ─────────────────────────────────────────────────

/** How far right the chart may reach, in days past today. */
const AHEAD_CAP = 180;

function paceWords(pace: number): string {
  if (pace <= 0) return 'Nothing done in the last two weeks, so no pace yet.';
  if (pace >= 1) {
    const n = Math.round(pace * 10) / 10;
    return `Pace: about ${n} task${n === 1 ? '' : 's'} a day, the last two weeks.`;
  }
  const every = Math.round(1 / pace);
  return `Pace: about 1 task every ${every} day${every === 1 ? '' : 's'}, the last two weeks.`;
}

function ForecastChart({ finishBy, onFinishBy, model }: {
  finishBy: string | undefined;
  onFinishBy: (day: string | undefined) => void;
  model: ForecastModel;
}) {
  const { forecast: f, today } = model;
  const [scrub, setScrub] = useState<string | null>(null);

  const start = f.history[0]?.day ?? today;
  const reach = Math.max(
    7,
    f.finishDay ? daysFrom(today, f.finishDay) + 3 : 0,
    f.finishBy ? daysFrom(today, f.finishBy) + 3 : 0,
    f.state === 'slow' ? AHEAD_CAP : 0,
  );
  const end = addDays(today, Math.min(AHEAD_CAP, reach));
  const span = Math.max(1, daysFrom(start, end));
  const total = Math.max(1, f.total);
  /* Percentages of the plot: x across the days, y up from the floor. */
  const X = (day: string) => (daysFrom(start, day) / span) * 100;
  const Y = (n: number) => 100 - (n / total) * 100;

  const history = f.history.map((d, i) => `${i ? 'L' : 'M'}${X(d.day).toFixed(2)} ${Y(d.done).toFixed(2)}`).join(' ');
  const goesTo = f.state === 'forecast' && f.finishDay
    ? (daysFrom(f.finishDay, end) >= 0 ? f.finishDay : end)
    : f.state === 'slow' ? end : null;
  const forecastPath = goesTo
    ? `M${X(today).toFixed(2)} ${Y(f.done).toFixed(2)} L${X(goesTo).toFixed(2)} ${Y(forecastDoneBy(f, today, goesTo)).toFixed(2)}`
    : null;
  const byInView = f.finishBy && daysFrom(start, f.finishBy) >= 0 && daysFrom(f.finishBy, end) >= 0 ? f.finishBy : null;

  const read = (e: PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const share = Math.min(1, Math.max(0, (e.clientX - box.left) / Math.max(1, box.width)));
    setScrub(addDays(start, Math.round(share * span)));
  };
  const scrubDone = scrub ? forecastDoneBy(f, today, scrub) : 0;
  const readout = scrub
    ? scrub === today
      ? `Today · ${f.done} of ${f.total} done`
      : daysFrom(today, scrub) < 0
        ? `${longDay(scrub)} · ${scrubDone} of ${f.total} done`
        : f.pace > 0
          ? `${longDay(scrub)} · about ${Math.floor(scrubDone)} of ${f.total} at this pace`
          : `${longDay(scrub)} · no pace to go on`
    : paceWords(f.pace);

  const label: CSSProperties = { position: 'absolute', font: 'var(--type-caption)', fontSize: 'var(--text-2xs)', whiteSpace: 'nowrap', pointerEvents: 'none' };

  return (
    <section aria-label="When it will be done" style={{ display: 'grid', gap: 'var(--sp-3)' }}>
      <div
        role="img"
        aria-label={`${f.done} of ${f.total} tasks done. ${paceWords(f.pace)}`}
        onPointerMove={read}
        onPointerDown={read}
        onPointerLeave={() => setScrub(null)}
        data-forecast-chart=""
        style={{ position: 'relative', height: 120, margin: '14px 4px 18px', touchAction: 'pan-y', cursor: 'crosshair' }}
      >
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%" style={{ display: 'block', overflow: 'visible' }}>
          <path d="M0 0 H100" stroke="var(--line-soft)" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
          <path d="M0 100 H100" stroke="var(--line-faint)" vectorEffect="non-scaling-stroke" />
          {byInView && (
            <path d={`M${X(byInView)} -8 V100`} stroke="var(--job-coral)" strokeWidth={1.5} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
          )}
          <path d={history} fill="none" stroke="var(--job-lime)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          {forecastPath && (
            <path d={forecastPath} fill="none" stroke="var(--job-lime-line)" strokeWidth={2} strokeDasharray="3 5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          )}
          {scrub && (
            <path d={`M${X(scrub)} 0 V100`} stroke="var(--fg-3)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          )}
        </svg>
        <span style={{ ...label, left: 0, top: -16, color: 'var(--fg-4)' }}>{f.total} task{f.total === 1 ? '' : 's'}</span>
        {byInView && (
          <span style={{ ...label, top: -16, right: `${100 - X(byInView)}%`, paddingRight: 4, color: 'var(--job-coral)', fontWeight: 600 }}>
            Finish by {shortDay(byInView, today)}
          </span>
        )}
        <span style={{ ...label, bottom: -18, left: `${X(today)}%`, translate: '-50% 0', color: 'var(--fg-4)' }}>today</span>
        {goesTo && f.state === 'forecast' && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute', left: `${X(goesTo)}%`, top: `${Y(forecastDoneBy(f, today, goesTo))}%`,
              width: 9, height: 9, borderRadius: '50%', translate: '-50% -50%',
              backgroundColor: 'var(--job-lime)', boxShadow: '0 0 10px var(--job-lime-line)',
            }}
          />
        )}
        {scrub && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute', left: `${X(scrub)}%`, top: `${Y(scrubDone)}%`,
              width: 8, height: 8, borderRadius: '50%', translate: '-50% -50%', backgroundColor: 'var(--fg-1)',
            }}
          />
        )}
      </div>
      <p data-forecast-readout="" style={{ ...MONO, font: 'var(--type-caption)', color: 'var(--fg-2)', whiteSpace: 'normal', minHeight: '1.4em' }}>
        {readout}
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
        <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)' }}>Finish by</span>
        <Input
          type="date"
          size="sm"
          block={false}
          aria-label="Finish by"
          value={finishBy ?? ''}
          onChange={(e) => onFinishBy(e.target.value || undefined)}
        />
        {finishBy && (
          <IconButton label="Clear the finish date" variant="ghost" size="sm" onClick={() => onFinishBy(undefined)}>
            <Icon name="x" size={16} />
          </IconButton>
        )}
      </div>
    </section>
  );
}
