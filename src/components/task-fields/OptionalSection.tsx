/**
 * OPT-5 — the Optional section, closed at the foot of the task sheet and the
 * Score screen. His words: *"put Start date and Reminder and status and the
 * share section in a new optional Section at the end so it is hidden and as it
 * is not important so it doesn't need to be spent time on."* The sheet adds
 * Value to it as `children` (his call, 2026-10-06: "hide value too"); the
 * Score screen keeps Value in its score pane.
 *
 * One component for both screens, so the two cannot list different fields.
 * It is closed every time either screen opens and remembers nothing, also his
 * call — the open/shut flag belongs to the caller and lives in plain state.
 *
 * **Share writes at once, and that is unchanged.** `ShareField` below is the
 * task sheet's share code moved here whole: the first press stores `shareId`
 * and publishes the public page straight away rather than through the draft,
 * so the link works the moment you have it. On the Score screen that is the
 * one thing in this section that does not wait for Save, which is why its
 * hint there says so — the old screen kept Share off for exactly that reason,
 * and he asked for it anyway.
 */
import { useState, type CSSProperties, type ReactNode } from 'react';
import { Icon, Input, SoftButton, SoftToggle } from '../../ui';
import { useStore, type Task, type TaskStatus } from '../../store/useStore';
import { useAuth } from '../../contexts/AuthContext';
import { makeShareId, shareTask, shareUrl, type ShareSettings } from '../../lib/publicShare';
import ShareModal from '../ShareModal';
import { CollapsibleSection } from './CollapsibleSection';
import { Labelled } from './Labelled';
import LinksEditor from './LinksEditor';
import ReminderPicker from './ReminderPicker';
import { REMINDER_OPTIONS, REMINDER_USE_DEFAULT } from './reminderOptions';
import StatusPills from './StatusPills';
import { STATUS_OPTIONS } from './taskStatusOptions';
import type { TaskDraftController } from './useTaskDraft';

// ── Share ──────────────────────────────────────────────────────────────────

interface ShareFieldProps {
  task: Task;
  /** The draft's edits, merged into the first publish so the page shows what is on screen. */
  toUpdates: () => Partial<Task>;
  hint: ReactNode;
}

function ShareField({ task, toUpdates, hint }: ShareFieldProps) {
  const { user } = useAuth();
  const updateBacklogTask = useStore((s) => s.updateBacklogTask);

  // Public share / SimpleURL short link. `shareId` is written straight to the
  // store on first share (not via the staged form), so the public snapshot
  // exists immediately; the debounced reconcile in firestoreSync keeps it live.
  const [shareId, setShareId]               = useState(task.shareId);
  const [shortUrlKeyword, setShortUrlKeyword] = useState(task.shortUrlKeyword);
  const [shortUrlDomain, setShortUrlDomain] = useState(task.shortUrlDomain);
  const [shareSettings, setShareSettings] = useState<ShareSettings>({
    shareAllowContributions: task.shareAllowContributions,
    shareShowPeople: task.shareShowPeople,
    shareExpiresOn: task.shareExpiresOn,
  });
  const [hiddenFromShare, setHiddenFromShare] = useState(!!task.hiddenFromShare);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [sharing, setSharing]               = useState(false);

  const handleShare = async () => {
    if (!user) return;
    setSharing(true);
    try {
      let id = shareId;
      if (!id) {
        id = makeShareId();
        setShareId(id);
        updateBacklogTask(task.id, { shareId: id });
      }
      // Snapshot the stored task merged with the current (possibly unsaved)
      // edits, so the shared page reflects what's on screen right away.
      await shareTask(id, user.uid, {
        ...task,
        ...toUpdates(),
        shareId: id,
        ...shareSettings,
      });
      setShareModalOpen(true);
    } catch (err) {
      console.error('Failed to share task', err);
      alert(`Couldn't create the share link. ${err instanceof Error ? err.message : 'Please try again.'}`);
    } finally {
      setSharing(false);
    }
  };

  const handleShareKeywordChange = (keyword?: string, domain?: string) => {
    setShortUrlKeyword(keyword);
    setShortUrlDomain(domain);
    updateBacklogTask(task.id, { shortUrlKeyword: keyword, shortUrlDomain: domain });
  };

  const handleShareSettingsChange = async (patch: ShareSettings) => {
    if (!user || !shareId) return;
    const next = { ...shareSettings, ...patch };
    setShareSettings(next);
    updateBacklogTask(task.id, patch);
    try {
      await shareTask(shareId, user.uid, { ...task, shareId, ...next });
    } catch (err) {
      console.error('Failed to update share settings', err);
    }
  };

  const handleToggleHidden = () => {
    const next = !hiddenFromShare;
    setHiddenFromShare(next);
    updateBacklogTask(task.id, { hiddenFromShare: next });
  };

  return (
    <>
      {/* Bare text, NOT a `<Hint>`. `Labelled` puts the hint in one itself,
          and a `<Hint>` handed to it nested `<p>` inside `<p>` — which the
          parser is obliged to un-nest, so the sentence escaped the field and
          React logged an invalid-nesting error every time the sheet opened. */}
      <Labelled label="Share" icon="share-2" hint={hint}>
        <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
          <SoftButton
            onClick={handleShare}
            disabled={sharing || !user}
            aria-busy={sharing || undefined}
            icon={<Icon name="share-2" size={16} />}
            style={{ width: '100%', justifyContent: 'flex-start' }}
          >
            {sharing ? 'Publishing…' : shortUrlKeyword ? 'Manage share link' : shareId ? 'Open public link' : 'Create a public link'}
            {shortUrlKeyword && (
              <span
                style={{
                  font: 'var(--type-kicker)', letterSpacing: 'var(--tracking-kicker)',
                  textTransform: 'var(--kicker-transform)' as CSSProperties['textTransform'], color: 'var(--hue-cyan)',
                }}
              >
                Linked
              </span>
            )}
          </SoftButton>

          {/* Blinding: keep this task out of any shared list/project view. A
              soft toggle since 29-1P2, pressed in while the task is hidden.
              Grey with its eye-off icon since 29-1P2c3, his call: it was
              rose, and rose is his routine's colour now; being withheld is
              not an error either, so the icon and the pressed-in toggle
              say it, quietly, the way a warning does. */}
          <SoftToggle
            pressed={hiddenFromShare}
            onClick={handleToggleHidden}
            title="Hide this task from any shared/public list or project link"
            icon={<Icon name={hiddenFromShare ? 'eye-off' : 'eye'} size={16} />}
            style={{
              width: '100%', justifyContent: 'flex-start',
              color: hiddenFromShare ? 'var(--fg-2)' : undefined,
            }}
          >
            {hiddenFromShare ? 'Hidden from shared links' : 'Visible in shared links'}
          </SoftToggle>
        </div>
      </Labelled>

      {/* Its own `Dialog`, so it portals out of the closed section. */}
      {shareModalOpen && shareId && (
        <ShareModal
          publicUrl={shareUrl(shareId)}
          entityType="task"
          currentKeyword={shortUrlKeyword}
          currentDomain={shortUrlDomain}
          onKeywordChange={handleShareKeywordChange}
          settings={shareSettings}
          onSettingsChange={(patch) => void handleShareSettingsChange(patch)}
          onClose={() => setShareModalOpen(false)}
        />
      )}
    </>
  );
}

// ── The summary under the title ────────────────────────────────────────────

const STATUS_LABEL = Object.fromEntries(STATUS_OPTIONS.map((o) => [o.value, o.label])) as Record<TaskStatus, string>;

/** `2026-03-14T09:00` → `starts 14 Mar`. */
function startPhrase(startDate: string): string | undefined {
  if (!startDate) return undefined;
  const d = new Date(startDate);
  if (Number.isNaN(d.getTime())) return undefined;
  return `starts ${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
}

/**
 * What is in the section, closed — so a shut section still says the one
 * thing worth knowing about each field. The share half is read off the store
 * because the share buttons write there at once, not to the draft.
 */
function summaryOf(draft: TaskDraftController['draft'], shared: boolean, hidden: boolean): string {
  const reminder = draft.reminderMinutes === REMINDER_USE_DEFAULT
    ? 'default reminder'
    : (REMINDER_OPTIONS.find((o) => o.value === draft.reminderMinutes)?.label ?? 'custom reminder').toLowerCase();
  return [
    STATUS_LABEL[draft.status],
    startPhrase(draft.startDate),
    reminder,
    draft.links.length > 0 ? `${draft.links.length} link${draft.links.length === 1 ? '' : 's'}` : undefined,
    hidden ? 'hidden from shared links' : shared ? 'public link' : 'not shared',
  ].filter(Boolean).join(' · ');
}

// ── The section ────────────────────────────────────────────────────────────

interface OptionalSectionProps {
  task: Task;
  controller: Pick<TaskDraftController, 'draft' | 'setField' | 'toUpdates'>;
  /** Item 19 — why this task cannot be marked Done, or absent. Straight through to `StatusPills`. */
  lockReason?: string;
  open: boolean;
  onToggle: () => void;
  /** See `CollapsibleSection`. The sheet passes `false`. */
  blur?: boolean;
  /** Says when the share buttons publish, in the caller's own terms. */
  shareHint: ReactNode;
  /** Fields one screen adds after Status — the sheet's Value. */
  children?: ReactNode;
  /** Fields one screen adds last, after Share — the sheet's Milestone (29-1P9b). */
  after?: ReactNode;
}

export function OptionalSection({
  task, controller, lockReason, open, onToggle, blur, shareHint, children, after,
}: OptionalSectionProps) {
  const { draft, setField, toUpdates } = controller;
  const live = useStore((s) => s.backlogTasks.find((t) => t.id === task.id));
  const shared = !!(live ?? task).shareId;
  const hidden = !!(live ?? task).hiddenFromShare;

  return (
    <CollapsibleSection
      icon="sliders-horizontal"
      title="Optional"
      hint={summaryOf(draft, shared, hidden)}
      open={open}
      onToggle={onToggle}
      blur={blur}
    >
      {/* Side by side where there is room — under the sheet's three columns it
          is 1,100px wide, and a date field that long reads as empty — one
          above the other in the Score screen's narrow right-hand column. */}
      <div
        style={{
          display: 'grid', gap: 'var(--gap-stack)', alignItems: 'start',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
        }}
      >
        <Labelled
          label="Start date"
          icon="play"
          hint={<>Keeps it out of sessions until then.</>}
        >
          <Input
            type="datetime-local"
            value={draft.startDate}
            onChange={(e) => setField('startDate', e.target.value)}
            aria-label="Start date"
          />
        </Labelled>

        <Labelled label="Reminder" icon="bell">
          <ReminderPicker
            value={draft.reminderMinutes}
            customMinutes={draft.customReminderMinutes}
            onChange={(v) => setField('reminderMinutes', v)}
            onCustomMinutesChange={(v) => setField('customReminderMinutes', v)}
          />
        </Labelled>

        {/* Item 19 — "Done" is refused while something this task depends on is
            unfinished; the other two pills stay live, because a locked task
            still edits. The lock is the caller's to work out: it is a fact
            about the stored task and its prerequisites, and each screen holds
            a different copy of the task. */}
        <Labelled label="Status" icon="circle-dot">
          <StatusPills
            value={draft.status}
            onChange={(v) => setField('status', v)}
            lockedComplete={lockReason}
          />
        </Labelled>

        {children}

        {/* Links joined at his word, out of the sheet's Context pane and the
            Score screen's Organize section alike. */}
        <Labelled label="Links" icon="link-2">
          <LinksEditor value={draft.links} onChange={(v) => setField('links', v)} />
        </Labelled>

        <ShareField task={task} toUpdates={toUpdates} hint={shareHint} />

        {after}
      </div>
    </CollapsibleSection>
  );
}
