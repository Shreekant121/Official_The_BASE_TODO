/**
 * New Session — the "New list" form (UI-15).
 *
 * Lifted out of `TaskSelection.tsx` and rebuilt on Aurora Glass. **The draft
 * stays in the screen**, not here: `TaskSelection` still owns the title and
 * the chosen project, so toggling the form shut and open again finds what you
 * typed exactly where the old code left it. Only the project popover's
 * open/closed flag is local, because nothing outside this form has ever had
 * an opinion about it.
 *
 * WHAT CHANGED, AND WHAT DID NOT
 * ------------------------------
 * `addTaskList` is still called once per non-empty line, in order, by the
 * screen's own `handleAddListLines` — bulk creation is `BulkAddInput`'s and
 * this form only hands it the lines. Escape still cancels, Enter still
 * submits, and pasting several lines still creates several lists.
 *
 * The panel is a `Well`. A form is a trough you type INTO, which is the whole
 * Card/Well inversion in `ui/layout/panels.tsx` — the old one was a raised
 * pane wearing a green rim and a 30px emerald glow, which in this system
 * announces something is LIVE. Nothing about naming a list is live.
 *
 * The project picker keeps `PortalDropdown`: this wrapper animates its own
 * height, which needs `overflow: hidden`, so an in-flow popover would be
 * clipped by the form it belongs to. See `../pickers.tsx`, which UI-18 moved
 * up out of `session/` when `CustomDropdown` started sharing it.
 */
import { useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import BulkAddInput from '../BulkAddInput';
import { PortalDropdown } from '../PortalDropdown';
import { parseBulkLines } from '../../lib/bulkAdd';
import { Button, Icon, Well, WhiteButton } from '../../ui';
import type { Project } from '../../store/useStore';
import { buildProjectTree, flattenProjectTree } from '../../lib/projectTree';
import { PickerButton, PickerEmpty, PickerList, PickerOption } from '../pickers';
import AppIcon from '../AppIcon';

/**
 * The typed line itself. No well of its own: the panel around it is already
 * one, and a carved pill inside a carved panel inside a card is three levels
 * of surface for one line of text — the same call `QueueSubtaskTree` makes
 * about its inline add field. `AddTaskForm` keeps its own copy at its own
 * size, which is the one thing that differs between the two forms.
 */
const FORM_FIELD = {
  flex: 1,
  minWidth: 0,
  padding: 0,
  border: 0,
  outline: 'none',
  boxShadow: 'none',
  background: 'transparent',
  font: 'var(--type-body)',
  letterSpacing: 'var(--tracking-ui)',
  color: 'var(--fg-1)',
} as const;

export interface NewListFormProps {
  open: boolean;
  title: string;
  onTitleChange: (value: string) => void;
  projectId: string;
  onProjectIdChange: (value: string) => void;
  projects: Project[];
  /** One title per line, in order. The screen creates the lists. */
  onSubmitLines: (lines: string[]) => void;
  onCancel: () => void;
}

export default function NewListForm({
  open, title, onTitleChange, projectId, onProjectIdChange, projects, onSubmitLines, onCancel,
}: NewListFormProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLButtonElement>(null);

  const chosen = projects.find((p) => p.id === projectId);
  // Tree order, each project under the one it sits in (BIG-2).
  const rows = useMemo(() => flattenProjectTree(buildProjectTree(projects)), [projects]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ height: 0, opacity: 0, marginTop: 0 }}
          animate={{ height: 'auto', opacity: 1, marginTop: 16 }}
          exit={{ height: 0, opacity: 0, marginTop: 0 }}
          style={{ flex: '0 0 auto', overflow: 'hidden' }}
        >
          <Well pad="var(--sp-5)" style={{ display: 'grid', gap: 'var(--sp-5)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)' }}>
              <Icon name="list" size={16} style={{ color: 'var(--fg-4)' }} />
              <BulkAddInput
                autoFocus
                ariaLabel="New list name"
                value={title}
                onChange={onTitleChange}
                onSubmitLines={onSubmitLines}
                onCancel={onCancel}
                placeholder="List name… paste multiple lines to bulk-create"
                className="ag-field"
                style={FORM_FIELD}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)' }}>
              <Icon name="folder-open" size={16} style={{ color: 'var(--fg-4)' }} />
              <PickerButton
                ref={pickerRef}
                open={pickerOpen}
                muted={!chosen}
                glyph={chosen ? <AppIcon icon={chosen.icon} size={16} /> : undefined}
                onClick={() => setPickerOpen((v) => !v)}
                style={{ flex: 1, minWidth: 0 }}
              >
                {chosen?.name ?? 'No project'}
              </PickerButton>

              <PortalDropdown
                isOpen={pickerOpen}
                onClose={() => setPickerOpen(false)}
                onOpen={() => setPickerOpen(true)}
                triggerRef={pickerRef}
                width={280}
              >
                <PickerList maxHeight="min(50vh, 300px)">
                  <PickerOption
                    selected={!projectId}
                    glyph={<span aria-hidden="true">🗂️</span>}
                    meta="Standalone"
                    onClick={() => { onProjectIdChange(''); setPickerOpen(false); }}
                  >
                    No project
                  </PickerOption>
                  {rows.map(({ project: p, depth }) => (
                    <PickerOption
                      key={p.id}
                      depth={depth}
                      selected={projectId === p.id}
                      glyph={<AppIcon icon={p.icon} size={16} />}
                      onClick={() => { onProjectIdChange(p.id); setPickerOpen(false); }}
                    >
                      {p.name}
                    </PickerOption>
                  ))}
                  {projects.length === 0 && (
                    <PickerEmpty>No projects yet. Make one on **Home**.</PickerEmpty>
                  )}
                </PickerList>
              </PortalDropdown>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-3)' }}>
              <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
              {/* The form's confirm: solid white since 29-1P2. */}
              <WhiteButton
                size="sm"
                disabled={!title.trim()}
                onClick={() => onSubmitLines(parseBulkLines(title))}
                icon={<Icon name="plus-circle" size={14} />}
              >
                Create list
              </WhiteButton>
            </div>
          </Well>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
