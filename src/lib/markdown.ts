/**
 * Markdown, parsed into a tree (item 13B).
 *
 * WHY A PARSER OF OUR OWN AND NOT A DEPENDENCY
 * --------------------------------------------
 * `package.json` carried no Markdown dependency of any kind before this item,
 * and the honest reason to add one would be CommonMark compliance — which is
 * not what this screen needs. What it needs is the eight marks the design
 * draws, rendered exactly as `design-system/screens/atlas.html` draws them,
 * and **nothing else reaching the DOM**. A general parser would arrive with
 * raw-HTML passthrough, autolink literals we do not want, and a table renderer
 * the design deliberately refuses, and every one of those would then have to
 * be switched off. This is smaller than the configuration would have been.
 *
 * THE OUTPUT IS A TREE, NOT A STRING OF HTML
 * ------------------------------------------
 * That is the security property, and it is structural rather than a filter:
 * there is no code path here that produces markup. The renderer
 * (`components/chat/Markdown.tsx`) turns these nodes into React elements, and
 * React escapes every text node it is handed. A `<script>` in a model's reply
 * is a `text` node containing the characters `<script>` and it renders as
 * those characters. Nothing in this file or that one calls
 * `dangerouslySetInnerHTML`, and nothing should: the model's text is
 * downstream of task titles, note bodies and anything a shared list's
 * contributor typed, so it is not trusted input even when the model is
 * behaving.
 *
 * WHAT IS DELIBERATELY NOT SUPPORTED
 * ----------------------------------
 * - **`_underscore_` emphasis.** The single most common word in an Atlas reply
 *   that contains an underscore is a tool name — `search_tasks`,
 *   `update_task`, `list_today`. CommonMark's own intraword rule would spare
 *   most of those, but not `_private_field` or a path like `a_b_c/d_e`, and
 *   the cost of getting it wrong is a mangled tool name in the one place
 *   Shreekant is reading to find out what Atlas did. `*` and `**` only, which
 *   is also exactly what the mockup's own renderer accepts.
 * - **Nested lists.** The design's list CSS is flat — one dot inset, one
 *   counter box — and there is no second level in it to render into. An
 *   indented item is taken as an item at the one level there is, which loses
 *   the nesting but keeps it reading as a list; falling back to a paragraph in
 *   the middle of a list looks like a rendering fault.
 * - **Setext headings, reference links, footnotes, images, HTML blocks.**
 *   None appear in a reply written to the house format, and every one of them
 *   is a way for something other than prose to reach the page.
 *
 * TABLES ARE A FALLBACK, NOT A GAP
 * --------------------------------
 * The design refuses to draw one — structured results are rows of type on
 * hairlines, not a grid — so a table Atlas emits anyway is shown as a fenced
 * code block, which is where the mockup already puts text that has to keep its
 * own alignment. It reads as raw output because that is what it is.
 *
 * STREAMING
 * ---------
 * Every block form closes at end-of-input rather than requiring its terminator,
 * so a reply parsed mid-stream is the same reply one keystroke short. An
 * unterminated fence is a code block, an unterminated `**` is literal
 * asterisks that become bold the moment the second pair lands.
 */

/** A run of text inside a block. */
export type MdInline =
  | { kind: 'text'; text: string }
  | { kind: 'strong'; children: MdInline[] }
  | { kind: 'em'; children: MdInline[] }
  | { kind: 'code'; text: string }
  | { kind: 'link'; href: string; children: MdInline[] };

/**
 * A block.
 *
 * `heading.level` is 1 or 2 and means the design's two marks rather than the
 * source's hash count: 1 is `.md-h1`, the title, and 2 is `.md-h2`, which the
 * spec is explicit is *a kicker, not a heading*. `#` and `##` both map to 1
 * and anything deeper to 2, because a model that reaches for `####` means "a
 * smaller one" and there is no smaller one to give it.
 */
export type MdBlock =
  | { kind: 'paragraph'; children: MdInline[] }
  | { kind: 'heading'; level: 1 | 2; children: MdInline[] }
  | { kind: 'list'; ordered: boolean; items: MdInline[][] }
  | { kind: 'code'; lang: string; text: string }
  | { kind: 'quote'; children: MdInline[] };

/*
 * Only these three schemes become a link. Everything else — `javascript:`,
 * `data:`, `vbscript:`, and any scheme invented later — renders as the text it
 * was, which is the safe direction to fail in: the URL is still readable and
 * still copyable, it just is not armed. Checked after the leading whitespace
 * and control characters a bypass would hide behind, which is why the value is
 * trimmed of them before the test rather than tested as written.
 */
const SAFE_SCHEME = /^(?:https?|mailto):/i;

/** A bare URL in prose. Trailing punctuation is trimmed off it below. */
const BARE_URL = /^https?:\/\/[^\s<>]+/i;

/**
 * `- `, `* ` or `+ `, after any indent. The indent is allowed and then thrown
 * away — see the note on nested lists above.
 */
const BULLET = /^[ \t]*[-*+][ \t]+/;

/** `1. ` or `1) `, after any indent. */
const ORDERED = /^[ \t]*\d{1,9}[.)][ \t]+/;

/** ```` ```lang ```` — the language is optional and everything after it ignored. */
const FENCE = /^[ \t]*(`{3,}|~{3,})[ \t]*([^\s`~]*)/;

/** `#` to `######`. */
const HEADING = /^(#{1,6})[ \t]+(.*)$/;

/** `> `, and a bare `>` on its own line. */
const QUOTE = /^[ \t]*>[ \t]?/;

/** `---`, `***` or `___` alone on a line. Rendered as nothing — see `parseMarkdown`. */
const RULE = /^[ \t]*(?:-{3,}|\*{3,}|_{3,})[ \t]*$/;

/**
 * A GitHub-style table's delimiter row — `|---|:--:|`. A table is recognised
 * only by this line, never by pipes alone: a reply that says
 * "deadline | project" in prose is prose.
 */
const TABLE_DELIM = /^[ \t]*\|?[ \t]*:?-{1,}:?[ \t]*(\|[ \t]*:?-{1,}:?[ \t]*)+\|?[ \t]*$/;

/** Does this line start a block that a paragraph must break for? */
function startsBlock(line: string): boolean {
  return (
    FENCE.test(line) ||
    HEADING.test(line) ||
    BULLET.test(line) ||
    ORDERED.test(line) ||
    QUOTE.test(line) ||
    RULE.test(line)
  );
}

/**
 * Trailing punctuation that ends a sentence rather than the URL inside it.
 * `…rfc5545.txt.` is a link to the file and then a full stop, and getting that
 * wrong is visible — the link 404s.
 */
function trimUrlTail(url: string): string {
  let end = url.length;
  while (end > 0) {
    const ch = url[end - 1];
    if ('.,;:!?"\''.includes(ch)) {
      end -= 1;
      continue;
    }
    /* A closing bracket counts only if something opened it. Wikipedia's
       `…/Foo_(bar)` keeps its paren; `(see https://x.com/y)` does not. */
    if (ch === ')' || ch === ']') {
      const open = ch === ')' ? '(' : '[';
      const slice = url.slice(0, end);
      let depth = 0;
      for (const c of slice) {
        if (c === open) depth += 1;
        else if (c === ch) depth -= 1;
      }
      if (depth < 0) {
        end -= 1;
        continue;
      }
    }
    break;
  }
  return url.slice(0, end);
}

/** The href if it is one we are willing to arm, else null. */
function safeHref(raw: string): string | null {
  /*
   * Strip the whitespace and control characters a bypass hides inside the
   * scheme, *before* deciding what scheme this is. A browser ignores them
   * when it resolves a URL, so a test against the raw string is a test on
   * something other than what would actually be navigated to.
   *
   * A code-point filter rather than a regex on purpose: a literal control
   * character inside a character class is exactly what `no-control-regex`
   * exists to stop anybody writing, and it was written that way here once
   * already.
   */
  let cleaned = '';
  for (const ch of raw) {
    const code = ch.codePointAt(0) ?? 0;
    if (code > 0x20 && code !== 0x7f) cleaned += ch;
  }
  if (cleaned === '') return null;
  return SAFE_SCHEME.test(cleaned) ? cleaned : null;
}

/** Push text onto the tail of a run, merging with a `text` node already there. */
function pushText(out: MdInline[], text: string): void {
  if (text === '') return;
  const last = out[out.length - 1];
  if (last && last.kind === 'text') last.text += text;
  else out.push({ kind: 'text', text });
}

/**
 * The inline pass.
 *
 * `openStrong` / `openEm` stop a mark nesting inside itself, which is what
 * keeps `***both***` from recursing and what makes a stray `*` in a bulleted
 * sentence render as the asterisk it is.
 */
function parseInline(src: string, openStrong = false, openEm = false): MdInline[] {
  const out: MdInline[] = [];
  let i = 0;
  let plain = '';

  const flush = () => {
    pushText(out, plain);
    plain = '';
  };

  while (i < src.length) {
    const ch = src[i];

    /* Code first, and it wins over everything: what is inside a code span is
       characters, not marks. `**` inside backticks stays `**`. */
    if (ch === '`') {
      let ticks = 0;
      while (src[i + ticks] === '`') ticks += 1;
      const fence = '`'.repeat(ticks);
      const from = i + ticks;
      let at = src.indexOf(fence, from);
      /* A run longer than the opener is not a close — `` ``x`` `` inside a
         single-backtick span. Walk on until the run is exactly this long. */
      while (at !== -1 && src[at + ticks] === '`') at = src.indexOf(fence, at + ticks + 1);
      if (at !== -1) {
        const text = src.slice(from, at);
        flush();
        /* CommonMark strips one space each side so `` ` `` can be shown. */
        out.push({ kind: 'code', text: /^ .* $/.test(text) ? text.slice(1, -1) : text });
        i = at + ticks;
        continue;
      }
      plain += fence;
      i += ticks;
      continue;
    }

    if (!openStrong && src.startsWith('**', i)) {
      const at = src.indexOf('**', i + 2);
      if (at > i + 2) {
        flush();
        out.push({ kind: 'strong', children: parseInline(src.slice(i + 2, at), true, openEm) });
        i = at + 2;
        continue;
      }
    }

    if (!openEm && ch === '*' && !src.startsWith('**', i)) {
      /* No newline inside, and no empty `**` — the mockup's own rule, and it
         is what stops a line of asterisks becoming one long italic. */
      const rest = src.slice(i + 1);
      const close = rest.search(/\*/);
      if (close > 0 && !rest.slice(0, close).includes('\n')) {
        flush();
        out.push({ kind: 'em', children: parseInline(rest.slice(0, close), openStrong, true) });
        i += close + 2;
        continue;
      }
    }

    if (ch === '[') {
      const link = matchLink(src, i);
      if (link) {
        flush();
        const href = safeHref(link.href);
        if (href) out.push({ kind: 'link', href, children: parseInline(link.text, openStrong, openEm) });
        /* A scheme we will not arm keeps its source form, so nothing silently
           disappears from the reply. */
        else pushText(out, src.slice(i, link.end));
        i = link.end;
        continue;
      }
    }

    /*
     * A bare URL, which is the citation format Atlas actually writes — its
     * prompt asks for "the link", not for a Markdown link, and small models
     * oblige with a naked one. Only at a word boundary, so the `https://` in
     * the middle of a longer token is left alone.
     */
    if ((ch === 'h' || ch === 'H') && (i === 0 || /[\s([<]/.test(src[i - 1]))) {
      const m = BARE_URL.exec(src.slice(i));
      if (m) {
        const url = trimUrlTail(m[0]);
        const href = safeHref(url);
        if (href && url.length > 'https://'.length) {
          flush();
          out.push({ kind: 'link', href, children: [{ kind: 'text', text: url }] });
          i += url.length;
          continue;
        }
      }
    }

    plain += ch;
    i += 1;
  }

  flush();
  return out;
}

/** `[text](href)` at `from`, with balanced brackets in the label. */
function matchLink(src: string, from: number): { text: string; href: string; end: number } | null {
  let depth = 0;
  let close = -1;
  for (let i = from; i < src.length; i += 1) {
    if (src[i] === '[') depth += 1;
    else if (src[i] === ']') {
      depth -= 1;
      if (depth === 0) {
        close = i;
        break;
      }
    } else if (src[i] === '\n') return null;
  }
  if (close === -1 || src[close + 1] !== '(') return null;

  const end = src.indexOf(')', close + 2);
  if (end === -1 || src.slice(close + 2, end).includes('\n')) return null;

  /* `[text](url "title")` — the title is dropped, not rendered. */
  const inner = src.slice(close + 2, end).trim();
  const href = inner.split(/\s+/, 1)[0] ?? '';
  return { text: src.slice(from + 1, close), href, end: end + 1 };
}

/**
 * Parse a reply.
 *
 * Returns `[]` for empty or whitespace-only input, which is what the streaming
 * caret's first frame looks like.
 */
export function parseMarkdown(src: string): MdBlock[] {
  const lines = String(src).replace(/\r\n?/g, '\n').split('\n');
  const out: MdBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    /* ── Fenced code ── */
    const fence = FENCE.exec(line);
    if (fence) {
      const marker = fence[1][0];
      const width = fence[1].length;
      const lang = fence[2];
      i += 1;
      const body: string[] = [];
      /* A closing fence is the same character, at least as long, and nothing
         else on the line. Anything shorter is content. */
      const closes = (l: string) =>
        new RegExp(`^[ \\t]*\\${marker}{${width},}[ \\t]*$`).test(l);
      while (i < lines.length && !closes(lines[i])) body.push(lines[i++]);
      i += 1; // past the closing fence, or past the end if there was none
      out.push({ kind: 'code', lang, text: body.join('\n') });
      continue;
    }

    /* ── Blank lines and rules ──
       A rule carries no words. The design has no rule to draw and `###` — a
       kicker — is already how a reply changes subject, so rendering the
       characters would be putting punctuation back on the page. */
    if (line.trim() === '' || RULE.test(line)) {
      i += 1;
      continue;
    }

    /* ── Heading ── */
    const heading = HEADING.exec(line);
    if (heading) {
      out.push({
        kind: 'heading',
        level: heading[1].length <= 2 ? 1 : 2,
        /* `## Heading ##` — the closing run is decoration. */
        children: parseInline(heading[2].replace(/[ \t]+#+[ \t]*$/, '').trim()),
      });
      i += 1;
      continue;
    }

    /* ── Table, shown as raw output ──
       Header row, then the delimiter. Both are required, so a line of prose
       containing a pipe is never mistaken for one. */
    if (line.includes('|') && i + 1 < lines.length && TABLE_DELIM.test(lines[i + 1])) {
      const body: string[] = [];
      while (i < lines.length && lines[i].trim() !== '' && lines[i].includes('|')) body.push(lines[i++]);
      out.push({ kind: 'code', lang: 'table', text: body.join('\n') });
      continue;
    }

    /* ── Lists ──
       A blank line inside one does not end it: models put one between items
       constantly, and two lists of one item each renumbers from 1. */
    const bullet = BULLET.test(line);
    if (bullet || ORDERED.test(line)) {
      const marker = bullet ? BULLET : ORDERED;
      const items: MdInline[][] = [];
      while (i < lines.length) {
        if (lines[i].trim() === '') {
          /* Only if an item follows — otherwise the list has ended. */
          let peek = i + 1;
          while (peek < lines.length && lines[peek].trim() === '') peek += 1;
          if (peek >= lines.length || !marker.test(lines[peek])) break;
          i = peek;
          continue;
        }
        if (!marker.test(lines[i])) break;
        const text = [lines[i++].replace(marker, '')];
        /* A wrapped item: an indented continuation line that starts nothing. */
        while (i < lines.length && lines[i].trim() !== '' && !startsBlock(lines[i])) text.push(lines[i++].trim());
        items.push(parseInline(text.join(' ')));
      }
      out.push({ kind: 'list', ordered: !bullet, items });
      continue;
    }

    /* ── Blockquote ──
       Not in the design's table, and here because `<outside_text>` asks Atlas
       to quote a stranger's text back — including the line of an attempted
       injection. The treatment is the app's own, not an invented one: the
       hairline-and-inset that `ChatPage`'s thought aside already uses. */
    if (QUOTE.test(line)) {
      const body: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) body.push(lines[i++].replace(QUOTE, ''));
      out.push({ kind: 'quote', children: parseInline(body.join(' ').trim()) });
      continue;
    }

    /* ── Paragraph ──
       Soft line breaks are joined, which is what makes a model that hard-wraps
       at 80 columns read as prose rather than as a ragged column. */
    const body: string[] = [];
    while (i < lines.length && lines[i].trim() !== '' && !startsBlock(lines[i])) body.push(lines[i++]);
    out.push({ kind: 'paragraph', children: parseInline(body.join(' ')) });
  }

  return out;
}
