/**
 * "Capture Idea" — rebuilt on Aurora Glass (UI-18).
 *
 * The one sheet that exists to interrupt something else: it opens from the ⌘
 * capture button on Focus Mode and on Set Deadlines, both of which are screens
 * you are meant to be concentrating on. So it is deliberately two controls and
 * a button, and it stays that way.
 *
 * WHAT CHANGED
 * ------------
 * It **composes `Dialog`**, so the scrim, the focus trap, the return-focus and
 * the condense entrance are the app's, not this file's. `useOverlayDismiss`
 * and `Z.modal` are unchanged and `Dialog` takes `closeOnEscape={false}` for
 * the usual reason — Escape belongs to the overlay stack, and two handlers
 * would collapse a nested stack in one keypress.
 *
 * The field is a real `Input` and the list chooser is the app's shared
 * `CustomDropdown`; the "SAVE TASK" slab is a `Button`. That last one is the
 * only judgement call worth writing down: it was a full-width white pill,
 * which in this design system is `variant="frost"` — and frost is the "get in
 * touch" treatment, the loudest thing the system has. Saving a captured
 * thought is affirmative but it is not the loudest thing on the screen it
 * covers, so it is `solid` accent: one primary per view, which is the house
 * rule, and this sheet is a view with exactly one action.
 *
 * WHAT DID NOT CHANGE
 * -------------------
 * Both store paths. "Add to Current Focus Session" still pushes a `Captured`
 * row onto `tasks` with the first list's id, and every other choice still goes
 * through `addBacklogTask` — which is the difference between a thought that
 * joins today's queue and one that waits in a list.
 *
 * A DAY (29-1c3)
 * --------------
 * The floating + dropped on a day of the Dashboard's week strip opens this
 * sheet with `day` set (his pick): the sheet says when, the new task is due
 * that day at 18:00 — how the app writes a bare date — and "Current Focus
 * Session" is not offered, since today's queue is not that day. The date goes
 * on through `updateBacklogTask`, the one path, outside his undo: undoing it
 * would leave a task he made for Thursday with no Thursday.
 *
 * AN EVENT (29-2a)
 * ----------------
 * His call: events are made from quick add too. One quiet line under the
 * field, "Make it an event", hands what he typed — and the day, when the +
 * was dropped on one — to the event sheet, which has the dates and the rest.
 * The sheet stays two controls and a button; the line is a way out of it.
 */
import { useState } from 'react';
import { useStore } from '../store/useStore';
import { useEventSheet } from '../store/useEventSheet';
import { withoutUndo } from '../store/undoGate';
import { useOverlayDismiss } from '../lib/useOverlayDismiss';
import { Z } from '../lib/zLayers';
import { Dialog, FieldLabel, Icon, IconButton, Input, WhiteButton } from '../ui';
import CustomDropdown from './CustomDropdown';

interface CaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Something was captured (Focus counts them for "Session done", 29-1P11a). */
  onCaptured?: () => void;
  /** A day to make the task due on, `YYYY-MM-DD` (the week strip's, 29-1c3). */
  day?: string | null;
}

/** "Thursday 23 October". */
const longDay = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' });

export default function CaptureModal({ isOpen, onClose, onCaptured, day = null }: CaptureModalProps) {
  const { tasks, setTasks, taskLists, addBacklogTask, updateBacklogTask } = useStore();
  const [captureTitle, setCaptureTitle] = useState('');
  const [captureListId, setCaptureListId] = useState(day ? 'action' : 'focus');
  /* A day takes today's queue off the menu, so it starts on Action Steps; the
     next plain capture starts on today's queue again, as it always has. */
  const [dayWas, setDayWas] = useState(day);
  if (dayWas !== day) {
    setDayWas(day);
    if (day && captureListId === 'focus') setCaptureListId('action');
    if (!day && dayWas) setCaptureListId('focus');
  }

  useOverlayDismiss(isOpen, onClose);

  const makeEvent = () => {
    const title = captureTitle.trim();
    setCaptureTitle('');
    onClose();
    useEventSheet.getState().openEvent(undefined, { ...(title ? { title } : {}), ...(day ? { start: day } : {}) });
  };

  const handleSave = () => {
    if (!captureTitle.trim()) return;

    if (day) {
      const id = addBacklogTask(captureTitle, captureListId === 'focus' ? 'action' : captureListId);
      withoutUndo(() => updateBacklogTask(id, { deadline: `${day}T18:00` }));
    } else if (captureListId === 'focus') {
      const list = taskLists[0];
      setTasks([
        ...tasks,
        {
          id: crypto.randomUUID(),
          title: captureTitle,
          status: 'needsAction',
          listName: 'Captured',
          listId: list?.id,
          subtasks: [],
        },
      ]);
    } else {
      addBacklogTask(captureTitle, captureListId);
    }

    setCaptureTitle('');
    onCaptured?.();
    onClose();
  };

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      width={520}
      labelledBy="capture-title"
      /* See Dialog's port note 2 — Escape is `useOverlayDismiss`'s. */
      closeOnEscape={false}
      zIndex={Z.modal}
      style={{ gap: 'var(--sp-8)' }}
    >
      <header style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-5)' }}>
        <span
          aria-hidden="true"
          style={{
            display: 'grid',
            placeItems: 'center',
            width: 44,
            height: 44,
            flex: '0 0 auto',
            borderRadius: '50%',
            backgroundImage: 'var(--glass-fill-2)',
            boxShadow: 'var(--glass-rim-2)',
            color: 'var(--fg-2)',
          }}
        >
          <Icon name="sparkles" size={20} />
        </span>
        <h2
          id="capture-title"
          style={{
            flex: 1,
            minWidth: 0,
            font: 'var(--type-title)',
            fontSize: 'var(--text-xl)',
            letterSpacing: 'var(--tracking-title)',
            color: 'var(--fg-1)',
          }}
        >
          Capture Idea
        </h2>
        <IconButton label="Close" variant="ghost" onClick={onClose}>
          <Icon name="x" size={18} />
        </IconButton>
      </header>

      <Input
        /* `autoFocus` survives here because `Dialog`'s focus effect stands
           down when something inside the panel already holds the ring — see
           its comment. The whole point of this sheet is that you can type the
           moment it opens. */
        autoFocus
        size="lg"
        type="text"
        aria-label="What's on your mind?"
        placeholder="What's on your mind?"
        value={captureTitle}
        onChange={(e) => setCaptureTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
      />

      {day && (
        <span
          data-capture-day={day}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-3)', marginTop: 'calc(var(--sp-4) * -1)',
            font: 'var(--type-label)', color: 'var(--fg-2)',
          }}
        >
          <Icon name="calendar" size={15} style={{ color: 'var(--job-sky)' }} />
          Due {longDay(day)}
        </span>
      )}

      <button
        type="button"
        data-capture-event
        onClick={makeEvent}
        style={{
          justifySelf: 'start', display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-3)',
          marginTop: 'calc(var(--sp-4) * -1)', padding: 0, border: 0, backgroundColor: 'transparent', cursor: 'pointer',
          font: 'var(--type-label)', color: 'var(--fg-3)',
        }}
      >
        <Icon name="calendar-plus" size={15} style={{ color: 'var(--job-sky)' }} />
        Make it an event, to count down to
      </button>

      <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
        <FieldLabel icon={<Icon name="list" size={14} />}>Where it goes</FieldLabel>
        <CustomDropdown
          ariaLabel="Where this goes"
          value={captureListId}
          onChange={setCaptureListId}
          options={[
            ...(day ? [] : [{ value: 'focus', label: 'Add to Current Focus Session' }]),
            ...taskLists.map((l) => ({ value: l.id, label: l.title })),
          ]}
        />
      </div>

      {/* The sheet's confirm: solid white since 29-1P2. */}
      <WhiteButton
        block
        disabled={!captureTitle.trim()}
        onClick={handleSave}
        icon={<Icon name="plus" size={18} />}
      >
        Save task
      </WhiteButton>
    </Dialog>
  );
}
