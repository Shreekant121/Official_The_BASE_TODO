/**
 * A sentence that lights its key words (29-1P14c, idea 87, his "name it,
 * date it, done"): the sentence is in the caller's grey, and only the words
 * that matter are bright white, so the point lands in one glance.
 *
 *   <LitLine style={{ color: 'var(--fg-3)' }}>
 *     Nothing due today. <Lit>Pick one thing</Lit>, give it <Lit>an hour</Lit>…
 *   </LitLine>
 *   <LitLine text="Nothing **left to do** here." />   — a string from a pure module
 *
 * The first time a sentence is shown after BASE opens, its lit words come up
 * one after another, once (`seen` remembers the words, not the element, so a
 * block that unmounts and comes back with the same sentence stays still).
 * Nothing loops (Performance rule 1). The motion is `el.animate` on
 * `opacity`, from a layout effect, as `motionOnce.ts` explains for the
 * Dashboard: a kept screen restarts CSS keyframes every time it is shown,
 * and a layout effect starts on the first frame, so there is no flash of
 * the lit end state. It reads no layout (rule 6). Reduced motion: lit, still.
 *
 * Grey is the CALLER's colour (a caption is `--fg-3`, a block's line
 * `--fg-3`, a quiet hint `--fg-4`); white is always `--fg-1` — a lit word is
 * plain emphasis, so it takes no job colour.
 */
import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { useReducedMotion } from 'framer-motion';
import { litParts } from './litParts';

/** The sentences already lit this time BASE is open. */
const seen = new Set<string>();

const LIT: CSSProperties = { fontWeight: 'var(--weight-medium)' as CSSProperties['fontWeight'], color: 'var(--fg-1)' };

/** One lit part of a `<LitLine>`. */
export function Lit({ children }: { children: ReactNode }) {
  return <b data-lit="" style={LIT}>{children}</b>;
}

export interface LitLineProps {
  /** The sentence, with `<Lit>` around the words that light… */
  children?: ReactNode;
  /** …or a string with `**` around them (`litParts`). */
  text?: string;
  as?: 'span' | 'p' | 'div';
  role?: 'status';
  style?: CSSProperties;
  className?: string;
  /** Light up on every mount, seen or not — `/design`'s Replay only. */
  always?: boolean;
}

export function LitLine({ children, text, as = 'span', role, style, className, always = false }: LitLineProps) {
  const ref = useRef<HTMLElement | null>(null);
  const reduced = useReducedMotion();

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || reduced) return;
    const words = el.textContent ?? '';
    if (seen.has(words) && !always) return;
    seen.add(words);
    el.querySelectorAll<HTMLElement>('[data-lit]').forEach((word, i) => {
      word.animate([{ opacity: 0.42 }, { opacity: 1 }], {
        duration: 520, delay: 120 + i * 220, easing: 'cubic-bezier(.2, .8, .2, 1)', fill: 'backwards',
      });
    });
    /* Mount only: a sentence that changes while shown (a search being typed)
       is not shown for the first time. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const Tag = as;
  return (
    <Tag ref={ref as never} role={role} className={className} style={{ textWrap: 'pretty', ...style }}>
      {text !== undefined
        ? litParts(text).map((part, i) => (part.lit ? <Lit key={i}>{part.text}</Lit> : part.text))
        : children}
    </Tag>
  );
}
