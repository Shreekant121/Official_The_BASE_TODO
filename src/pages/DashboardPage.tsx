/**
 * The Dashboard (BIG-6) — the screen he opens first thing, step 29-1a.
 *
 * Scoped with him over four rounds on 2026-09-30; every call is written under
 * BIG-6 in `IMPROVEMENTS.md`. What this stage built:
 *
 * - **Its own page and the first button in the nav**, and BASE opens on it
 *   (`lib/landingPref.ts`; Settings → App turns that back to Home).
 * - **The header from his references**: the greeting, a date chip, and Edit
 *   and + Add widget on the right — **rounded rectangles, not pills**, his
 *   standing call for top bars.
 * - **The grid** (`components/dashboard/DashboardGrid.tsx`): Android widgets,
 *   one layout synced through its own document (`lib/dashboardSync.ts`).
 * - **Five blocks from data that already exists**; 29-1b added three more —
 *   hours today, focus this week, the running timer — and the rest arrive in
 *   29-1c and 29-2 to 29-5.
 *
 * **It stays dark** — his call, though nearly every reference he sent is
 * light — and takes the rest from them: thin huge numbers, soft raised
 * controls, lime highlights, hatched "not yet", and his orange Start.
 *
 * Like Home it draws its own nav (a rail from 900px, a floating bar below)
 * and is one of the kept screens in `App.tsx`.
 *
 * 29-1P13 added the Stack, Waiting on and the runway (`moreBlocks.tsx`), the
 * shelf to drag a widget in from while editing (`DashboardGrid.tsx`), and a
 * pull down from the top to open search on a touch screen (`PullToSearch.tsx`).
 *
 * 29-1c3 put the week strip under the greeting, in place of the date chip
 * (`components/dashboard/WeekStrip.tsx`): the day picked there moves Today,
 * the timeline, Hours and Focus this week.
 *
 * 29-1c4 asks a new account three questions the first time it opens
 * (`components/dashboard/FirstRunSheet.tsx`), and their answers build its
 * starting layout, with Sample blocks for what steps 29-2 to 29-5 will add.
 */
import { useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { GlassFilters, Icon, MiniNav, SoftButton, SoftToggle, V3Scope, useMedia } from '../ui';
import { useStore, type Task } from '../store/useStore';
import { useAuth } from '../contexts/AuthContext';
import { useNavModel } from '../components/navModel';
import { BrandMark, RailMark } from '../components/BrandMark';
import TaskDetailPanel from '../components/TaskDetailPanel';
import DashboardGrid from '../components/dashboard/DashboardGrid';
import { BlockSettingsSheet, OverdueSheet, WidgetGallery } from '../components/dashboard/dialogs';
import { HoursSheet, LogTimeSheet } from '../components/dashboard/timeSheets';
import { usePullToSearch } from '../components/PullToSearch';
import type { DashSheet } from '../components/dashboard/blocks';
import { Z } from '../lib/zLayers';
import QuickCaptureFab from '../components/QuickCaptureFab';
import { DayRecap, SpecialGreeting, WelcomeBack } from '../components/dashboard/moments';
import { MonthWrappedCard, MonthWrappedStory } from '../components/dashboard/MonthWrapped';
import { useSpecialDay } from '../components/dashboard/useSpecialDay';
import WeekStrip from '../components/dashboard/WeekStrip';
import FirstRun from '../components/dashboard/FirstRunSheet';
import '../components/dashboard/dashboard.css';

const WIDE = '(min-width: 900px)';

function greetingFor(now: Date): string {
  const h = now.getHours();
  if (h < 5) return 'Good evening';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function DashboardPage() {
  return (
    <V3Scope>
      <DashboardScreen />
    </V3Scope>
  );
}

function DashboardScreen() {
  const { user } = useAuth();
  const wide = useMedia(WIDE);
  const nav = useNavModel();
  const updateBacklogTask = useStore((s) => s.updateBacklogTask);
  const deleteBacklogTask = useStore((s) => s.deleteBacklogTask);

  const [editing, setEditing] = useState(false);
  const [gallery, setGallery] = useState(false);
  const [settingsFor, setSettingsFor] = useState<string | null>(null);
  const [overdueOpen, setOverdueOpen] = useState(false);
  const [sheet, setSheet] = useState<DashSheet | null>(null);
  const [wrapMonth, setWrapMonth] = useState<string | null>(null);
  const [sheetTask, setSheetTask] = useState<Task | null>(null);
  const [revealId, setRevealId] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const pull = usePullToSearch(scrollerRef, contentRef, !editing);

  /* An open task is read from the store each render, so a change made in the
     sheet or on another device is what it shows. */
  const liveTask = useStore((s) => (sheetTask ? s.backlogTasks.find((t) => t.id === sheetTask.id) ?? null : null));

  const now = new Date();
  const firstName = user?.displayName?.trim().split(/\s+/)[0];
  const greeting = firstName ? `${greetingFor(now)}, ${firstName}` : greetingFor(now);
  /* 29-1P14b, idea 109: on his birthday, Diwali, New Year and BASE's birthday the greeting dresses up. */
  const special = useSpecialDay(firstName);

  return (
    <div ref={scrollerRef} className="ag-page ag-page--sky h-screen overflow-y-auto">
      <GlassFilters />
      <div ref={contentRef} style={{ display: 'flex', minHeight: '100%', alignItems: 'flex-start' }}>
        {wide && (
          <div style={{ position: 'sticky', top: 0, flex: '0 0 auto', padding: 'var(--sp-9) 0 var(--sp-9) var(--sp-7)' }}>
            <MiniNav orientation="vertical" items={nav.items} value={nav.current} onChange={nav.go} screenLit lead={<RailMark />} />
          </div>
        )}

        <div
          style={{
            flex: 1, minWidth: 0, boxSizing: 'border-box',
            padding: wide ? 'var(--sp-11) var(--gutter-page) var(--sp-13)' : 'var(--sp-9) var(--gutter-page-sm) 140px',
            /* Room to scroll the last widgets above the shelf while editing. */
            paddingBottom: editing ? (wide ? 260 : 270) : undefined,
          }}
        >
          {/* ── Header ───────────────────────────────────────────── */}
          <header style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--sp-5)', flexWrap: 'wrap', marginBottom: 'var(--sp-9)' }}>
            {/* Its own line on a narrow screen: beside a two-line greeting it
                sank to the bottom, next to the date. */}
            {!wide && <div style={{ flexBasis: '100%' }}><BrandMark /></div>}
            {special ? (
              <div style={{ minWidth: 0, flex: '1 1 320px' }}>
                <SpecialGreeting special={special.special} kicker={special.kicker} line={special.line} />
              </div>
            ) : (
              <h1
                style={{
                  minWidth: 0, flex: '1 1 260px',
                  font: 'var(--weight-light) var(--text-4xl) / 1 var(--font-display)',
                  letterSpacing: '-0.04em', color: 'var(--fg-1)',
                }}
              >
                {greeting}
              </h1>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', marginLeft: 'auto' }}>
              {/* Soft raised, the design system's everyday second action (29-1P2);
                  Edit stays pressed in while editing. */}
              <SoftToggle
                pressed={editing}
                onPressedChange={setEditing}
                icon={<Icon name={editing ? 'check' : 'pencil'} size={15} />}
              >
                {editing ? 'Done' : 'Edit'}
              </SoftToggle>
              <SoftButton icon={<Icon name="plus" size={15} />} onClick={() => setGallery(true)}>
                Add widget
              </SoftButton>
            </div>
          </header>

          {/* 29-1c3, ideas 40 and 128: the week, its load, and the day the blocks show. */}
          <WeekStrip />

          {editing && (
            <p style={{ font: 'var(--type-caption)', fontSize: 'var(--text-sm)', color: 'var(--fg-3)', margin: '0 0 var(--sp-6)' }}>
              Drag a widget to move it. Pull its corner to resize it. ✕ removes it; the sliders open its settings.
            </p>
          )}

          {/* 29-1P14b, idea 19: the day, recapped, from 8pm until he closes it. */}
          {!editing && <DayRecap />}
          {/* 29-1P14e, idea 107: last month, wrapped (and in January last year, on its own card), from the 1st to the 7th until watched. */}
          {!editing && <MonthWrappedCard onPlay={setWrapMonth} />}

          <DashboardGrid
            editing={editing}
            onStartEditing={() => setEditing(true)}
            onSettings={setSettingsFor}
            onOpenTask={setSheetTask}
            onOpenOverdue={() => setOverdueOpen(true)}
            onOpenSheet={setSheet}
            revealId={revealId}
            onAdded={setRevealId}
          />
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

      {pull.layer}
      {/* Quick capture on the tablet (29-1P2); not while editing, where the shelf has the corner. */}
      {!wide && !editing && <QuickCaptureFab />}
      {gallery && <WidgetGallery onClose={() => setGallery(false)} onAdded={(id) => { setEditing(true); setRevealId(id); }} />}
      {settingsFor && <BlockSettingsSheet blockId={settingsFor} onClose={() => setSettingsFor(null)} />}
      {overdueOpen && <OverdueSheet onClose={() => setOverdueOpen(false)} onOpenTask={setSheetTask} />}
      {sheet === 'hours' && <HoursSheet onClose={() => setSheet(null)} />}
      {sheet === 'log-time' && <LogTimeSheet onClose={() => setSheet(null)} />}
      {/* 29-1P14b, idea 110: after three or more days away, a hello before the
          Dashboard. Inside the page, not a portal, so the kept screen hides it. */}
      <WelcomeBack />
      {/* 29-1c4: a new account's three questions, once. */}
      <FirstRun />
      {/* The month's story plays here, not in the column: a pull to search moves the column. */}
      {wrapMonth && <MonthWrappedStory period={wrapMonth} onClose={() => setWrapMonth(null)} />}
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
