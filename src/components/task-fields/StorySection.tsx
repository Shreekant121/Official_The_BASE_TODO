/**
 * The task's story, in its sheet (29-1P9c, idea 166 of round 10): when it was
 * made, each time it was pushed, what Atlas changed, how long it was focused
 * on, when its steps got done — the newest at the top.
 *
 * **His pick B: a closed "Story" row under Optional**, out of the way until
 * wanted. Closed, it still says how many moments there are and the latest
 * one. Like Optional it is shut every time the sheet opens, and the timeline
 * is built the first time it is opened, never before (CLAUDE.md, Performance
 * rule 2). The last five show, then "Show all".
 *
 * Each dot takes its colour from its job: lime done and steps, teal focus,
 * sky dates and pushes, coral Emergency and Red Alert, violet anything Atlas
 * did, white importance, grey the rest. The line down the left draws once
 * when the row opens — a Web Animation from a layout effect, compositor-only
 * (`scale`), and none at all under reduced motion. Nothing moves after.
 *
 * What it reads is `lib/taskStory.ts`'s `buildStory`: the stored moments
 * (`useTaskStory`, one document, live while the sheet is open) plus what the
 * task and the focus log already say, so a task made before this shipped
 * still shows when it was made, its focus and when it was done.
 */
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { SoftButton } from '../../ui';
import { useStore, type Task } from '../../store/useStore';
import { resolveUserTimeZone } from '../../lib/agent/dates';
import { buildStory, storyLine, type StoryLine, type StoryTone } from '../../lib/taskStory';
import { useTaskStory } from '../../lib/taskStorySync';
import { CollapsibleSection } from './CollapsibleSection';

const SHOW = 5;

const DOT: Record<StoryTone, string> = {
  lime: 'var(--job-lime)',
  teal: 'var(--job-teal)',
  sky: 'var(--job-sky)',
  coral: 'var(--job-coral)',
  violet: 'var(--job-violet)',
  grey: 'var(--fg-4)',
  white: 'var(--fg-1)',
};

interface StorySectionProps {
  task: Task;
  /** See `CollapsibleSection`. The sheet passes `false`. */
  blur?: boolean;
}

export function StorySection({ task, blur }: StorySectionProps) {
  const [open, setOpen] = useState(false);
  const [built, setBuilt] = useState(false);

  /* The stored task, not a queue copy: done-ness and its stamp live there. */
  const live = useStore((s) => s.backlogTasks.find((t) => t.id === task.id)) ?? task;
  const focusLog = useStore((s) => s.focusLog);
  const stored = useTaskStory(task.id);
  const timeZone = useMemo(() => resolveUserTimeZone(), []);

  /* "Today" is read once per open sheet, not on every render. */
  const [now] = useState(() => Date.now());
  const items = useMemo(
    () => buildStory(stored, live, focusLog, timeZone),
    [stored, live, focusLog, timeZone],
  );
  const lines = useMemo(() => items.map((item) => storyLine(item, now, timeZone)), [items, now, timeZone]);

  const latest = lines[0];
  const latestDay = latest?.sub.split(' · ')[0] ?? '';
  const when = latestDay === 'Today' || latestDay === 'Yesterday' ? latestDay.toLowerCase() : `on ${latestDay}`;
  const hint = latest
    ? `${lines.length} ${lines.length === 1 ? 'moment' : 'moments'} · last: ${latest.text} ${when}`
    : 'What happens to this task, from today on';

  const toggle = () => {
    setBuilt(true);
    setOpen((o) => !o);
  };

  return (
    <CollapsibleSection icon="clock" title="Story" hint={hint} open={open} onToggle={toggle} blur={blur}>
      {built && <StoryTimeline open={open} lines={lines} />}
    </CollapsibleSection>
  );
}

/**
 * The timeline itself, newest first: the last five, then "Show all". Also
 * `/design`'s specimen, fed pretend lines.
 */
export function StoryTimeline({ open, lines: every }: { open: boolean; lines: StoryLine[] }) {
  const rail = useRef<HTMLSpanElement>(null);
  const [all, setAll] = useState(false);
  const lines = all ? every : every.slice(0, SHOW);
  const more = every.length > SHOW ? every.length : 0;

  /* Draws down once each time the row opens. A layout effect so the line is
     at zero before the first frame shows it, not after. */
  useLayoutEffect(() => {
    const el = rail.current;
    if (!open || !el) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    el.animate([{ scale: '1 0' }, { scale: '1 1' }], { duration: 900, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }, [open]);

  if (lines.length === 0) {
    return (
      <p style={{ margin: 0, font: 'var(--type-caption)', color: 'var(--fg-3)' }}>
        Nothing yet. From now on, every change to this task shows here.
      </p>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 'var(--sp-4)', justifyItems: 'start' }}>
      <ol
        aria-label="What has happened to this task, newest first"
        style={{ position: 'relative', listStyle: 'none', margin: 0, padding: '0 0 0 22px', display: 'grid', width: '100%' }}
      >
        <span
          aria-hidden="true"
          style={{
            position: 'absolute', left: 7, top: 8, bottom: 8, width: 2, borderRadius: 1,
            backgroundColor: 'var(--line-soft)',
          }}
        />
        <span
          ref={rail}
          aria-hidden="true"
          style={{
            position: 'absolute', left: 7, top: 8, bottom: 8, width: 2, borderRadius: 1, transformOrigin: 'top',
            backgroundImage: 'linear-gradient(var(--job-lime), color-mix(in oklab, var(--job-lime) 15%, transparent))',
          }}
        />
        {lines.map((line, i) => (
          <li key={i} style={{ position: 'relative', padding: '5px 0 9px', minWidth: 0 }}>
            <span
              aria-hidden="true"
              style={{
                position: 'absolute', left: -19, top: 9, width: 10, height: 10, borderRadius: '50%',
                backgroundColor: DOT[line.tone],
                boxShadow: '0 0 0 3px var(--glass-floor)',
              }}
            />
            <span style={{ display: 'block', font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-1)', overflowWrap: 'anywhere' }}>
              {line.text}
            </span>
            <span style={{ display: 'block', font: 'var(--type-caption)', color: 'var(--fg-3)', overflowWrap: 'anywhere' }}>
              {line.sub}
            </span>
          </li>
        ))}
      </ol>
      {more > 0 && (
        <SoftButton size="sm" onClick={() => setAll((a) => !a)} aria-expanded={all}>
          {all ? 'Show less' : `Show all ${more}`}
        </SoftButton>
      )}
    </div>
  );
}
