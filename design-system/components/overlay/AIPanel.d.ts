import * as React from 'react';

export type AIPanelDock = 'bottom' | 'right';

export interface AIPanelSubject {
  /** Uppercase mono line above the title — the object's address, e.g. "Task · Operations · Shreekant Empire". */
  kicker: string;
  /** The object's own name. Never truncate this away; it is the whole point of the header. */
  title: string;
  /** One measured fact, mono. "90 min · 1d left". Optional. */
  meta?: string;
  /** Lucide name for the 30px subject disc. Defaults to "sparkles". */
  icon?: string;
}

export interface AIPanelRow {
  label: string;
  /** Mono right-hand value — a duration, a date change, a list name. */
  meta?: string;
  tone?: string;
}

export type AIPanelItem =
  /** What you said. Right-aligned, level-3 glass. */
  | { kind: 'you'; id?: string; text: string }
  /** What it said. Plain text, no bubble. `chips` are short answers to a question it asked. */
  | { kind: 'ai'; id?: string; text: string; chips?: string[] }
  /** A tool call, stated as a result in the past tense. `undo: true` makes it the applied state. */
  | {
      kind: 'did'; id?: string;
      tool: string; icon?: string; count?: string;
      rows?: AIPanelRow[];
      undo?: boolean; applied?: string;
    }
  /** Something irreversible, parked until one tap. `hard` adds the amber tint and frost affirmative. */
  | {
      kind: 'approve'; id?: string;
      title: string; rows?: AIPanelRow[]; note?: string;
      hard?: boolean; yes?: string; no?: string; done?: string;
    }
  /** A field the answer filled — the Score screen's reason for having a panel. */
  | { kind: 'filled'; id?: string; field: string; value: string; delta?: string };

export interface AIPanelProps {
  /** Always required in practice: you must know what the AI is about to act on. */
  subject: AIPanelSubject;
  /** The transcript, oldest first. Empty array renders the waiting state. */
  items?: AIPanelItem[];
  /** Set while a turn is in flight. Name the tool when there is one. */
  working?: { label?: string; tool?: string } | null;
  /** Openers, shown only in the empty state. Three at most — this is not a menu. */
  prompts?: string[];
  placeholder?: string;
  /** "bottom" on narrow screens (takes the lower half), "right" on wide ones. */
  dock?: AIPanelDock;
  /** Drives the slide transform. The host still owns mount/unmount. */
  open?: boolean;
  onClose?: () => void;
  /** Fires for the composer, a chip, and an empty-state prompt alike. */
  onSend?: (text: string) => void;
  onApprove?: (item: AIPanelItem) => void;
  onReject?: (item: AIPanelItem) => void;
  style?: React.CSSProperties;
}

/**
 * AI PANEL — a short exchange about one object, docked to the screen that
 * object lives on. Docks, never covers; names its subject; states what it
 * did. Quieter and smaller than the full chat screen by design.
 */
export function AIPanel(props: AIPanelProps): JSX.Element;
