/**
 * "Hive-mind" location: the task's primary list, plus any additional lists (in
 * any project) it is also shown in (UI-13). It stays one underlying record, so
 * editing it anywhere edits it everywhere.
 *
 * **This is the one editor that still writes its own labels**, because it is
 * two fields rather than one — both hosts hand every other editor a
 * `FieldLabel` and a level-1 group and expect only the control back. The two
 * labels here are that same `FieldLabel`, so they sit at the same size, colour
 * and tracking as the ones the host draws around them; they used to be
 * `fieldStyles.labelCls`, which was a hand-rolled copy of it.
 *
 * **The violet chips are neutral now.** Violet is `--status-backburner` in
 * this design system, and a list a task is also shown in is not a backburner
 * item — it was decoration, which `colors.css` forbids for the status hues.
 */
import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useStore } from '../../store/useStore';
import { FieldLabel, Icon, IconButton } from '../../ui';
import CustomDropdown from '../CustomDropdown';
import FieldChip from './FieldChip';

interface ListLocationPickerProps {
  listId: string;
  sharedListIds: string[];
  onListIdChange: (listId: string) => void;
  onSharedListIdsChange: (listIds: string[]) => void;
}

export default function ListLocationPicker({
  listId, sharedListIds, onListIdChange, onSharedListIdsChange,
}: ListLocationPickerProps) {
  const { taskLists, projects } = useStore();
  const [pendingShareId, setPendingShareId] = useState('');

  const listLabel = (id: string) => {
    const list = taskLists.find((l) => l.id === id);
    if (!list) return 'Unknown list';
    const owningProject = projects.find((p) => p.id === list.projectId);
    return owningProject ? `${owningProject.icon ?? '📋'} ${list.title} · ${owningProject.name}` : `🗂️ ${list.title}`;
  };

  const primaryOptions = taskLists.map((l) => ({ value: l.id, label: listLabel(l.id) }));
  const shareableOptions = taskLists
    .filter((l) => l.id !== listId && !sharedListIds.includes(l.id))
    .map((l) => ({ value: l.id, label: listLabel(l.id) }));

  /* `minmax(0, 1fr)` on all three grids: a label here is a list's name AND
     its project's, and a chip or trigger holding a long one was wider than
     the Context pane — which widened the pane, and Timing above it, past the
     sheet's edge. With the tracks pinned, the chip ellipsizes instead. */
  const TRACK = 'minmax(0, 1fr)';

  return (
    <div style={{ display: 'grid', gridTemplateColumns: TRACK, gap: 'var(--gap-stack)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: TRACK, gap: 'var(--sp-3)' }}>
        <FieldLabel icon={<Icon name="folder-open" size={14} />}>List &amp; project</FieldLabel>
        <CustomDropdown
          ariaLabel="List & project"
          value={listId}
          onChange={(v) => onListIdChange(v as string)}
          options={primaryOptions}
          placeholder="Choose a list…"
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: TRACK, gap: 'var(--sp-3)' }}>
        <FieldLabel icon={<Icon name="share-2" size={14} />}>Also shown in</FieldLabel>

        {sharedListIds.length > 0 && (
          <div className="flex flex-wrap" style={{ gap: 'var(--sp-3)' }}>
            <AnimatePresence>
              {sharedListIds.map((lid) => (
                <FieldChip
                  key={lid}
                  icon={<Icon name="link-2" size={12} />}
                  onRemove={() => onSharedListIdsChange(sharedListIds.filter((id) => id !== lid))}
                  removeLabel={`Stop showing in ${listLabel(lid)}`}
                  title={listLabel(lid)}
                >
                  {listLabel(lid)}
                </FieldChip>
              ))}
            </AnimatePresence>
          </div>
        )}

        {shareableOptions.length > 0 && (
          <div className="flex items-center" style={{ gap: 'var(--sp-4)' }}>
            <div className="flex-1 min-w-0">
              <CustomDropdown
                ariaLabel="Share into another list"
                value={pendingShareId}
                onChange={(v) => setPendingShareId(v as string)}
                options={shareableOptions}
                placeholder="Share into another list…"
              />
            </div>
            <IconButton
              size="sm"
              label="Share into list"
              disabled={!pendingShareId}
              onClick={() => {
                if (!pendingShareId) return;
                onSharedListIdsChange([...sharedListIds, pendingShareId]);
                setPendingShareId('');
              }}
            >
              <Icon name="plus" size={16} />
            </IconButton>
          </div>
        )}

        <p style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', textWrap: 'pretty' }}>
          Shared tasks stay perfectly in sync — editing, completing, or scoring this task updates it
          everywhere it appears.
        </p>
      </div>
    </div>
  );
}
