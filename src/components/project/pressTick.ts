import { popTick } from '../../ui';
import { cue } from '../../lib/sound';
import { cheerTick } from '../../lib/tickCheer';

/**
 * What pressing a task's tick does, whoever presses it: the box (`parts.tsx`'s
 * `Tick`) and a row swiped right (29-1P6b, idea 17) are one press, so they
 * sound, pop and cheer alike.
 */
export function pressTick(box: HTMLElement | null, done: boolean, onToggle: () => void): void {
  /* 29-1P3: a tick climbs the scale (118), an untick is a soft step down. */
  cue(done ? 'untick' : 'tick');
  /* 29-1P4b: the box pops (1), a gold +1 floats off it (41) and the run
     of quick ticks grows (90) — on a press, never on a render. */
  if (!done) { popTick(box); cheerTick(box); }
  onToggle();
}
