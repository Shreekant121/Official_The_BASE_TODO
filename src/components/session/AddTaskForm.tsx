/**
 * New Session — the "Add task" form (UI-15).
 *
 * Lifted out of `TaskSelection.tsx` and rebuilt on Aurora Glass, alongside
 * `NewListForm`, which it is deliberately a twin of: same `Well`, same field,
 * same button pair. The two sat side by side in one toolbar looking like two
 * different products — one was a raised pane with a white "Create List"
 * button, the other a raised pane with no commit control at all.
 *
 * `addBacklogTask` is still called once per non-empty line, in order, by the
 * screen's own `handleAddTaskLines`; the chosen list still lives in
 * `TaskSelection` so it survives the form closing, which is what makes adding
 * five tasks to one list five keystrokes rather than five journeys through a
 * picker.
 *
 * TWO THINGS THAT ARE NOT JUST PAINT
 * ----------------------------------
 * 1. **There is a "Add task" button now.** The form only ever committed on
 *    Enter, and on the tablet — half of what this app runs on — that meant a
 *    panel with no visible way to finish. Same fix UI-14 made to the rows'
 *    hover-only controls, same reason.
 *
 * 2. **Choosing a list no longer closes the form.** The wrapper closes itself
 *    when focus leaves it and nothing has been typed; the list popover is
 *    portalled to `<body>`, so pressing an option in it *is* focus leaving,
 *    and picking a list before typing a title threw the form away. The guard
 *    now stands down while the popover is open. It has been wrong since the
 *    picker was portalled — it is fixed here because this form is UI-15's.
 */
import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import BulkAddInput from '../BulkAddInput';
import { PortalDropdown } from '../PortalDropdown';
import { parseBulkLines } from '../../lib/bulkAdd';
import { Button, Icon, Well, WhiteButton } from '../../ui';
import type { TaskList } from '../../store/useStore';
import { PickerButton, PickerEmpty, PickerList, PickerOption } from '../pickers';

/** `NewListForm`'s copy, one step up in size — a task title is the heading. */
const FORM_FIELD = {
  flex: 1,
  minWidth: 0,
  padding: 0,
  border: 0,
  outline: 'none',
  boxShadow: 'none',
  background: 'transparent',
  font: 'var(--type-body)',
  fontWeight: 'var(--weight-medium)',
  letterSpacing: 'var(--tracking-ui)',
  color: 'var(--fg-1)',
} as const;

export interface AddTaskFormProps {
  open: boolean;
  title: string;
  onTitleChange: (value: string) => void;
  listId: string;
  onListIdChange: (value: string) => void;
  taskLists: TaskList[];
  /** One title per line, in order. The screen creates the tasks. */
  onSubmitLines: (lines: string[]) => void;
  onCancel: () => void;
}

export default function AddTaskForm({
  open, title, onTitleChange, listId, onListIdChange, taskLists, onSubmitLines, onCancel,
}: AddTaskFormProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLButtonElement>(null);

  const chosen = taskLists.find((l) => l.id === listId);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ height: 0, opacity: 0, marginTop: 0 }}
          animate={{ height: 'auto', opacity: 1, marginTop: 16 }}
          exit={{ height: 0, opacity: 0, marginTop: 0 }}
          style={{ flex: '0 0 auto', overflow: 'hidden' }}
          /* The self-dismiss guard rides the wrapper, not the `Well` — `Well`
             takes no event props. See note 2 in the header for why the
             popover has to stand it down. */
          tabIndex={-1}
          onBlur={(e) => {
            if (pickerOpen) return;
            if (!e.currentTarget.contains(e.relatedTarget) && !title.trim()) onCancel();
          }}
        >
          <Well pad="var(--sp-5)" style={{ display: 'grid', gap: 'var(--sp-5)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)' }}>
              <Icon name="circle" size={18} style={{ color: 'var(--fg-4)' }} />
              <BulkAddInput
                autoFocus
                ariaLabel="New task title"
                value={title}
                onChange={onTitleChange}
                onSubmitLines={onSubmitLines}
                onCancel={onCancel}
                placeholder="What needs to be done? Paste multiple lines to bulk-add"
                className="ag-field"
                style={FORM_FIELD}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)' }}>
              <Icon name="list" size={16} style={{ color: 'var(--fg-4)' }} />
              <PickerButton
                ref={pickerRef}
                open={pickerOpen}
                muted={!chosen}
                onClick={() => setPickerOpen((v) => !v)}
                style={{ flex: 1, minWidth: 0 }}
              >
                {chosen?.title ?? 'Select a list'}
              </PickerButton>

              <PortalDropdown
                isOpen={pickerOpen}
                onClose={() => setPickerOpen(false)}
                onOpen={() => setPickerOpen(true)}
                triggerRef={pickerRef}
                width={280}
              >
                <PickerList maxHeight="min(50vh, 300px)">
                  {taskLists.map((l) => (
                    <PickerOption
                      key={l.id}
                      selected={listId === l.id}
                      onClick={() => { onListIdChange(l.id); setPickerOpen(false); }}
                    >
                      {l.title}
                    </PickerOption>
                  ))}
                  {taskLists.length === 0 && (
                    <PickerEmpty>No lists yet. Make one with **New list**.</PickerEmpty>
                  )}
                </PickerList>
              </PortalDropdown>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-3)' }}>
              <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
              {/* The form's confirm: solid white since 29-1P2. */}
              <WhiteButton
                size="sm"
                disabled={!title.trim() || !listId}
                onClick={() => onSubmitLines(parseBulkLines(title))}
                icon={<Icon name="plus" size={14} />}
              >
                Add task
              </WhiteButton>
            </div>
          </Well>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
