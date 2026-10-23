/**
 * Jump back in (29-1P8c, idea 154): the board's half. `useJumpBackRecorder`
 * writes where he is — the project on its way in, a task when he opens or
 * ticks one (the board calls `taskTouched` itself), how far down he scrolled
 * — and lands a tap from Home or Ctrl+K: scrolled to where he left it, the
 * task glowing once so his eye finds it. `useJumpTo` is the tap.
 *
 * Every board records, either of two side by side (his call: any open counts).
 * `useJumpRows` is what Home's row (`JumpBackRow`) and Ctrl+K's empty box draw.
 */
import { useEffect, useMemo, type RefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import { useJumpBackStore } from '../../store/useJumpBackStore';
import { useStore, type Project } from '../../store/useStore';
import { usePriorityScores } from '../../store/usePriorityScores';
import { resolveUserTimeZone } from '../../lib/agent/dates';
import { dustSelector } from '../../lib/dust';
import { shownSpots, whenLabel, whereLine, type JumpSpot } from '../../lib/jumpBack';

/** A scroll is written this long after it stops — once per rest, not per frame. */
const SCROLL_REST_MS = 250;
/** The glow on the task he was at, ms: held, then fading. */
const GLOW_MS = 1800;

export function useJumpBackRecorder(projectId: string, scrollerRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    useJumpBackStore.getState().visited(projectId);
  }, [projectId]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    let timer = 0;
    const onScroll = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => useJumpBackStore.getState().scrolled(projectId, el.scrollTop), SCROLL_REST_MS);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => { el.removeEventListener('scroll', onScroll); window.clearTimeout(timer); };
  }, [projectId, scrollerRef]);

  /*
   * The landing. Read and cleared inside the timer, not before it: React's
   * development double-mount runs this effect, its cleanup and the effect
   * again, and a landing cleared on the first run would be gone by the one
   * that lands. The timer gives the board one tick to lay its lists out; this
   * runs only on a tap from Jump back in, never on an ordinary visit, so it
   * is the only place the way in reads layout (CLAUDE.md, performance 6).
   */
  useEffect(() => {
    const el = scrollerRef.current;
    const pending = useJumpBackStore.getState().landing;
    if (!el || pending?.projectId !== projectId) return;
    const timer = window.setTimeout(() => {
      const landing = useJumpBackStore.getState().landing;
      if (landing?.projectId !== projectId) return;
      useJumpBackStore.getState().setLanding(null);
      if (landing.scrollTop) el.scrollTop = landing.scrollTop;
      const spot =
        (landing.taskId ? el.querySelector<HTMLElement>(dustSelector('task', landing.taskId)) : null)
        ?? (landing.listId ? el.querySelector<HTMLElement>(dustSelector('list', landing.listId)) : null);
      if (!spot) return;
      const box = el.getBoundingClientRect();
      const at = spot.getBoundingClientRect();
      /* `scroll-padding-top` on the page's scroller keeps it clear of the frozen island. */
      if (at.top < box.top || at.bottom > box.bottom) spot.scrollIntoView({ block: 'center' });
      glowOnce(spot);
    }, 60);
    return () => window.clearTimeout(timer);
  }, [projectId, scrollerRef]);
}

/**
 * A lime ring that holds, then fades — lime is "current" (29-1P2c1). An
 * outline, so it neither moves the row nor fights the transform its drag and
 * Framer own; a Web Animation, so nothing is left on the row after it.
 */
function glowOnce(el: HTMLElement) {
  const lime = getComputedStyle(el).getPropertyValue('--job-lime').trim() || 'oklch(0.84 0.17 130)';
  const ring = { outlineStyle: 'solid', outlineWidth: '2px', outlineOffset: '3px' };
  el.animate(
    [
      { ...ring, outlineColor: lime, offset: 0 },
      { ...ring, outlineColor: lime, offset: 0.45 },
      { ...ring, outlineColor: 'transparent', offset: 1 },
    ],
    { duration: GLOW_MS, easing: 'ease-out' },
  );
}

/** A Jump back in card, or its row in Ctrl+K: open the project and land where he was. */
export function useJumpTo(): (spot: JumpSpot) => void {
  const navigate = useNavigate();
  return (spot) => {
    useJumpBackStore.getState().setLanding(spot);
    navigate(`/project/${spot.projectId}`);
  };
}

export interface JumpRow {
  spot: JumpSpot;
  project: Project;
  where: string;
  when: string;
}

/** The rows to show, in words, newest first. The clock is the score's minute tick. */
export function useJumpRows(): JumpRow[] {
  const spots = useJumpBackStore((s) => s.spots);
  const projects = useStore((s) => s.projects);
  const lists = useStore((s) => s.taskLists);
  const backlog = useStore((s) => s.backlogTasks);
  const { now } = usePriorityScores();
  return useMemo(() => {
    const byId = new Map(projects.map((p) => [p.id, p]));
    const timeZone = resolveUserTimeZone();
    return shownSpots(spots, new Set(byId.keys())).map((spot) => {
      const task = spot.taskId ? backlog.find((t) => t.id === spot.taskId) : undefined;
      const list = lists.find((l) => l.id === (task?.listId ?? spot.listId));
      return {
        spot,
        project: byId.get(spot.projectId)!,
        where: whereLine(list?.title, task?.title),
        when: whenLabel(spot.at, now, timeZone),
      };
    });
  }, [spots, projects, lists, backlog, now]);
}
