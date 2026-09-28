/**
 * Aurora Glass — TravellingTrack
 *
 * DERIVED, NOT MIRRORED — read this before diffing it against the design
 * project.
 * ---------------------------------------------------------------------
 * There is no `components/feedback/TravellingTrack.*` in the design project
 * and nothing is owed for one: this is not a reconstruction of a component
 * that exists over there, it is the one caller-shaped wrapper around a
 * keyframe the design system already ships. `tokens/motion.css` declares
 * `@keyframes ag-travel`, commented "Indeterminate progress travelling along
 * a track", and states the whole mechanism — translateX from -100% to 340%.
 * All this file adds is the track it travels along.
 *
 * Extracted at UI-20, when the second caller appeared. UI-19 wrote it inside
 * `pages/OAuthCallbackPage.tsx` because it had exactly one, and UI-20's
 * `SplashScreen` needs the same three pixels of bar. Two private copies of an
 * indeterminate progress bar is precisely the drift UI-18 spent a session
 * undoing across the app's nine dropdowns; one object, before there are two.
 *
 * WHY IT IS NOT A `Well`
 * ----------------------
 * The trough uses `Well`'s recipe — `--glass-well` plus `--glass-well-shadow`
 * — rather than the component. `Well` carries a 16px inset for content, which
 * a 3px bar has no room for and would swallow whole.
 *
 * WHY THE ACCENT IS NOT OVERSPENT HERE
 * ------------------------------------
 * `colors.css` rations emerald to mean LIVE, and both callers qualify: a
 * token exchange genuinely in flight, and the app genuinely still booting.
 * This is not decoration on a static screen — if the bar is on the page,
 * something is running.
 *
 * The element is `aria-hidden`. It carries no information a screen reader can
 * use — indeterminate means nobody knows how long — and both callers already
 * name the wait in text beside it.
 */
import type { CSSProperties } from 'react';

export interface TravellingTrackProps {
  /** Track width. Defaults to filling the parent. */
  width?: number | string;
  /** Extra styles for the trough — margin, max-width, and nothing else. */
  style?: CSSProperties;
}

export function TravellingTrack({ width = '100%', style }: TravellingTrackProps) {
  return (
    <div
      aria-hidden="true"
      style={{
        width,
        height: 3,
        borderRadius: 'var(--r-pill)',
        background: 'var(--glass-well)',
        boxShadow: 'var(--glass-well-shadow)',
        overflow: 'hidden',
        ...style,
      }}
    >
      <div
        style={{
          width: '30%',
          height: '100%',
          borderRadius: 'var(--r-pill)',
          background: 'var(--accent)',
          boxShadow: '0 0 12px -1px var(--accent)',
          animation: 'ag-travel 1400ms var(--ease-in-out) infinite',
        }}
      />
    </div>
  );
}
