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
 */
import { useState } from 'react';
import { useStore } from '../store/useStore';
import { useOverlayDismiss } from '../lib/useOverlayDismiss';
import { Z } from '../lib/zLayers';
import { Button, Dialog, FieldLabel, Icon, IconButton, Input } from '../ui';
import CustomDropdown from './CustomDropdown';

interface CaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CaptureModal({ isOpen, onClose }: CaptureModalProps) {
  const { tasks, setTasks, taskLists, addBacklogTask } = useStore();
  const [captureTitle, setCaptureTitle] = useState('');
  const [captureListId, setCaptureListId] = useState('focus');

  useOverlayDismiss(isOpen, onClose);

  const handleSave = () => {
    if (!captureTitle.trim()) return;

    if (captureListId === 'focus') {
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

      <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
        <FieldLabel icon={<Icon name="list" size={14} />}>Where it goes</FieldLabel>
        <CustomDropdown
          ariaLabel="Where this goes"
          value={captureListId}
          onChange={setCaptureListId}
          options={[
            { value: 'focus', label: 'Add to Current Focus Session' },
            ...taskLists.map((l) => ({ value: l.id, label: l.title })),
          ]}
        />
      </div>

      <Button
        block
        size="lg"
        variant="solid"
        tone="accent"
        disabled={!captureTitle.trim()}
        onClick={handleSave}
        iconLeft={<Icon name="plus" size={18} />}
      >
        Save task
      </Button>
    </Dialog>
  );
}
