/**
 * The Calendar (29-2e1, BIG-6): his tasks and his BASE events by the day,
 * the week and the month. His calls (2026-10-21): its own screen, an icon in
 * the nav (sky, a date's colour), Day / Week / Month, a month with coloured
 * dots and today ringed in orange (idea 53), a tap on a day opening it. Also
 * reached from the month name on the Dashboard's week strip and from Ctrl+K.
 *
 * What is on it, and every word and date, is `lib/calendar/calendar.ts`
 * (pure, tested); the view and the day are `store/useCalendarView.ts`, in
 * memory, the view remembered on this device. The month is
 * `components/calendar/CalendarMonth.tsx`, the day and the week
 * `CalendarHours.tsx`. A pinch moves between the three (29-2e2,
 * `usePinchZoom`, from where the fingers are); a task's block is dragged to
 * another time on the hours (29-2e3a), and "No date" opens the tray of tasks
 * with none, dragged onto them the same way (29-2e3b, his calls 2026-10-22).
 *
 * The screen is the window's height and does not scroll itself: the month
 * fills it and the hours scroll inside it, so the header never leaves.
 */
import { useMemo, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { CountChip, GlassFilters, Icon, MiniNav, SegmentedControl, SoftButton, SoftIconButton, V3Scope, useMedia } from '../ui';
import { useStore, type Task } from '../store/useStore';
import { usePriorityScores } from '../store/usePriorityScores';
import { useEventSheet } from '../store/useEventSheet';
import { useCalendarView } from '../store/useCalendarView';
import { useNavModel } from '../components/navModel';
import { BrandMark, RailMark } from '../components/BrandMark';
import TaskDetailPanel from '../components/TaskDetailPanel';
import CalendarMonth from '../components/calendar/CalendarMonth';
import CalendarHours from '../components/calendar/CalendarHours';
import { resolveUserTimeZone, toZonedDayString } from '../lib/agent/dates';
import { trayTasks } from '../lib/calendar/tray';
import { CALENDAR_VIEWS, calendarKicker, calendarTitle, pageHolds, stepDay, zoomLanding, zoomedView, type CalendarView } from '../lib/calendar/calendar';
import { usePinchZoom } from '../ui/core/usePinchZoom';
import type { ZoomDir } from '../lib/pinchZoom';
import { Z } from '../lib/zLayers';
import '../components/dashboard/dashboard.css';
import '../components/calendar/calendar.css';

const WIDE = '(min-width: 900px)';
const MOUSE = '(hover: hover) and (pointer: fine)';
const VIEW_LABELS: Record<CalendarView, string> = { day: 'Day', week: 'Week', month: 'Month' };

/** A day on show (not a neighbour page built for a swipe) that is under the point. */
function zoomDayAt(at: { x: number; y: number }): string | null {
  const hit = document.elementFromPoint(at.x, at.y)?.closest<HTMLElement>('[data-zoom-day]');
  return hit && !hit.closest('[inert]') ? hit.dataset.zoomDay ?? null : null;
}

/** The middle of `day` where it is drawn on show: its column in the hours, its cell in the month. */
function shownDay(box: HTMLElement | null, day: string): { x: number; y: number } | null {
  if (!box) return null;
  let best: DOMRect | null = null;
  for (const el of box.querySelectorAll<HTMLElement>(`[data-zoom-day="${day}"]`)) {
    if (el.closest('[inert]')) continue;
    const r = el.getBoundingClientRect();
    if (!best || r.height > best.height) best = r;
  }
  return best ? { x: best.left + best.width / 2, y: best.top + best.height / 2 } : null;
}

export default function CalendarPage() {
  return (
    <V3Scope>
      <CalendarScreen />
    </V3Scope>
  );
}

function CalendarScreen() {
  const wide = useMedia(WIDE);
  const nav = useNavModel();
  const updateBacklogTask = useStore((s) => s.updateBacklogTask);
  const deleteBacklogTask = useStore((s) => s.deleteBacklogTask);
  const timeZone = useMemo(() => resolveUserTimeZone(), []);
  /* The score's minute clock: the now line and "late" move with it, nothing loops. */
  const scores = usePriorityScores();
  const now = useMemo(() => new Date(scores.now), [scores.now]);
  const today = toZonedDayString(now, timeZone);

  const view = useCalendarView((s) => s.view);
  const day = useCalendarView((s) => s.day) ?? today;
  const { setView, pick, open } = useCalendarView.getState();

  /* 29-2e3b: the tray of undated tasks, behind "No date" (his call), open or shut for this visit. */
  const backlog = useStore((s) => s.backlogTasks);
  const tray = useMemo(() => trayTasks(backlog, scores.scoreOf, scores.ignored.ids), [backlog, scores]);
  const [trayOpen, setTrayOpen] = useState(false);
  const trayButton = useRef<HTMLSpanElement>(null);

  const [sheetTask, setSheetTask] = useState<Task | null>(null);
  const liveTask = useStore((s) => (sheetTask ? s.backlogTasks.find((t) => t.id === sheetTask.id) ?? null : null));

  const kicker = calendarKicker(view, day, today);
  const title = calendarTitle(view, day, today);
  const onPick = (d: string) => pick(d, today);
  const openDay = (d: string) => open('day', d, today);
  const openEvent = (id: string) => useEventSheet.getState().openEvent(id);

  // ─── Pinch between the views (29-2e2, idea 127) ───────────────────────────
  /* Fingers together: day → week → month; apart: back, into the day under
     them. A trackpad pinches the same way, and a mouse has − and +. */
  const mouse = useMedia(MOUSE);
  const zoomBox = useRef<HTMLDivElement>(null);
  const wider = zoomedView(view, 'out');
  const closer = zoomedView(view, 'in');
  const pinch = usePinchZoom({
    target: zoomBox,
    can: (dir) => zoomedView(view, dir) !== null,
    onZoom: (dir, at) => {
      const to = zoomedView(view, dir);
      if (!to) return;
      open(to, zoomLanding(dir, day, zoomDayAt(at)), today);
    },
  });
  /* A button zooms from the day the calendar is on, as fingers on it would. */
  const zoomTo = (dir: ZoomDir) => {
    const at = shownDay(zoomBox.current, day);
    pinch.zoom(dir, at ?? undefined);
  };

  return (
    <div className="ag-page h-screen" style={{ display: 'flex', overflow: 'hidden' }}>
      <GlassFilters />
      {wide && (
        <div style={{ flex: '0 0 auto', padding: 'var(--sp-9) 0 var(--sp-9) var(--sp-7)' }}>
          <MiniNav orientation="vertical" items={nav.items} value={nav.current} onChange={nav.go} screenLit lead={<RailMark />} />
        </div>
      )}

      <div
        className="cal-main"
        style={{
          padding: wide ? 'var(--sp-11) var(--gutter-page) var(--sp-9)' : 'var(--sp-9) var(--gutter-page-sm) 0',
        }}
      >
        <header className="cal-header">
          {!wide && <div style={{ flexBasis: '100%' }}><BrandMark /></div>}
          {/* The title never wraps: when the controls do not fit beside it they go under it. */}
          <div style={{ minWidth: 0, flex: '1 0 auto', whiteSpace: 'nowrap' }}>
            <p className="cal-kicker">{kicker ?? ' '}</p>
            <h1 className="cal-title">{title}</h1>
          </div>
          <div className="cal-controls">
            <SegmentedControl
              look="soft"
              size="sm"
              aria-label="View"
              options={CALENDAR_VIEWS.map((v) => ({ value: v, label: VIEW_LABELS[v] }))}
              value={view}
              onChange={(v) => setView(v as CalendarView)}
            />
            {mouse && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
                <SoftIconButton label={wider ? `Zoom out to the ${wider}` : 'Zoom out'} size="sm" disabled={!wider} onClick={() => zoomTo('out')}>
                  <Icon name="minus" size={16} />
                </SoftIconButton>
                <SoftIconButton label={closer ? `Zoom in to the ${closer}` : 'Zoom in'} size="sm" disabled={!closer} onClick={() => zoomTo('in')}>
                  <Icon name="plus" size={16} />
                </SoftIconButton>
              </span>
            )}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
              {!pageHolds(view, day, today) && (
                <SoftButton size="sm" onClick={() => pick(null)}>Today</SoftButton>
              )}
              <SoftIconButton label={`Last ${view}`} size="sm" onClick={() => onPick(stepDay(view, day, -1))}>
                <Icon name="chevron-left" size={16} />
              </SoftIconButton>
              <SoftIconButton label={`Next ${view}`} size="sm" onClick={() => onPick(stepDay(view, day, 1))}>
                <Icon name="chevron-right" size={16} />
              </SoftIconButton>
            </span>
            {view !== 'month' && (
              /* A block held from the hours is let go here, the tray shut, to lose its date. */
              <span ref={trayButton} className="cal-tray-button">
                <CountChip
                  className="ds-soft--sm"
                  count={tray.length}
                  colour="sky"
                  pressed={trayOpen}
                  aria-label={`Tasks with no date, ${tray.length}`}
                  onClick={() => setTrayOpen((o) => !o)}
                >
                  <Icon name="inbox" size={15} />
                  No date
                </CountChip>
              </span>
            )}
            {/* A new event starts on the day the calendar is on, all day. */}
            <SoftButton size="sm" icon={<Icon name="calendar-plus" size={15} />} onClick={() => useEventSheet.getState().openEvent(undefined, { start: day })}>
              Event
            </SoftButton>
          </div>
        </header>

        <div className="cal-body" style={{ paddingBottom: wide ? 0 : 104 }}>
          <div ref={zoomBox} className="cal-zoom">
            {view === 'month' ? (
              <CalendarMonth day={day} today={today} now={now} timeZone={timeZone} onPick={onPick} onOpenDay={openDay} />
            ) : (
              <CalendarHours
                view={view}
                day={day}
                today={today}
                now={now}
                timeZone={timeZone}
                wide={wide}
                onPick={onPick}
                onOpenDay={openDay}
                onOpenTask={setSheetTask}
                onOpenEvent={openEvent}
                tray={tray}
                trayOpen={trayOpen}
                trayButton={trayButton}
              />
            )}
          </div>
        </div>
      </div>

      {!wide && (
        <div
          style={{
            position: 'fixed', left: 0, right: 0, bottom: 'calc(var(--sp-6) + var(--safe-b))',
            display: 'grid', placeItems: 'center', zIndex: Z.nav, pointerEvents: 'none',
          }}
        >
          <span style={{ pointerEvents: 'auto' }}>
            <MiniNav items={nav.items} value={nav.current} onChange={nav.go} screenLit />
          </span>
        </div>
      )}

      <AnimatePresence>
        {liveTask && (
          <TaskDetailPanel
            task={liveTask}
            onClose={() => setSheetTask(null)}
            onSave={(updates) => { updateBacklogTask(liveTask.id, updates); setSheetTask(null); }}
            onDelete={() => { deleteBacklogTask(liveTask.id); setSheetTask(null); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
