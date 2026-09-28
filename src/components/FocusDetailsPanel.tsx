/**
 * Focus Mode's read-only task details — RECONCILED against
 * `design-system/screens/focus.html`'s `DetailsBody` (UI-32).
 *
 * Everything a task carries that is useful *while working on it* —
 * description, notes, cover image and clickable reference links — so that
 * re-reading the brief or opening a link never means leaving the session.
 * Deliberately not editable: "Edit" hands off to the real Task Detail panel
 * rather than duplicating its fields here.
 *
 * **WHAT CHANGED AT UI-32 IS WHERE IT SITS.** This was a drawer over the
 * timer, and the mockup names that as the old screen's first mistake — *"you
 * lost the thing you were working on to read about it"*. It is a
 * `FocusDockPanel` now, which grows out of the Details pill and sits BESIDE
 * the stage; that file carries the argument in full. The Edit control moved
 * with it: the source's `Panel` has no header slot, it has a `footer` holding
 * one ghost link out ("Open the full sheet"), and a 380px header carrying a
 * title, a subtitle, a button and a close target was one thing too many.
 * The heading is sentence case — "Task details" — because that is what the
 * mockup sets, and the panel is not one of the app's Title Case card headings.
 *
 * WHAT IS UNCHANGED. Which record is read, and the whole subtask-proxy rule
 * with it: a proxy inherits nothing but its description, so the parent task's
 * cover, notes and links are surfaced under their own labelled block, because
 * that is usually where the links actually are. `getListTitle`, the deadline
 * formatting and the `onEdit`-is-optional contract are all where they were.
 *
 * The blocks are `--glass-well`, which is the design system's answer to the
 * same question the source's `Well` answers — a Well is the trough you put
 * data INTO, and every one of these is something you read a value out of.
 *
 * The links keep their blue. It is the one colour in this app that is not a
 * status: `--hue-cyan` is what a hyperlink has always looked like, and dressing
 * a link in the accent would spend emerald on something that is not live.
 *
 * **Not taken from the source's `DetailsBody`:** its `ScoreDial` "Priority"
 * block, because the stage already shows that dial beside the status pill and
 * the mockup's own panel is the second reading of it; and its "Runs after X"
 * lock, which needs the dependency model the functional queue still owns.
 */
import type { ReactNode } from 'react';
import { getListTitle, useStore, type Task, type TaskLink } from '../store/useStore';
import { Button, FieldLabel, Icon, type IconName } from '../ui';
import { FocusDockPanel } from './FocusDockPanel';

interface FocusDetailsPanelProps {
  open: boolean;
  /** Docked beside the stage, or stacked under it. See `FocusDockPanel`. */
  docked: boolean;
  onClose: () => void;
  /** The task being worked on — for a dragged-in subtask this is its proxy. */
  task: Task;
  /**
   * The root task a subtask proxy came from. A `Subtask` only carries a
   * description, so its notes / links / cover live on this task instead and are
   * shown in their own clearly-labelled block.
   */
  parentTask?: Task | null;
  /** Omitted when there's no editable record behind the task (nothing to open). */
  onEdit?: () => void;
}

function Section({ label, icon, children }: { label: string; icon: IconName; children: ReactNode }) {
  return (
    <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
      <FieldLabel icon={<Icon name={icon} size={14} />}>{label}</FieldLabel>
      {children}
    </div>
  );
}

function TextBlock({ text }: { text: string }) {
  return (
    <p
      className="whitespace-pre-wrap break-words"
      style={{
        padding: 'var(--sp-5) var(--sp-6)',
        borderRadius: 'var(--r-lg)',
        background: 'var(--glass-well)',
        boxShadow: 'var(--glass-well-shadow)',
        font: 'var(--type-body)',
        fontSize: 'var(--text-sm)',
        lineHeight: 'var(--leading-relaxed)',
        color: 'var(--fg-2)',
      }}
    >
      {text}
    </p>
  );
}

function LinkList({ links }: { links: TaskLink[] }) {
  return (
    <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
      {links.map((link) => (
        <a
          key={link.id}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center"
          style={{
            gap: 'var(--sp-4)',
            padding: 'var(--sp-4) var(--sp-5)',
            borderRadius: 'var(--r-md)',
            background: 'var(--glass-well)',
            boxShadow: 'var(--glass-well-shadow)',
            textDecoration: 'none',
          }}
        >
          <span style={{ display: 'flex', color: 'var(--fg-4)', flex: '0 0 auto' }}>
            <Icon name="link-2" size={16} />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block truncate" style={{ font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--hue-cyan)' }}>
              {link.title}
            </span>
            <span className="block truncate" style={{ font: 'var(--type-kicker)', color: 'var(--fg-4)' }}>
              {link.url}
            </span>
          </span>
          <span style={{ display: 'flex', color: 'var(--fg-4)', flex: '0 0 auto' }}>
            <Icon name="external-link" size={14} />
          </span>
        </a>
      ))}
    </div>
  );
}

function MetaChip({ icon, children }: { icon: IconName; children: ReactNode }) {
  return (
    <span
      className="inline-flex items-center"
      style={{
        gap: 'var(--sp-3)',
        height: 24,
        padding: '0 var(--sp-4)',
        borderRadius: 'var(--r-pill)',
        backgroundImage: 'var(--glass-fill-1)',
        boxShadow: 'var(--glass-rim-1)',
        font: 'var(--type-kicker)',
        letterSpacing: 'var(--tracking-kicker)',
        color: 'var(--fg-3)',
        whiteSpace: 'nowrap',
      }}
    >
      <Icon name={icon} size={12} />
      {children}
    </span>
  );
}

function Cover({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="block overflow-hidden"
      style={{ borderRadius: 'var(--r-lg)', boxShadow: 'var(--glass-rim-1), var(--glass-cast-1)' }}
    >
      <img src={url} alt="" className="w-full max-h-56 object-cover" />
    </a>
  );
}

function formatDeadline(deadline: string): string {
  const date = new Date(deadline);
  if (Number.isNaN(date.getTime())) return deadline;
  return date.toLocaleString(undefined, {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

export interface FocusDetailsBodyProps {
  task: Task;
  parentTask?: Task | null;
  onEdit?: () => void;
}

/**
 * Everything the panel reads out, without the panel — FIX-10's landscape
 * column shows it in a pane of its own, beside the subtasks.
 */
export function FocusDetailsBody({ task, parentTask, onEdit }: FocusDetailsBodyProps) {
  const taskLists = useStore((s) => s.taskLists);

  const description = task.description?.trim();
  const notes = task.notes?.trim();
  const links = task.links ?? [];
  const tags = task.tags ?? [];
  const listTitle = getListTitle(taskLists, task.listId, task.listName);

  // A subtask proxy inherits nothing but its description, so surface the parent
  // task's reference material too — that's usually where the links actually are.
  const parentDescription = parentTask?.description?.trim();
  const parentNotes = parentTask?.notes?.trim();
  const parentLinks = parentTask?.links ?? [];
  const parentCover = parentTask?.imageUrl;
  const hasParentDetails = !!(parentDescription || parentNotes || parentLinks.length > 0 || parentCover);

  const hasOwnDetails = !!(description || notes || links.length > 0 || task.imageUrl);
  const hasMeta = !!(listTitle || task.deadline || task.estimatedTime || task.assignee || tags.length > 0);

  return (
    <div style={{ display: 'grid', gap: 'var(--sp-7)' }}>
      {hasMeta && (
        <div className="flex flex-wrap items-center" style={{ gap: 'var(--sp-3)' }}>
          {listTitle && <MetaChip icon="corner-down-right">{listTitle}</MetaChip>}
          {task.deadline && <MetaChip icon="calendar">{formatDeadline(task.deadline)}</MetaChip>}
          {!!task.estimatedTime && <MetaChip icon="clock">{task.estimatedTime}m</MetaChip>}
          {task.assignee && <MetaChip icon="user-circle">{task.assignee}</MetaChip>}
          {tags.map((tag) => (
            <MetaChip key={tag} icon="tag">{tag}</MetaChip>
          ))}
        </div>
      )}

      {task.imageUrl && <Cover url={task.imageUrl} />}

      {description && (
        <Section label="Description" icon="align-left">
          <TextBlock text={description} />
        </Section>
      )}

      {notes && (
        <Section label="Notes" icon="file-text">
          <TextBlock text={notes} />
        </Section>
      )}

      {links.length > 0 && (
        <Section label="Reference Materials" icon="link-2">
          <LinkList links={links} />
        </Section>
      )}

      {hasParentDetails && (
        <div
          style={{
            display: 'grid', gap: 'var(--sp-7)',
            paddingTop: 'var(--sp-6)', borderTop: '1px solid var(--line-faint)',
          }}
        >
          <p style={{ font: 'var(--type-caption)', color: 'var(--fg-4)' }}>
            From the parent task <span style={{ color: 'var(--fg-2)' }}>{parentTask?.title}</span>
          </p>

          {parentCover && <Cover url={parentCover} />}

          {parentDescription && (
            <Section label="Parent Description" icon="align-left">
              <TextBlock text={parentDescription} />
            </Section>
          )}

          {parentNotes && (
            <Section label="Parent Notes" icon="file-text">
              <TextBlock text={parentNotes} />
            </Section>
          )}

          {parentLinks.length > 0 && (
            <Section label="Parent Reference Materials" icon="link-2">
              <LinkList links={parentLinks} />
            </Section>
          )}
        </div>
      )}

      {!hasOwnDetails && !hasParentDetails && (
        <div
          className="flex flex-col items-center text-center"
          style={{
            gap: 'var(--sp-4)',
            padding: 'var(--sp-11) var(--sp-7)',
            borderRadius: 'var(--r-lg)',
            background: 'var(--glass-well)',
            boxShadow: 'var(--glass-well-shadow)',
          }}
        >
          <span style={{ display: 'flex', color: 'var(--fg-4)' }}>
            <Icon name="file-text" size={24} />
          </span>
          <p style={{ font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-2)' }}>
            No description, notes or links yet.
          </p>
          {onEdit && (
            <p style={{ font: 'var(--type-caption)', color: 'var(--fg-4)' }}>
              Tap Edit to add reference material to this task.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** The "Open the full sheet" link — the panel's footer, and the column's too. */
export function FocusDetailsEdit({ onEdit, parentTask }: { onEdit: () => void; parentTask?: Task | null }) {
  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={onEdit}
      title={parentTask ? 'Edit the parent task' : 'Edit this task'}
      iconRight={<Icon name="arrow-up-right" size={15} />}
    >
      {parentTask ? 'Open the parent task' : 'Open the full sheet'}
    </Button>
  );
}

export default function FocusDetailsPanel({ open, docked, onClose, task, parentTask, onEdit }: FocusDetailsPanelProps) {
  return (
    <FocusDockPanel
      open={open}
      docked={docked}
      onClose={onClose}
      title="Task details"
      subtitle={task.title}
      footer={onEdit && (
        <span style={{ justifySelf: 'start' }}>
          <FocusDetailsEdit onEdit={onEdit} parentTask={parentTask} />
        </span>
      )}
    >
      <FocusDetailsBody task={task} parentTask={parentTask} onEdit={onEdit} />
    </FocusDockPanel>
  );
}
