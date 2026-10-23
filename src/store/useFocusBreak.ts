/**
 * A real break (29-1P11a, idea 104): the offer and the break itself.
 *
 * In memory only, like `useFocusRun`, and a store of its own rather than three
 * more fields there, because a break outlives the run: the "Session done"
 * card's Break starts one after the queue has emptied and the run is cleared.
 * When a break is offered and how long it is are `lib/breaks.ts`;
 * `FocusRunHost` offers it on the clock and ends it on the clock;
 * `FocusBreakHost` draws both cards on every screen.
 *
 * **Break time does not count** (his call): starting a break pauses the run —
 * not as one of his pauses — so nothing is banked while he rests, and the
 * session's window waits too. Back to work presses play, which starts a fresh
 * focus block.
 */
import { create } from 'zustand';
import { useFocusRun } from './useFocusRun';
import { BREAK_ADD_SECONDS, breakMinutes, isLongBreak, pickIdea } from '../lib/breaks';
import { getNoisePrefs } from '../lib/brownNoise';
import { getBreakIdeas } from '../lib/breakIdeaStore';

export interface BreakOn {
  long: boolean;
  /** Epoch ms the break ends. */
  endsAt: number;
  /** The idea showing; `null` when his list is empty. */
  ideaId: string | null;
  /** The countdown reached zero: "Break over. Ready when you are." */
  over: boolean;
}

export interface FocusBreakState {
  /** A focus block ended in pomodoro mode and he has not answered. */
  offer: { long: boolean } | null;
  breakOn: BreakOn | null;
  /** Breaks taken this session; every fourth is the long one. */
  taken: number;

  /** The block ended (FocusRunHost's timer). */
  offerBreak: () => void;
  /** "Keep going": no break, a fresh block from now. */
  keepGoing: () => void;
  /**
   * "Take a break", or Break on the "Session done" card. `minutesFor` turns
   * short or long into his number; `ideaId` is the first idea to show.
   */
  startBreak: (minutesFor: (long: boolean) => number, ideaId: string | null) => void;
  /** "+2 min". On a break that is over, it starts two more. */
  addBreakTime: () => void;
  showIdea: (ideaId: string | null) => void;
  /** The countdown reached zero (FocusRunHost's timer). */
  breakOver: () => void;
  /** Back to work (or "Skip break"): play, when there is a task to go back to. */
  endBreak: () => void;
  /** The session ended: no offer, and the count of breaks starts again. A break he is on stays. */
  resetSession: () => void;
}

export const useFocusBreak = create<FocusBreakState>()((set, get) => ({
  offer: null,
  breakOn: null,
  taken: 0,

  offerBreak: () => {
    const { offer, breakOn, taken } = get();
    if (offer || breakOn) return;
    set({ offer: { long: isLongBreak(taken + 1) } });
  },

  keepGoing: () => {
    set({ offer: null });
    useFocusRun.getState().restartBlock();
  },

  startBreak: (minutesFor, ideaId) => {
    const { offer, taken } = get();
    const long = offer?.long ?? isLongBreak(taken + 1);
    /* Not his pause: the "Session done" card counts only his presses. */
    useFocusRun.getState().pause();
    set({
      offer: null,
      taken: taken + 1,
      breakOn: { long, endsAt: Date.now() + minutesFor(long) * 60_000, ideaId, over: false },
    });
  },

  addBreakTime: () => {
    const on = get().breakOn;
    if (!on) return;
    const from = on.over ? Date.now() : on.endsAt;
    set({ breakOn: { ...on, endsAt: from + BREAK_ADD_SECONDS * 1000, over: false } });
  },

  showIdea: (ideaId) => {
    const on = get().breakOn;
    if (on) set({ breakOn: { ...on, ideaId } });
  },

  breakOver: () => {
    const on = get().breakOn;
    if (on && !on.over) set({ breakOn: { ...on, over: true } });
  },

  endBreak: () => {
    if (!get().breakOn) return;
    set({ breakOn: null });
    /* `resume` sets a new `runningSince`, so the next block starts now. With
       no task (a break after the queue ended) it does nothing. */
    useFocusRun.getState().resume();
  },

  resetSession: () => set({ offer: null, taken: 0 }),
}));

/**
 * "Take a break" and Break on the "Session done" card: his lengths and a
 * first idea from his list, read at the press.
 */
export function takeBreak(): void {
  useFocusBreak.getState().startBreak(
    (long) => breakMinutes(getNoisePrefs(), long),
    pickIdea(getBreakIdeas(), Math.random())?.id ?? null,
  );
}
