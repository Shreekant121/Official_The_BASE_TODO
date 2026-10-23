/**
 * BASE's colours and their jobs (29-1P1, BIG-15): one colour, one job, so a
 * colour means the same thing on every screen. The tokens are the `--job-*`
 * set in `tokens/v3.css`; this is the list components choose from, so a
 * button can only ever be one of these ten.
 *
 * Pick the colour by what the thing DOES, never by what looks nice beside
 * it. The idea pages sometimes demoed another (Focus in rose); the job wins.
 */
import type { CSSProperties } from 'react';

export const COLOUR_JOBS = ['orange', 'emerald', 'lime', 'gold', 'coral', 'rose', 'violet', 'sky', 'teal', 'indigo'] as const;
export type ColourJob = (typeof COLOUR_JOBS)[number];

/** His names and the job each does, as `/design` prints them. */
export const COLOUR_JOB_INFO: Record<ColourJob, { name: string; job: string; where: string }> = {
  orange: { name: 'Orange', job: 'Go. Start, begin a session, commit.', where: 'Start on the Dashboard, starting Focus.' },
  emerald: { name: 'Emerald', job: 'Live and brand. Something running right now.', where: 'The running timer, live status, the brand mark.' },
  lime: { name: 'Lime', job: 'Highlight. Today, done, the current one.', where: 'Dashboard tags, switches that are on, the focus ring.' },
  gold: { name: 'Gold', job: 'Reward. Points, streak flames, rest days.', where: 'Streaks (29-3) and gamification (33A).' },
  coral: { name: 'Coral red', job: 'Urgent. Only what is really about to be missed.', where: 'Overdue counts, Red Alert once step 31 makes it rare.' },
  rose: { name: 'Rose', job: 'Personal and habits. Your routine.', where: 'Self Care, habit groups and the routine block (29-3).' },
  violet: { name: 'Violet', job: 'Atlas. Anything the AI says or does.', where: 'Ask Atlas, the glowing Ask AI buttons, the side panel, the morning note.' },
  sky: { name: 'Sky blue', job: 'Calendar and dates. Events and countdowns.', where: 'Deadlines, events, countdowns, the timeline (29-2).' },
  teal: { name: 'Teal', job: 'Calm focus. Deep work, breathing, noise.', where: 'Focus mode, brown noise, prime time (step 30).' },
  indigo: { name: 'Indigo', job: 'Night and rest. Sleep, do-not-disturb.', where: 'Wake and sleep, blocked hours (step 30).' },
};

/**
 * The custom properties `buttons.css` draws a gel from, pointed at one
 * colour's tokens. Spread into a button's inline style.
 */
export function gelVars(colour: ColourJob): CSSProperties {
  const p = `--job-${colour}`;
  return {
    '--ds-gel': `var(${p}-gel)`,
    '--ds-rim': `var(${p}-rim)`,
    '--ds-glow': `var(${p}-glow)`,
    '--ds-glow-sm': `var(${p}-glow-sm)`,
    '--ds-ink': `var(${p}-ink)`,
  } as CSSProperties;
}

/**
 * OPT-9: an "Ask AI" icon button's violet glow — *"Give the Ai buttons on
 * projects and lists and task a blue color glow"*, and he chose Atlas's violet
 * over a real blue (sky already means dates). Spread into an `IconButton`'s
 * `style`, which writes its colour and shadow inline and so cannot be reached
 * from a stylesheet; the soft masthead button takes `.ds-ask` in `buttons.css`
 * instead. `on` is "the open panel is about this", which brightens it.
 *
 * 2026-10-07, his call: on lists and tasks it is "a plain Ai icon with no
 * circle or glow" — so the glyph keeps its violet and loses the halo, and its
 * buttons are `IconButton variant="plain"`. The project's masthead keeps both.
 */
export function askInk(on: boolean | undefined): CSSProperties {
  return {
    color: on ? 'var(--job-violet-ink)' : 'var(--job-violet-tag-fg)',
  };
}
