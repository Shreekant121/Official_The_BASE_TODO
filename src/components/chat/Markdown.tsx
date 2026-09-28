/**
 * A reply, drawn (item 13B).
 *
 * `lib/markdown.ts` turns the model's text into a tree; this turns the tree
 * into React elements and the classes in `ui/screens.css` paint them. Those
 * classes are `design-system/screens/atlas.html`'s own `.md-*` block, kept
 * under its own names so the mockup and the screen can be diffed by eye.
 *
 * WHY THERE IS NO `dangerouslySetInnerHTML` HERE, AND MUST NOT BE
 * ---------------------------------------------------------------
 * The mockup's renderer builds an HTML string and assigns it, which is the
 * right shape for a static mockup whose reply is a literal in the file. It is
 * the wrong shape here, because the text arriving is not a literal: it is a
 * model's output, and the model's output is downstream of task titles, note
 * bodies, web pages the lookup drawer fetched and anything a shared list's
 * contributor typed. Every one of those is somewhere an attacker can put a
 * `<script>`.
 *
 * So the same drawing is done by handing React elements and text nodes, which
 * React escapes on the way out. This is not a filter that could be
 * incomplete — there is no path in either file that produces markup, so there
 * is nothing to sanitise. A `<script>` in a reply renders as the eight
 * characters it is.
 *
 * THE CARET
 * ---------
 * The streaming cursor used to be a sibling of the reply's text inside one
 * `<p>`, which no longer exists — a streaming reply is several blocks now. It
 * is passed in and lands at the end of whatever the last block currently is,
 * so it sits after the final word of a paragraph, after the last list item,
 * and inside the well of an unterminated fence. Leaving it outside the blocks
 * would put it on a line of its own and make every reply appear to end with a
 * blank paragraph.
 */
import type { CSSProperties, ReactNode } from 'react';
import { parseMarkdown } from '../../lib/markdown';
import type { MdBlock, MdInline } from '../../lib/markdown';

export interface MarkdownProps {
  /** The model's text, exactly as it arrived. Parsed on every delta. */
  text: string;
  /**
   * Drawn at the end of the last block while the reply is still arriving.
   * A node rather than a boolean so the animation stays with the page that
   * owns the rest of the turn's motion.
   */
  caret?: ReactNode;
  /**
   * Overrides on the wrapper. The thought aside uses it to drop to
   * `--text-sm` / `--fg-3`; everything below is sized in `em` or inherits, so
   * one declaration re-scales the whole reply.
   */
  style?: CSSProperties;
}

/** One run of inline nodes. */
function Inlines({ nodes }: { nodes: MdInline[] }): ReactNode {
  return nodes.map((node, i) => {
    switch (node.kind) {
      case 'text':
        return node.text;
      case 'strong':
        return (
          <strong key={i}>
            <Inlines nodes={node.children} />
          </strong>
        );
      case 'em':
        return (
          <em key={i}>
            <Inlines nodes={node.children} />
          </em>
        );
      case 'code':
        return (
          <code key={i} className="md-code">
            {node.text}
          </code>
        );
      case 'link':
        /* `href` was checked against the scheme allow-list in `markdown.ts`;
           a link node cannot exist carrying anything else. `noreferrer` as
           well as `noopener` — the tab being opened is a page Atlas found,
           and it has no business being told which conversation sent it. */
        return (
          <a
            key={i}
            className="md-a"
            href={node.href}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Inlines nodes={node.children} />
          </a>
        );
    }
  });
}

/** One block, with the caret if this is the last one. */
function Block({ block, caret }: { block: MdBlock; caret?: ReactNode }): ReactNode {
  switch (block.kind) {
    case 'paragraph':
      return (
        <p className="md-p">
          <Inlines nodes={block.children} />
          {caret}
        </p>
      );

    case 'heading': {
      /* `h3`/`h4` rather than `h1`/`h2`: the page's own heading is above this
         and a reply is inside it, so starting again at `h1` would leave a
         screen reader with two documents. The design's two marks are the
         classes, which is what `level` names — see `MdBlock`. */
      const Tag = block.level === 1 ? 'h3' : 'h4';
      return (
        <Tag className={block.level === 1 ? 'md-h1' : 'md-h2'}>
          <Inlines nodes={block.children} />
          {caret}
        </Tag>
      );
    }

    case 'list': {
      const Tag = block.ordered ? 'ol' : 'ul';
      return (
        <Tag className={block.ordered ? 'md-ol' : 'md-ul'}>
          {block.items.map((item, i) => (
            <li key={i}>
              <Inlines nodes={item} />
              {i === block.items.length - 1 ? caret : null}
            </li>
          ))}
        </Tag>
      );
    }

    case 'code':
      return (
        <div className="md-codeblock">
          {/* The bar prints the fence's language, or `text` when it carried
              none — the mockup's own wording. `table` gets here from
              `markdown.ts`, which is how a Markdown table the design refuses
              to draw is shown as the raw output it is. */}
          <div className="md-codebar">
            <span>{block.lang === '' ? 'text' : block.lang}</span>
          </div>
          <pre className="md-pre">
            <code>
              {block.text}
              {caret}
            </code>
          </pre>
        </div>
      );

    case 'quote':
      return (
        <blockquote className="md-quote">
          <Inlines nodes={block.children} />
          {caret}
        </blockquote>
      );
  }
}

/**
 * The reply.
 *
 * Returns `null` for text that parses to nothing, so a turn whose first delta
 * has not landed draws no empty box — `ChatPage` has a `thinking` state for
 * that moment and it says something better than blank space would.
 */
export function Markdown({ text, caret, style }: MarkdownProps) {
  const blocks = parseMarkdown(text);
  if (blocks.length === 0) return null;

  return (
    <div className="md" style={style}>
      {blocks.map((block, i) => (
        <Block key={i} block={block} caret={i === blocks.length - 1 ? caret : undefined} />
      ))}
    </div>
  );
}
