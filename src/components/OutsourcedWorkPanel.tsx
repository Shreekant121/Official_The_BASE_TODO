/**
 * Owner-side control room for outsourced ("contribution") shares — rebuilt on
 * Aurora Glass (UI-18).
 *
 * Given the set of share ids the current project/list exposes, it
 * live-subscribes to every worker submission (see `lib/shareSubmissions.ts`)
 * and lets the owner approve work — which completes the underlying task, and
 * that re-pushes the public snapshot so the worker sees "Approved ✓" — or send
 * it back for more work.
 *
 * Renders nothing when there are no active submissions, so it stays invisible
 * for plain view-only shares.
 *
 * **Every subscription, id-stability and store call below is untouched.** The
 * `idsKey`/`ids` memo pair still exists so the effect does not resubscribe on
 * every render, `entries` is still read through `ids` rather than over all of
 * `byShare`, and approving still goes through `updateBacklogTask` — which is
 * the one path a task's status may change on (CLAUDE.md), and therefore the
 * only place a repeating outsourced task can spawn its successor.
 *
 * THE TWO STATES ARE STATUSES NOW, AND THAT IS THE POINT
 * -----------------------------------------------------
 * The panel used to be a single emerald-tinted box: emerald border, emerald
 * wash, an emerald "N awaiting approval" chip and an emerald Approve button,
 * with the two states told apart by a small amber tick versus a small blue
 * play glyph. That is emerald spent on a topic — "this section is about
 * outsourcing" — and the design system rations it to mean *live* and nothing
 * else.
 *
 * So the panel is a plain `Card` and the two states carry the hues they
 * actually are:
 *
 *   in progress  →  `running`. Somebody is working on this right now. It is
 *                   the one genuinely live thing on the screen, and it gets
 *                   `StatusPill`'s ripple for free — which IS the system's
 *                   whole signalling rule, not decoration.
 *   submitted    →  `review`, "needs a look" — grey with its triangle since
 *                   29-1P2c2 (it was amber). It is waiting on the owner.
 *
 * Submitted rows come first for the same reason they always did: the ones
 * waiting on you outrank the ones that are not.
 *
 * BUILD-14 gave a worker an email to claim with and a link and a note to
 * submit. They live in a document only the owner can read
 * (`subscribeSubmissionDetails`), and each row prints what it has. A task
 * the worker released reads as no row at all.
 */
import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore, formatINR } from '../store/useStore';
import { Button, Card, Icon, Kicker, StatusPill, Well, WhiteButton } from '../ui';
import {
  subscribeSubmissions, subscribeSubmissionDetails, setSubmission, clearSubmission, normaliseFilesLink,
  type ShareSubmission, type SubmissionDetails,
} from '../lib/shareSubmissions';

interface Entry extends ShareSubmission {
  shareId: string;
}

export default function OutsourcedWorkPanel({ shareIds }: { shareIds: string[] }) {
  const backlogTasks = useStore((s) => s.backlogTasks);
  const updateBacklogTask = useStore((s) => s.updateBacklogTask);
  const [byShare, setByShare] = useState<Record<string, ShareSubmission[]>>({});
  const [detailsByShare, setDetailsByShare] = useState<Record<string, SubmissionDetails[]>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  // Stable identity so the effect doesn't resubscribe on every render.
  const idsKey = useMemo(() => [...new Set(shareIds)].sort().join(','), [shareIds]);
  const ids = useMemo(() => (idsKey ? idsKey.split(',') : []), [idsKey]);

  useEffect(() => {
    if (ids.length === 0) return;
    const unsubs = ids.flatMap((sid) => [
      subscribeSubmissions(sid, (subs) => setByShare((prev) => ({ ...prev, [sid]: subs }))),
      subscribeSubmissionDetails(sid, (d) => setDetailsByShare((prev) => ({ ...prev, [sid]: d }))),
    ]);
    return () => unsubs.forEach((u) => u());
  }, [ids]);

  // Read through `ids` rather than over all of `byShare`, so submissions left in
  // state by a share we no longer subscribe to are ignored instead of needing a
  // reset write from the effect.
  const entries: Entry[] = useMemo(() => {
    const list: Entry[] = [];
    for (const shareId of ids) {
      for (const s of byShare[shareId] ?? []) list.push({ ...s, shareId });
    }
    return list.sort((a, b) => b.updatedAt - a.updatedAt);
  }, [byShare, ids]);

  const detailsOf = (e: Entry) => (detailsByShare[e.shareId] ?? []).find((d) => d.taskId === e.taskId);

  const submitted = entries.filter((e) => e.state === 'submitted');
  const inProgress = entries.filter((e) => e.state === 'in_progress');

  // Not `entries`: a released task is still a document, and it is no row.
  if (submitted.length + inProgress.length === 0) return null;

  const taskLabel = (taskId: string) => {
    const t = backlogTasks.find((bt) => bt.id === taskId);
    return { title: t?.title ?? 'Untitled task', valueINR: t?.valueINR };
  };

  const approve = async (e: Entry) => {
    setBusyId(e.taskId);
    try {
      updateBacklogTask(e.taskId, { status: 'completed', completedAt: Date.now() });
      await clearSubmission(e.shareId, e.taskId);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not approve this task.');
    } finally {
      setBusyId(null);
    }
  };

  const sendBack = async (e: Entry) => {
    setBusyId(e.taskId);
    try {
      await setSubmission(e.shareId, e.taskId, e.workerName || 'Worker', 'in_progress');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not send this task back.');
    } finally {
      setBusyId(null);
    }
  };

  const row = (e: Entry, kind: 'submitted' | 'in_progress') => {
    const { title, valueINR } = taskLabel(e.taskId);
    const busy = busyId === e.taskId;
    const waiting = kind === 'submitted';
    const details = detailsOf(e);
    // Re-checked here though the worker's page checked it: this is a document
    // a stranger wrote, and it becomes a link he clicks.
    const link = waiting && details?.link ? normaliseFilesLink(details.link) : null;
    const note = waiting ? details?.note?.trim() : undefined;

    return (
      <motion.div
        key={`${e.shareId}:${e.taskId}`}
        layout
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
      >
        <Well
          pad="var(--sp-4) var(--sp-5)"
          className="flex flex-wrap items-center"
          style={{ gap: 'var(--sp-5)' }}
        >
          <div className="flex-1" style={{ minWidth: 180, display: 'grid', gap: 'var(--sp-2)' }}>
            <span
              style={{
                font: 'var(--type-label)',
                color: 'var(--fg-1)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {title}
            </span>
            <span className="flex flex-wrap items-center" style={{ gap: 'var(--sp-3)' }}>
              <StatusPill size="sm" status={waiting ? 'review' : 'running'}>
                {waiting ? 'Submitted' : 'In progress'}
              </StatusPill>
              <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)' }}>{e.workerName}</span>
              {/* The one number in this panel, so it is set in the mono voice
                  every other number in the app is. */}
              {valueINR ? (
                <span
                  style={{
                    font: 'var(--type-kicker)',
                    letterSpacing: 'var(--tracking-kicker)',
                    fontVariantNumeric: 'tabular-nums',
                    color: 'var(--fg-3)',
                  }}
                >
                  {formatINR(valueINR)}
                </span>
              ) : null}
              {details?.email && (
                <a
                  href={`mailto:${details.email}`}
                  style={{ font: 'var(--type-caption)', color: 'var(--fg-2)', overflowWrap: 'anywhere' }}
                >
                  {details.email}
                </a>
              )}
            </span>
            {link && (
              <a
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-2)', minWidth: 0,
                  font: 'var(--type-caption)', color: 'var(--fg-1)',
                }}
              >
                <Icon name="link" size={13} style={{ flex: '0 0 auto' }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{link}</span>
              </a>
            )}
            {note && (
              <p style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', whiteSpace: 'pre-wrap', textWrap: 'pretty' }}>
                {note}
              </p>
            )}
          </div>

          {waiting && (
            <div className="flex items-center" style={{ gap: 'var(--sp-3)', flex: '0 0 auto' }}>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => sendBack(e)}
                disabled={busy}
                title="Send back for more work"
                iconLeft={<Icon name="undo-2" size={14} />}
              >
                Send back
              </Button>
              <WhiteButton
                size="sm"
                disabled={busy}
                aria-busy={busy || undefined}
                onClick={() => approve(e)}
                icon={<Icon name="check" size={14} />}
              >
                Approve
              </WhiteButton>
            </div>
          )}
        </Well>
      </motion.div>
    );
  };

  return (
    <Card style={{ marginBottom: 'var(--gap-card)', display: 'grid', gap: 'var(--sp-5)' }}>
      <div className="flex items-center" style={{ gap: 'var(--sp-4)' }}>
        <Icon name="users" size={16} style={{ color: 'var(--fg-4)', flex: '0 0 auto' }} />
        <Kicker>Outsourced work</Kicker>
        <span style={{ flex: 1 }} />
        {submitted.length > 0 && (
          <StatusPill size="sm" status="review">
            {submitted.length} awaiting approval
          </StatusPill>
        )}
      </div>

      <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
        <AnimatePresence initial={false}>
          {submitted.map((e) => row(e, 'submitted'))}
          {inProgress.map((e) => row(e, 'in_progress'))}
        </AnimatePresence>
      </div>
    </Card>
  );
}
