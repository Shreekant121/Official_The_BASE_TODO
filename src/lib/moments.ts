/**
 * The watcher for confetti's two presses (29-1P14a, idea 2): a finished
 * project and a finished milestone. Installed once at startup (`main.tsx`),
 * like the undo recorder, the dust and the task's story — so every way of
 * finishing a task gets it for free: a board's tick, a swipe, Focus's Mark
 * done, the pill, the task sheet. **Never fire confetti at a call site.**
 *
 * WHOSE PRESS
 * -----------
 * Only his, and only forward. Three writers change the backlog without a new
 * press of his, and each already says so: Atlas's tools (`asAtlas`), an undo
 * (`withoutUndo` — undoing an un-tick finishes the task again, which is not
 * finishing it), and adopting the other device's copy from the cloud
 * (`withoutStory`) — the device he pressed on has had its confetti. A redo
 * replays his press, so it bursts again, as the press did.
 *
 * WHERE FROM
 * ----------
 * From where he last pressed, if that was a moment ago — the tick box, the
 * swipe, the button — else from the middle of the screen.
 */
import { useStore } from '../store/useStore';
import { atlasIsWriting, storyIsQuiet } from '../store/storyActor';
import { undoGateClosed } from '../store/undoGate';
import { bigFinish } from './bigFinish';
import { burstConfetti } from './confetti';

/** A press older than this is not what finished it. */
const PRESS_FRESH_MS = 1500;

let lastPress: { x: number; y: number; at: number } | null = null;
let installed = false;

/** Where to burst from: the last press, while it is fresh. */
export function pressPoint(now: number = Date.now()): { x: number; y: number } | null {
  return lastPress && now - lastPress.at < PRESS_FRESH_MS ? { x: lastPress.x, y: lastPress.y } : null;
}

export function installMoments(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener(
    'pointerdown',
    (e) => { lastPress = { x: e.clientX, y: e.clientY, at: Date.now() }; },
    { capture: true, passive: true },
  );
  useStore.subscribe((state, prev) => {
    if (state.backlogTasks === prev.backlogTasks) return;
    if (atlasIsWriting() || storyIsQuiet() || undoGateClosed()) return;
    if (bigFinish(prev.backlogTasks, state.backlogTasks, state.projects, state.taskLists)) {
      burstConfetti(pressPoint());
    }
  });
}
