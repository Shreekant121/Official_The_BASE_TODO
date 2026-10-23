/**
 * The Storage panel on the Settings page.
 * Mockup: design-system/screens/settings.html (the "Storage" tab)
 *
 * The number that matters here is *not* how much disk the browser is using —
 * it is how close the single synced Firestore document is to Firebase's 1 MB
 * per-document cap. `firestoreSync.ts` writes the whole app into that one
 * document, and Firestore rejects the write outright once it is over: the app
 * would carry on working perfectly against localStorage while nothing reached
 * the cloud again. Nothing surfaces that today, hence this panel.
 *
 * `navigator.storage.estimate()` is reported as a footnote and nothing more.
 * It measures total origin bytes — Firebase Auth's IndexedDB, the offline
 * cache, the built assets — which on a fresh account is *larger* than the data
 * this panel is about, and moves for reasons that have nothing to do with it.
 * Leading with it would answer a question nobody asked.
 *
 * The Trash used to be the tab next to this one, which is why the footnotes
 * below end with a pointer to `/trash` rather than with nothing (item 9C).
 * This panel's whole advice is "delete things", and the one question that
 * advice raises — where do they go, and for how long — was answered by the tab
 * beside it until 9C moved Trash out to a screen of its own.
 *
 * Rebuilt on Aurora Glass. Every measurement above is unchanged — same
 * selectors, same `measureSyncDoc`, same thresholds. What moved is the
 * presentation: the figure is now a large light mono numeral, the composition
 * of the record is a proportion bar over a Well, and the ok/warn/critical
 * colours are lime / `--status-warn` / `--status-overrun` rather than
 * hardcoded emerald/amber/red hex (29-1P2c2: plenty of room is a meter
 * reading, lime like every meter; filling up is a quiet grey warning with its
 * triangle; almost full is coral).
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Icon, Kicker, Well } from '../ui';
import { useStore } from '../store/useStore';
import { useAuth } from '../contexts/AuthContext';
import { buildSyncPayload } from '../lib/firestoreSync';
import { formatBytes, measureSyncDoc, type SyncDocUsage } from '../lib/syncDocSize';

/** Bar, figure and warning band, keyed off how full the document is. */
const LEVEL_TOKEN = {
  ok: 'var(--job-lime)',
  warn: 'var(--status-warn)',
  critical: 'var(--status-overrun)',
} as const;

/**
 * Neutral shades for the composition bar, brightest first. The bar shows the
 * make-up of the record, NOT of the cap — at <1% of 1 MB a cap-relative bar
 * would be a single invisible sliver and would say nothing.
 */
const SHADE = ['0.52', '0.40', '0.30', '0.23', '0.17', '0.12', '0.08'];
const shadeAt = (i: number) => `rgba(255,255,255,${SHADE[i] ?? '0.06'})`;

/**
 * Deliberately coarse. This is an estimate the browser is free to revise
 * between two reads, so quoting it to the kilobyte would imply a precision it
 * does not have — and would make a screenshot of this page differ from itself.
 */
function formatApproxBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return 'less than 1 MB';
  return `about ${Math.round(mb)} MB`;
}

function headroomNote(usage: SyncDocUsage): string {
  const timesOver = usage.bytes > 0 ? usage.limitBytes / usage.bytes : Infinity;
  if (timesOver > 50) return 'Far more room left than this app is ever likely to need.';
  return `Plenty of room — roughly ${Math.floor(timesOver)}× as much again would still fit.`;
}

export default function StorageUsageSection() {
  const { user } = useAuth();

  // Selected slice by slice rather than as one object: a selector returning a
  // fresh object re-renders on every store write, and this one recomputes the
  // size of the entire dataset when it does.
  const taskLists = useStore((s) => s.taskLists);
  const backlogTasks = useStore((s) => s.backlogTasks);
  const tasks = useStore((s) => s.tasks);
  const sessionDuration = useStore((s) => s.sessionDuration);
  const taskTimeMemory = useStore((s) => s.taskTimeMemory);
  const projects = useStore((s) => s.projects);
  const focusLog = useStore((s) => s.focusLog);

  const uid = user?.uid ?? null;
  const usage = useMemo(
    () => measureSyncDoc(
      buildSyncPayload({ taskLists, backlogTasks, tasks, sessionDuration, taskTimeMemory, projects, focusLog }),
      uid,
    ),
    [taskLists, backlogTasks, tasks, sessionDuration, taskTimeMemory, projects, focusLog, uid],
  );

  const [originBytes, setOriginBytes] = useState<number | null>(null);
  useEffect(() => {
    let active = true;
    navigator.storage?.estimate?.()
      .then((estimate) => {
        if (active && typeof estimate.usage === 'number') setOriginBytes(estimate.usage);
      })
      // Permission-dependent in some browsers; the footnote just stays hidden.
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  const tone = LEVEL_TOKEN[usage.level];
  const percent = usage.fraction * 100;
  const largest = usage.sections[0];
  const [figure, unit] = formatBytes(usage.bytes).split(' ');

  return (
    <Card>
      <div style={{ display: 'grid', gap: 'var(--sp-7)' }}>

        {/* Headline figure + cap bar */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--sp-6)', flexWrap: 'wrap' }}>
          <div style={{ display: 'grid', gap: 'var(--sp-2)', flex: 1, minWidth: 200 }}>
            <Kicker>Record size</Kicker>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-3)', padding: '0 var(--sp-2)' }}>
              <span
                style={{
                  font: 'var(--type-numeric)',
                  fontSize: 'clamp(40px, 6vw, 60px)',
                  fontWeight: 300,
                  letterSpacing: '-0.03em',
                  color: 'var(--fg-1)',
                  lineHeight: 1,
                }}
              >
                {figure}
              </span>
              <span style={{ font: 'var(--type-numeric)', fontSize: 'var(--text-lg)', color: 'var(--fg-3)' }}>
                {unit}
              </span>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 'var(--sp-3)', flex: '1 1 260px', minWidth: 220 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--sp-4)' }}>
              <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)' }}>of the 1 MB cap</span>
              <span style={{ font: 'var(--type-numeric)', fontSize: 'var(--text-xs)', color: tone }}>
                {percent < 1 ? '<1' : Math.round(percent)}%
              </span>
            </div>
            <div
              style={{
                position: 'relative', height: 8, borderRadius: 'var(--r-pill)',
                background: 'var(--glass-well)', boxShadow: 'var(--glass-well-shadow)', overflow: 'hidden',
              }}
            >
              <span
                style={{
                  position: 'absolute', left: 0, top: 0, bottom: 0,
                  // Floored at a sliver so a nearly-empty account still shows
                  // something rather than an apparently broken, empty bar.
                  width: `max(8px, ${Math.min(100, Math.max(percent, 1.5))}%)`,
                  borderRadius: 'var(--r-pill)',
                  background: tone,
                  boxShadow: usage.level === 'ok' ? 'var(--job-lime-shine)' : 'none',
                  transition: 'width var(--dur-slow) var(--ease-glass)',
                }}
              />
            </div>
            {usage.level === 'ok' && (
              <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', textWrap: 'pretty' }}>
                {headroomNote(usage)}
              </span>
            )}
          </div>
        </div>

        {/* Warning band — only above the ok threshold. */}
        {usage.level !== 'ok' && (
          <Well pad="var(--sp-5)" style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-4)' }}>
            <span style={{ display: 'flex', flex: '0 0 auto', marginTop: 2, color: tone }}>
              <Icon name="triangle-alert" size={16} />
            </span>
            <div style={{ minWidth: 0, display: 'grid', gap: 'var(--sp-2)' }}>
              <span style={{ font: 'var(--type-label)', color: tone }}>
                {usage.level === 'critical' ? 'Almost full' : 'Filling up'}
              </span>
              <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', textWrap: 'pretty' }}>
                {usage.level === 'critical'
                  ? 'Once this record passes 1 MB the cloud refuses to save it, and your changes stop leaving this device. '
                  : 'Nothing is broken, but it is worth making room before it fills. '}
                {largest ? `The biggest part is ${largest.label}, at ${Math.round(largest.share * 100)}% of what is stored. ` : ''}
                Deleting finished projects, or trimming very long descriptions and notes, frees the most space.
              </span>
            </div>
          </Well>
        )}

        {/* Composition of the record, not of the cap — so the bar is legible. */}
        <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
          <Kicker trail={`share of ${formatBytes(usage.bytes)}`}>What is using it</Kicker>

          <div style={{ display: 'flex', gap: 3, height: 12 }}>
            {usage.sections.map((section, i) => (
              <span
                key={section.key}
                title={section.label}
                style={{
                  flex: Math.max(section.share * 100, 0.6),
                  borderRadius: 'var(--r-pill)',
                  background: shadeAt(i),
                  animation: 'var(--kf-condense) var(--dur-slow) var(--ease-glass) both',
                  animationDelay: `${i * 44}ms`,
                }}
              />
            ))}
          </div>

          <Well pad="var(--sp-2) var(--sp-5)">
            {usage.sections.map((section, i) => (
              <div
                key={section.key}
                style={{
                  display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', minHeight: 44,
                  borderTop: i === 0 ? 'none' : '1px solid var(--line-faint)',
                }}
              >
                <span
                  aria-hidden="true"
                  style={{ width: 8, height: 8, borderRadius: 2, flex: '0 0 auto', background: shadeAt(i) }}
                />
                <span
                  style={{
                    font: 'var(--type-body)', color: 'var(--fg-2)', flex: 1, minWidth: 0,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}
                >
                  {section.label}
                </span>
                <span
                  style={{
                    font: 'var(--type-numeric)', fontSize: 'var(--text-xs)', color: 'var(--fg-2)',
                    width: 62, textAlign: 'right', flex: '0 0 auto',
                  }}
                >
                  {formatBytes(section.bytes)}
                </span>
                <span
                  style={{
                    font: 'var(--type-numeric)', fontSize: 'var(--text-xs)', color: 'var(--fg-4)',
                    width: 38, textAlign: 'right', flex: '0 0 auto',
                  }}
                >
                  {Math.round(section.share * 100)}%
                </span>
              </div>
            ))}
          </Well>
        </div>

        {/* Item 9C. `Link`, not the store: this is navigation, and a caption
            that reads like a sentence should not be a Button. */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-4)' }}>
          <span aria-hidden="true" style={{ display: 'flex', color: 'var(--fg-4)', marginTop: 1, flex: '0 0 auto' }}>
            <Icon name="trash-2" size={16} />
          </span>
          <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', textWrap: 'pretty' }}>
            Deleted things are not in this figure. They wait 30 days in{' '}
            <Link to="/trash" style={{ color: 'var(--accent)', borderBottom: '1px solid var(--accent-hairline)' }}>
              Trash
            </Link>
            , which keeps its own record apart from this one — so emptying it does not move the bar above.
          </span>
        </div>

        {/* 2026-09-30 — covers left this record (lib/covers/). Said here because
            until then they were most of it, and he asked where they went. */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-4)' }}>
          <span aria-hidden="true" style={{ display: 'flex', color: 'var(--fg-4)', marginTop: 1, flex: '0 0 auto' }}>
            <Icon name="image" size={16} />
          </span>
          <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', textWrap: 'pretty' }}>
            Cover pictures are not in this figure either. Each one is kept in a record of its own, so adding covers
            never fills this one, and a cover you replace or remove is deleted straight away.
          </span>
        </div>

        {originBytes !== null && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-4)' }}>
            <span style={{ display: 'flex', color: 'var(--fg-4)', marginTop: 1, flex: '0 0 auto' }}>
              <Icon name="hard-drive" size={16} />
            </span>
            <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', textWrap: 'pretty' }}>
              This browser is separately holding <span style={{ color: 'var(--fg-2)' }}>{formatApproxBytes(originBytes)}</span> for
              the app — its offline copy, your sign-in, and cached files. That allowance is measured in gigabytes and is
              not what the bar above is about.
            </span>
          </div>
        )}
      </div>
    </Card>
  );
}
