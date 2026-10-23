/**
 * A whole screen with nothing on it, calm rather than blank (29-1P14c, idea
 * 113, from Things 3 and Gmail): a small line drawing, a title, one kind
 * sentence and the next step.
 *
 *   <EmptyCalm art="plane" title="A clean board." actions={<GelButton …/>}>
 *     <LitLine>…</LitLine>
 *   </EmptyCalm>
 *
 * Only for a WHOLE screen or pane (a board, Set Deadlines, the Score screen's
 * end). A Dashboard block, a list or a picker that is empty gets its
 * `<LitLine>` and nothing else — a drawing in every small box would be
 * noise (his approved list, `docs/design/words-and-empty-screens.md`).
 *
 * The drawings are line art in the page's grey with at most one colour, and
 * that colour is a job's (`colourJobs.ts`): the sun over the calm sea is gold
 * (everything filled in is a reward), the leaf on Set Deadlines is lime
 * (today). The paper plane and the glass are plain lines. They are still:
 * nothing here moves but the sentence's lit words, once.
 */
import type { CSSProperties, ReactNode } from 'react';

export type EmptyArt = 'plane' | 'search' | 'leaf' | 'sea';

export interface EmptyCalmProps {
  art?: EmptyArt;
  title?: ReactNode;
  /** The sentence — a `<LitLine>`. */
  children?: ReactNode;
  /** The one next step (two only where the screen already had two). */
  actions?: ReactNode;
  role?: 'status';
  style?: CSSProperties;
}

const LINE = {
  fill: 'none', stroke: 'var(--fg-3)', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round',
} as const;

/** The drawing alone, for an empty screen that keeps its own layout (the empty board). */
export function EmptyDrawing({ art }: { art: EmptyArt }) {
  const common = { width: 120, height: 72, viewBox: '0 0 150 90', 'aria-hidden': true, style: { display: 'block' } } as const;
  switch (art) {
    case 'plane':
      return (
        <svg {...common}>
          <path d="M30 50 L120 18 L96 76 L78 56 Z" {...LINE} />
          <path d="M120 18 L78 56 L74 72 L86 62" {...LINE} />
          <path d="M20 70 C34 70 38 60 52 62" {...LINE} stroke="var(--fg-4)" strokeWidth={1.4} strokeDasharray="3 5" />
        </svg>
      );
    case 'search':
      return (
        <svg {...common}>
          <circle cx="68" cy="40" r="20" {...LINE} />
          <path d="M83 55 L100 72" {...LINE} strokeWidth={2.2} />
          <path d="M60 40 H76" {...LINE} stroke="var(--fg-4)" />
        </svg>
      );
    case 'leaf':
      return (
        <svg {...common}>
          <rect x="44" y="16" width="62" height="58" rx="10" {...LINE} />
          <path d="M44 32 H106 M60 10 V22 M90 10 V22" {...LINE} />
          <path d="M75 68 C70 60 68 52 76 42 C84 50 82 60 75 68 Z M75 68 V56" {...LINE} stroke="var(--job-lime)" />
        </svg>
      );
    case 'sea':
      return (
        <svg {...common}>
          <circle cx="75" cy="44" r="16" fill="var(--job-gold)" opacity={0.9} />
          <path d="M10 52 H140" {...LINE} />
          <path d="M26 62 H62 M84 62 H124 M40 72 H70 M88 72 H110 M56 82 H94" {...LINE} stroke="var(--fg-4)" />
        </svg>
      );
  }
}

export function EmptyCalm({ art, title, children, actions, role, style }: EmptyCalmProps) {
  return (
    <div
      role={role}
      style={{
        display: 'grid', justifyItems: 'center', textAlign: 'center', gap: 'var(--sp-4)',
        padding: 'var(--sp-11) var(--sp-6)', ...style,
      }}
    >
      {art && <EmptyDrawing art={art} />}
      {title !== undefined && (
        <h2 style={{ font: 'var(--type-title)', letterSpacing: 'var(--tracking-title)', color: 'var(--fg-1)' }}>{title}</h2>
      )}
      {children !== undefined && (
        <div style={{ maxWidth: '42ch', font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-3)' }}>
          {children}
        </div>
      )}
      {actions !== undefined && (
        <div style={{ display: 'flex', gap: 'var(--sp-4)', flexWrap: 'wrap', justifyContent: 'center', marginTop: 'var(--sp-2)' }}>
          {actions}
        </div>
      )}
    </div>
  );
}
