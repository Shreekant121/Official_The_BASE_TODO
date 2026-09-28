/**
 * Score — the unified "needs attention" page.
 *
 * RECONCILED against `design-system/screens/scoring.html` at UI-30, the last
 * screen in the track that was built with no mockup at all. UI-9 composed it
 * from tokens because `DesignSync` had been dead for eight sessions; UI-21
 * landed the handoff bundle and this is the diff.
 *
 * **Five blocks, in the source's order**, where UI-9 had a sticky header and a
 * card grid: the session bar, the queue strip, the subject with its
 * `Instrument`, the two columns, and a commit bar sticky to the BOTTOM. Each
 * carries its own note — `SessionBar.tsx`, `QueueStrip.tsx`, `Subject.tsx`,
 * `Instrument.tsx`, `TaskFieldGrid.tsx`, `CommitBar.tsx`.
 *
 * **THE SCORING MODEL MOVED AT ITEM 16, AND UI-30 SAID IT WOULD.** That entry
 * warned *"if those are ever unpaused, do them first or expect to redo this"*.
 * They were unpaused, and the redo is smaller than the warning implied: the
 * SHAPE is still the source's and every number is still read through
 * `readScore`, but `readScore` now names what `lib/priority.ts` returned
 * instead of what `computePriorityScore` computed. Seven factors in the
 * `Instrument` where there were four, no Duration penalty, and the pane's
 * amber is Red Alert rather than a raw 10.
 *
 * WHAT IS UNCHANGED — and this is the part that matters
 * -----------------------------------------------------
 * Every store call and every rule about *when* a task is saved is where it
 * was. The frozen `sessionIds` + `cursor` stepping, the mid-render admission
 * of newly-needy tasks, the step-over for ids that stop resolving,
 * `useTaskDraft` and its `commit`, and the `window.confirm` guard on jumping
 * away from unsaved edits are byte for byte what they were. Nothing about what
 * is written, or when, moved in this session.
 *
 * V3 (V3-5, step 9) — THE SCORE SCREEN IS ON V3. Design:
 * `design-system/Scoring.dc.html`. The default export is the `<V3Scope>` and
 * `NeedsAttentionScreen` is inside it, so `useMotion()` sees the scope and the
 * end-of-session pane, the AI panel and every overlay the fields open come out
 * V3 too. **His calls, 2026-09-24:** today's layout stays — session bar, strip,
 * subject, the two columns, the commit bar — except that the `Instrument` is a
 * short, wide strip under the title instead of a tall card beside it; and the
 * score stays a number, **no ring and no half-ring** (the design draws a gauge
 * behind it). What else moved, on this screen only: the rail carries the mark,
 * Back is round glass, the primary on the commit bar and on the done pane is
 * gel, and kicker labels read in sentence case. "Needs attention" keeps its
 * capitals, as Focus's "FOCUS" did: it is the system voice.
 * **Not built, because V3 changes no features:** the design's Eisenhower
 * quadrants, 1–5 Importance, deadline chips, Quasi-need switch and ← →
 * stepping. They are the scoring model item 16 replaced, not a new look for
 * this one.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { taskLockReason, taskNeedsAttention, useStore, type Task } from '../../store/useStore';
import { useTaskDraft } from '../../components/task-fields/useTaskDraft';
import { countNeeds, type NeedId } from '../../components/task-fields/needs';
import { readScore } from '../../components/task-fields/scoreReadings';
import { usePriorityScores } from '../../store/usePriorityScores';
import { useNeedsJump } from '../../components/task-fields/useNeedsJump';
import { MiniNav, useMedia, useMotion, V3Scope, WIDE } from '../../ui';
import { useNavModel } from '../../components/navModel';
import { RailMark } from '../../components/BrandMark';
import { Z } from '../../lib/zLayers';
import AIPanelHost from '../../components/AIPanelHost';
import { AIPanelDock } from '../../ui/overlay/AIPanel';
import { missingScoreFields, subjectKey, type ScoreField } from '../../lib/aiPanel';
import { registerFillHost } from '../../lib/aiPanelRun';
import { devPanelFixture } from '../../lib/devPanelFixture';
import CommitBar from './CommitBar';
import DoneScreen from './DoneScreen';
import QueueStrip from './QueueStrip';
import SessionBar from './SessionBar';
import Subject from './Subject';
import TaskFieldGrid, { type SectionId } from './TaskFieldGrid';

/** Soonest / overdue deadline first, then undated tasks by age. */
function byAttentionOrder(a: Task, b: Task): number {
  const da = a.deadline ? new Date(a.deadline).getTime() : null;
  const db = b.deadline ? new Date(b.deadline).getTime() : null;
  if (da !== null && db !== null) return da - db;
  if (da !== null) return -1;
  if (db !== null) return 1;
  return (a.createdAt ?? 0) - (b.createdAt ?? 0);
}

/**
 * Which sections start open. The source opens Essentials and leaves Organize
 * and Advanced shut, and stepping to the next task resets to that — the point
 * of the session is the score, and the right-hand column is what you open when
 * a chip sends you there.
 */
const CLOSED: Record<SectionId, boolean> = {
  essentials: true, organize: false, advanced: false, subtasks: false,
};

/** Which section a Needs chip has to open before it can scroll to its field. */
const NEED_SECTION: Partial<Record<NeedId, SectionId>> = { description: 'essentials' };

/**
 * Score a task **and** fill in every one of its detail fields, without leaving
 * for the task card.
 *
 * Stepping is an explicit `sessionIds` list plus a `cursor` rather than a live
 * queue. Saving the last missing field makes a task stop satisfying
 * `taskNeedsAttention()`, so a live queue would drop it the instant you fixed
 * it — making Previous impossible and the strip flicker as items vanished. Ids
 * are admitted once and never removed, so order is frozen for the session and
 * the counters can't shift underneath you.
 */
export default function NeedsAttention() {
  /* The switch (V3-5). Its own component for Focus's reason: `useMotion()`
     reads the scope from context, so the screen must sit below the provider. */
  return (
    <V3Scope>
      <NeedsAttentionScreen />
    </V3Scope>
  );
}

function NeedsAttentionScreen() {
  const navigate = useNavigate();
  const nav = useNavModel();
  const motionTokens = useMotion();
  const wide = useMedia(WIDE);
  const backlogTasks = useStore((s) => s.backlogTasks);
  const updateBacklogTask = useStore((s) => s.updateBacklogTask);
  const scores = usePriorityScores();

  const attentionIds = useMemo(
    () =>
      backlogTasks
        .filter((t) => !t.parent && taskNeedsAttention(t))
        .sort(byAttentionOrder)
        .map((t) => t.id),
    [backlogTasks],
  );

  const [sessionIds, setSessionIds] = useState<string[]>(attentionIds);
  const [cursor, setCursor] = useState(0);
  const [handledCount, setHandledCount] = useState(0);
  const [endedEarly, setEndedEarly] = useState(false);
  const [open, setOpen] = useState<Record<SectionId, boolean>>(CLOSED);

  /* Pinned at mount, like the task sheet's and the notifications timeline's.
     `Date.now()` read during render is impure and `react-hooks/purity` says
     so; the deadline phrase does not need to tick, and one that re-read the
     clock every keystroke would be a shot that never settles. */
  const [now] = useState(() => Date.now());

  // Tasks that newly start needing attention mid-session join the tail; nothing
  // is ever removed, so the position counter stays stable. Adjusted during
  // render rather than in an effect (the pattern used elsewhere in this
  // codebase) so the strip never paints one frame behind.
  const admitted = new Set(sessionIds);
  const newlyNeeded = attentionIds.filter((id) => !admitted.has(id));
  if (newlyNeeded.length > 0) setSessionIds([...sessionIds, ...newlyNeeded]);

  const tasksById = useMemo(() => new Map(backlogTasks.map((t) => [t.id, t])), [backlogTasks]);

  /*
   * Item 19 — which tasks are locked, computed ONCE for the page.
   *
   * The strip needs the set (it draws every task in the session) and the
   * subject needs the sentence for the one it is on, and neither should walk
   * the dependency graph itself: this page is a merge of two screens and the
   * whole reason it is one is that two copies of a rule drift. Keyed off
   * `backlogTasks` alone, which is also the only thing the answer depends on —
   * a blocker being completed is a change to that array.
   */
  const lockedIds = useMemo(
    () => new Set(backlogTasks.filter((t) => taskLockReason(backlogTasks, t) !== undefined).map((t) => t.id)),
    [backlogTasks],
  );

  // A session id can stop resolving (task deleted in another tab, or by sync).
  // Step over it rather than rendering an empty card.
  let resolvedCursor = cursor;
  while (resolvedCursor < sessionIds.length && !tasksById.has(sessionIds[resolvedCursor])) resolvedCursor++;
  if (resolvedCursor !== cursor) setCursor(resolvedCursor);

  const currentTask = tasksById.get(sessionIds[resolvedCursor] ?? '');
  const controller = useTaskDraft(currentTask);
  const { isDirty, commit, missing, scoreInput, patch } = controller;

  /*
   * BUILD-4 — THE AI PANEL, WHICH FOLLOWS THE SESSION.
   *
   * Open is a fact about the session, not about one task: he opens it once
   * and it asks about each task as Save moves him on. What it FILLS goes into
   * this page's draft and nowhere else — his call, 2026-09-16 — so Save is
   * still the only thing that writes, exactly as when he types.
   */
  const [asking, setAsking] = useState(() => {
    /* The harness's way in — `lib/devPanelFixture.ts`. */
    if (import.meta.env.DEV) return devPanelFixture()?.ref.kind === 'score';
    return false;
  });
  const closeAsk = useCallback(() => setAsking(false), []);
  const scoreMissing = useMemo(
    () => missingScoreFields(missing),
    // `missing` is a fresh object every render; its four booleans are what count.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [missing.score, missing.estimate, missing.deadline, missing.description],
  );
  /* Read by the panel at the moment a fill lands, which may be after a render
     this closure did not see — so both halves go through refs. */
  const patchRef = useRef(patch);
  const missingRef = useRef<ScoreField[]>(scoreMissing);
  useEffect(() => {
    patchRef.current = patch;
    missingRef.current = scoreMissing;
  });
  const askTaskId = currentTask?.id;
  useEffect(() => {
    if (!askTaskId) return;
    if (import.meta.env.DEV) {
      /* The fixture's fills, put where a real turn would have put them, so the
         fields on the page agree with the panel photographed beside them. */
      const fixture = devPanelFixture();
      if (fixture?.patch && fixture.ref.id === askTaskId) patchRef.current(fixture.patch);
    }
    return registerFillHost(subjectKey({ kind: 'score', id: askTaskId }), {
      apply: (fill) => patchRef.current(fill),
      missing: () => missingRef.current,
    });
  }, [askTaskId]);

  /* A Needs chip pointing at Description has to open Essentials first, or
     there is nothing on screen to scroll to. The source does the same. */
  const { jump, need } = useNeedsJump((id) => {
    const section = NEED_SECTION[id];
    if (section) setOpen((o) => ({ ...o, [section]: true }));
  });

  /* Stepping to another task folds the right-hand column back up. Adjusted
     during render against the last-seen id — `useTaskDraft` reseeds its draft
     the same way, and for the same reason: an effect would paint the previous
     task's open sections for a frame first, and `react-hooks/set-state-in-effect`
     rejects it outright. */
  const [openForId, setOpenForId] = useState(currentTask?.id);
  if (currentTask?.id !== openForId) {
    setOpenForId(currentTask?.id);
    setOpen(CLOSED);
  }

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentTask?.id]);

  const remaining = sessionIds
    .slice(resolvedCursor + 1)
    .filter((id) => {
      const task = tasksById.get(id);
      return task !== undefined && taskNeedsAttention(task);
    }).length;

  /* The task being edited scores from two halves — the graph half from the
     saved pass, the rest from the unsaved draft. See `readDraft`. */
  const breakdown = scores.readDraft(scoreInput);
  const reading = readScore(breakdown);
  const outstanding = countNeeds(missing);

  const jumpTo = (index: number) => {
    if (index === resolvedCursor) return;
    if (isDirty && !window.confirm('Discard the unsaved changes to this task?')) return;
    setCursor(Math.min(Math.max(index, 0), sessionIds.length));
  };

  const handleSave = () => {
    if (!currentTask) return;
    if (isDirty) {
      commit((updates) => updateBacklogTask(currentTask.id, updates));
      setHandledCount((c) => c + 1);
    }
    setCursor(resolvedCursor + 1);
  };

  const handleSkip = () => setCursor(resolvedCursor + 1);

  if (!currentTask || endedEarly) {
    return (
      <DoneScreen
        handledCount={handledCount}
        totalTasks={sessionIds.length}
        onHome={() => navigate('/')}
        onFocus={() => navigate('/select')}
      />
    );
  }

  return (
    /* `ag-page` rather than an opaque wrapper, so the grid backdrop shows
       through and the panes above it have something to refract. */
    <div className="ag-page" style={{ height: '100dvh', display: 'flex', overflow: 'hidden' }}>
      {wide && (
        <div style={{ flex: '0 0 auto', padding: 'var(--sp-9) 0 var(--sp-9) var(--sp-7)' }}>
          <MiniNav orientation="vertical" items={nav.items} value={nav.current} onChange={nav.go} lead={<RailMark />} />
        </div>
      )}

      {/*
        One scroll container, with both bars sticky INSIDE it rather than
        siblings around it. That is deliberate and it is the material argument:
        the panes slide past behind their glass, which is what makes them read
        as panes rather than as toolbars. It also keeps
        `scrollRef.current.scrollTo(0)` — the reset when you step to the next
        task — pointing at the same element it always did.
      */}
      <AIPanelDock
        dock={wide ? 'right' : 'bottom'}
        panel={asking && (
          <AIPanelHost
            subject={{ kind: 'score', id: currentTask.id }}
            dock={wide ? 'right' : 'bottom'}
            onClose={closeAsk}
            scoreMissing={scoreMissing}
          />
        )}
      >
      <div
        ref={scrollRef}
        style={{
          minWidth: 0,
          minHeight: 0,
          overflowY: 'auto',
          boxSizing: 'border-box',
          /*
           * NO BOTTOM PADDING, and that is load-bearing for the commit bar.
           * A sticky element is held inside the scroll container's PADDING
           * box, so any padding-bottom here is added to its own `bottom`
           * offset — `--sp-13` (80px) plus `--sp-6` (20px) parked the bar
           * 100px up the window, measured, which is what it looked like.
           * The bar is the last child, so nothing can hide behind it and the
           * page needs no tail spacing of its own: the bar's inset IS the
           * tail spacing.
           */
          padding: wide ? '0 var(--gutter-page)' : '0 var(--gutter-page-sm)',
        }}
      >
        <div
          style={{
            width: '100%', maxWidth: 1440, margin: '0 auto',
            display: 'grid', gap: 'var(--sp-8)',
            paddingTop: wide ? 'var(--sp-9)' : 'var(--sp-8)',
          }}
        >
          <SessionBar
            position={resolvedCursor + 1}
            total={sessionIds.length}
            remaining={remaining}
            onBack={() => navigate(-1)}
            onEndSession={() => setEndedEarly(true)}
            asking={asking}
            onAsk={() => setAsking((v) => !v)}
          />

          <QueueStrip
            sessionIds={sessionIds}
            tasksById={tasksById}
            cursor={resolvedCursor}
            onJump={jumpTo}
            scores={scores}
            lockedIds={lockedIds}
          />

          <AnimatePresence mode="wait">
            <motion.div
              key={currentTask.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: motionTokens.dur.base, ease: motionTokens.ease.glass }}
              style={{ display: 'grid', gap: 'var(--sp-8)' }}
            >
              <Subject
                task={currentTask}
                controller={controller}
                reading={reading}
                peak={scores.peak}
                onJump={jump}
                lockReason={taskLockReason(backlogTasks, currentTask)}
              />

              <TaskFieldGrid
                task={currentTask}
                controller={controller}
                reading={reading}
                wide={wide}
                now={now}
                open={open}
                onToggleSection={(id) => setOpen((o) => ({ ...o, [id]: !o[id] }))}
                need={need}
                lockReason={taskLockReason(backlogTasks, currentTask)}
              />
            </motion.div>
          </AnimatePresence>

          <CommitBar
            score={reading.score}
            peak={scores.peak}
            redAlert={reading.redAlert}
            outstanding={outstanding}
            isDirty={isDirty}
            canGoPrevious={resolvedCursor > 0}
            isLast={resolvedCursor === sessionIds.length - 1}
            wide={wide}
            onPrevious={() => jumpTo(resolvedCursor - 1)}
            onSkip={handleSkip}
            onSave={handleSave}
          />
        </div>
      </div>
      </AIPanelDock>

      {/* Stepped aside while the AI panel holds the bottom of the window, for
          the board's reason: it would sit on the panel's message box. */}
      {!wide && !asking && (
        <div
          style={{
            position: 'fixed', left: 0, right: 0, bottom: 'calc(var(--sp-5) + var(--safe-b))',
            display: 'grid', placeItems: 'center',
            zIndex: Z.nav, pointerEvents: 'none',
          }}
        >
          <span style={{ pointerEvents: 'auto' }}>
            <MiniNav items={nav.items} value={nav.current} onChange={nav.go} />
          </span>
        </div>
      )}
    </div>
  );
}
