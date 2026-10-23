/**
 * Jot it down — the quick-add block (29-1c1, idea 143: a brain-dump note).
 * What a line is, and which list it lands in, are pure and tested in
 * `lib/dashboard/quickAdd.ts`; this file is how it looks and when it writes.
 *
 * His calls: a note with no titles or lists to pick; **one task per line**;
 * into **the list chosen in the block's ⚙, Action Steps by default.** Filing
 * each line somewhere of its own is Atlas's, with BIG-8 (step 31).
 *
 * THE NOTE IS KEPT IN THE BLOCK'S SETTINGS, so it rides the Dashboard's own
 * document and the tablet sees what the laptop jotted. It is written a moment
 * after he stops typing and when he leaves the box, never on every key: the
 * document is written whole. A copy from the other device is taken only while
 * he is not typing here, so his own words are never replaced under the caret.
 *
 * Adding makes the tasks through `addBacklogTask`, the board's own path, in
 * the note's order, and empties the note. Creating is not something his undo
 * records (`useUndoStore` wraps edits, deletes and moves), so the block offers
 * its own Undo for a few seconds: the new tasks go to the Trash through the
 * one delete path, outside his undo (`withoutUndo`, so undoing an add is not
 * itself a delete to undo), and the note comes back.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon, LitLine, SoftButton, litSafe } from '../../ui';
import { useStore } from '../../store/useStore';
import { useDashboardStore } from '../../store/useDashboardStore';
import { withoutUndo } from '../../store/undoGate';
import { NOTE_MAX_CHARS, addLabel, noteLines, quickAddList } from '../../lib/dashboard/quickAdd';
import type { BlockProps } from './blocks';
import { useBlockMood } from './blockContext';
import { BlockTitle } from './parts';

/** How long after the last key the note is saved. */
const SAVE_AFTER_MS = 700;
/** How long the Undo line stays. */
const UNDO_FOR_MS = 8000;

interface Added {
  ids: string[];
  note: string;
  listTitle: string;
}

export function QuickAddBlock({ block, w }: BlockProps) {
  const saved = block.settings?.note ?? '';
  const taskLists = useStore((s) => s.taskLists);
  const list = useMemo(() => quickAddList(taskLists, block.settings?.listId), [taskLists, block.settings?.listId]);

  const [draft, setDraft] = useState(saved);
  const typing = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [added, setAdded] = useState<Added | null>(null);

  /* The other device's note, taken only while he is not typing here. */
  useEffect(() => {
    if (!typing.current) setDraft(saved);
  }, [saved]);

  const save = (text: string) => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    /* Absent, never '': an empty note is no note, and `updateSettings` removes an undefined. */
    if (text !== saved) useDashboardStore.getState().updateSettings(block.id, { note: text || undefined });
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  useEffect(() => {
    if (!added) return;
    const t = setTimeout(() => setAdded(null), UNDO_FOR_MS);
    return () => clearTimeout(t);
  }, [added]);

  const lines = useMemo(() => noteLines(draft), [draft]);
  useBlockMood(lines.length > 0 ? 'needs' : 'neutral');

  const onChange = (text: string) => {
    const next = text.slice(0, NOTE_MAX_CHARS);
    setDraft(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => save(next), SAVE_AFTER_MS);
  };

  const add = () => {
    if (lines.length === 0) return;
    const { addBacklogTask } = useStore.getState();
    const ids = lines.map((title) => addBacklogTask(title, list.id));
    setAdded({ ids, note: draft, listTitle: list.title });
    typing.current = false;
    setDraft('');
    save('');
  };

  const undo = () => {
    if (!added) return;
    const { deleteBacklogTask, backlogTasks } = useStore.getState();
    const still = new Set(backlogTasks.map((t) => t.id));
    withoutUndo(() => added.ids.filter((id) => still.has(id)).forEach((id) => deleteBacklogTask(id)));
    /* Anything typed since goes after what comes back. */
    const back = [added.note, draft].filter((t) => t.trim()).join('\n');
    setDraft(back);
    save(back);
    setAdded(null);
  };

  return (
    <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr auto', gap: 'var(--sp-4)', height: '100%', minHeight: 0 }}>
      <BlockTitle icon="square-pen">Jot it down</BlockTitle>
      <textarea
        className="dash-note ag-field ag-scroll"
        aria-label={`Jot things down, one per line. They become tasks in ${list.title}.`}
        placeholder={'One thing per line…\ncall the CA about the invoice\nbuy printer ink'}
        value={draft}
        maxLength={NOTE_MAX_CHARS}
        spellCheck
        onFocus={() => { typing.current = true; }}
        onBlur={() => { typing.current = false; save(draft); }}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          /* Ctrl+Enter adds, as a chat sends; a plain Enter is the next line. */
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); add(); }
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', minWidth: 0, minHeight: 36 }}>
        {added ? (
          <>
            <LitLine
              text={`${added.ids.length} added to **${litSafe(added.listTitle)}**`}
              style={{ flex: 1, minWidth: 0, font: 'var(--type-caption)', fontSize: 'var(--text-sm)', color: 'var(--fg-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            />
            <SoftButton size="sm" icon={<Icon name="undo-2" size={14} />} onClick={undo}>Undo</SoftButton>
          </>
        ) : (
          <>
            <span
              title={`They become tasks in ${list.title}. Change it in the widget's settings.`}
              style={{
                flex: 1, minWidth: 0, display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-2)',
                font: 'var(--type-caption)', fontSize: 'var(--text-sm)', color: 'var(--fg-3)',
                overflow: 'hidden', whiteSpace: 'nowrap',
              }}
            >
              <Icon name="corner-down-right" size={14} style={{ flex: '0 0 auto' }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{list.title}</span>
            </span>
            <SoftButton size="sm" icon={<Icon name="plus" size={14} />} disabled={lines.length === 0} onClick={add}>
              {lines.length === 0 ? 'Add' : w >= 2 ? addLabel(lines.length) : `Add ${lines.length}`}
            </SoftButton>
          </>
        )}
      </div>
    </div>
  );
}
