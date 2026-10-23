/**
 * Deleted things turn to dust (idea 48, Telegram's; 29-1P4c) — and an undo
 * gathers the dust back into them.
 *
 * **What dusts, his calls (2026-10-07):** a task's row, every way it can be
 * deleted (its ⋯ menu, Select → Delete, the sheet's Delete, Atlas deleting it
 * while the row is on screen); a list's whole column; a project's card; and
 * the Trash's Delete forever. Archive never does: dust means "gone to the
 * Trash", and an archive is kept for good. **An undo plays the dust in
 * reverse** — it flies in and rebuilds the row — his pick over a plain fade.
 *
 * ── HOW ──────────────────────────────────────────────────────────────────────
 * Anything that can dust carries `data-dust="task:<id>"` (`list:`, `project:`,
 * `trash:`) — `dustAttr` below. `installDust` (from `main.tsx`, after the undo
 * recorder) wraps the store's three deletes, so the marker is all a new row
 * needs: the same "wrap the store, not the buttons" that makes undo work
 * everywhere. Before the delete runs, each visible copy of the thing is
 * painted into a canvas (`paint`: its fills, borders, text and icons, read off
 * the live DOM — there is no screenshot API) for the grains' colours, and a
 * LIVE copy of it (`makeFace`, its own markup) takes its place and is wiped
 * away under a soft edge while 2 px grains peel off, drift up and right,
 * shrink and fade. **What he sees is always the real thing or its exact copy,
 * never the painting** — his note, the same day: "it gets pixelated then comes
 * to real thing, make it super precise". An undo runs the same backwards.
 *
 * The painting is ours rather than a library's on purpose: html2canvas is
 * 200 kB and asynchronous, and the row has to be captured in the same tick as
 * the delete, before React takes it away.
 *
 * ── SPEED (CLAUDE.md "Performance") ──────────────────────────────────────────
 * Nothing runs at rest: one shared `requestAnimationFrame` loop, only while a
 * burst is alive (about 1.4 s), and a single timeout to clean up behind it if
 * frames never come (a hidden tab). Particles are written straight into an
 * `ImageData` and put once per frame per burst, never `fillRect` per particle,
 * and the canvas is at CSS pixels drawn as crisp squares — at device pixels
 * the stand-in lost 15-30 fps (measured). The wipe is two transforms under a
 * mask that never changes, so it repaints nothing. A burst never holds more than `BUDGET` particles across everything
 * deleted in one press, so Select → Delete of thirty rows costs what one big
 * row does.
 *
 * Held snapshots (for the undo) are the last `HELD` things dusted, in memory
 * only, like the undo store itself.
 */
import { useStore } from '../store/useStore';
import { useUndoStore } from '../store/useUndoStore';
import { Z } from './zLayers';

export type DustKind = 'task' | 'list' | 'project' | 'trash';

/** The marker a dustable element carries. Spread it on the element's root. */
export function dustAttr(kind: DustKind, id: string): { 'data-dust': string } {
  return { 'data-dust': `${kind}:${id}` };
}

/** A CSS selector for every element carrying that marker — the task sheet grows out of one (29-1P6a). */
export function dustSelector(kind: DustKind, id: string): string {
  return selector(`${kind}:${id}`);
}

/* ── The motion, in px and ms (the idea card's per-frame numbers at 60 Hz) ── */

/** How long one particle lives once it lets go. */
export const LIFE_MS = 750;
/** The sweep: the right end of a row lets go this long after the left. */
export const SWEEP_MS = 460;
/** Plus up to this much at random, so the edge is ragged. */
export const JITTER_MS = 170;
/** Upward acceleration — the card's `vy -= 0.02` a frame. */
export const RISE = -7.2e-5;
/** The whole of a scatter, first particle to last. */
export const SCATTER_MS = SWEEP_MS + JITTER_MS + LIFE_MS;
/** A gather is the scatter backwards, this much faster: an undo should not keep him waiting. */
export const GATHER_SPEED = 1.5;

/** Particles drawn across one press, whatever it deleted. */
export const BUDGET = 24000;
/** And for any one thing in it — fine enough that a card's dust is 2 px grains. */
export const PER_ITEM = 12000;
/** Snapshots kept for an undo — his undo is 20 deep. */
const HELD = 24;

/** Room around the thing for the drift: it goes up and to the right. */
const MARGIN = { left: 8, right: 150, top: 140, bottom: 8 };

/**
 * The particle size that keeps `pixels` under `budget` particles — never
 * finer than 2 px (too many to be worth it) and never coarser than 8 (no
 * longer reads as dust). Pure, tested.
 */
export function particleStep(pixels: number, budget: number): number {
  if (pixels <= 0 || budget <= 0) return 8;
  return Math.min(8, Math.max(2, Math.ceil(Math.sqrt(pixels / budget))));
}

/** Where a particle is `age` ms after it let go, relative to where it began. Pure, tested. */
export function drift(vx: number, vy: number, age: number): { dx: number; dy: number; alpha: number } {
  if (age <= 0) return { dx: 0, dy: 0, alpha: 1 };
  return {
    dx: vx * age,
    dy: vy * age + 0.5 * RISE * age * age,
    alpha: Math.max(0, 1 - age / LIFE_MS),
  };
}

const reducedMotion = (): boolean =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/* ── Painting an element into a canvas ───────────────────────────────────── */

interface Box { left: number; top: number; right: number; bottom: number }

const boxOf = (r: DOMRect | Box): Box => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });

function intersect(a: Box, b: Box): Box | null {
  const box = {
    left: Math.max(a.left, b.left), top: Math.max(a.top, b.top),
    right: Math.min(a.right, b.right), bottom: Math.min(a.bottom, b.bottom),
  };
  return box.right - box.left >= 1 && box.bottom - box.top >= 1 ? box : null;
}

/** The part of `el` that can actually be seen: its box, cut by every scrolling or clipping ancestor and the window. */
function visibleBox(el: Element): Box | null {
  return clipped(el, boxOf(el.getBoundingClientRect()));
}

/** `box` cut by the window and every scrolling or clipping ancestor of `el`. */
function clipped(el: Element, from: Box): Box | null {
  let box: Box | null = intersect(from, { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight });
  for (let p = el.parentElement; p && box; p = p.parentElement) {
    const cs = getComputedStyle(p);
    if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') box = intersect(box, boxOf(p.getBoundingClientRect()));
  }
  return box;
}

/**
 * Where `el` is laid out, without the zoom it may be wearing: a returning row
 * mounts at 96% and grows. A copy cut to the zoomed outline laid its text out
 * 4% narrower and its chips jumped 40 px at the hand-over (measured). Framer
 * scales about the centre, so the layout box shares the outline's centre.
 */
function layoutBox(el: HTMLElement): Box {
  const r = el.getBoundingClientRect();
  /* `offsetWidth` is whole pixels, so it only says how zoomed the row is;
     at rest the outline itself is exact. */
  const zoom = el.offsetWidth ? r.width / el.offsetWidth : 1;
  if (Math.abs(zoom - 1) < 0.005) return boxOf(r);
  const w = r.width / zoom;
  const h = r.height / zoom;
  const left = r.left + (r.width - w) / 2;
  const top = r.top + (r.height - h) / 2;
  return { left, top, right: left + w, bottom: top + h };
}

/** Elements walked per snapshot, at most — a column of a hundred cards stops here. */
const NODE_CAP = 2500;

const TRANSPARENT = /^(transparent|rgba\(0, 0, 0, 0\))$/;
const COLOUR = /(?:oklch|oklab|rgba?|hsla?|color|lab|lch)\([^()]*\)/g;

/** A computed `background-image`'s layers, split on its top-level commas. Pure, tested. */
export function layers(image: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < image.length; i++) {
    const ch = image[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) { out.push(image.slice(from, i).trim()); from = i + 1; }
  }
  out.push(image.slice(from).trim());
  return out.filter(Boolean);
}

/** Images on cards, once loaded: drawn if the browser already has them, skipped if not. */
function loadedImage(src: string): HTMLImageElement | null {
  const img = new Image();
  img.src = src;
  return img.complete && img.naturalWidth > 0 ? img : null;
}

function drawCover(g: CanvasRenderingContext2D, img: CanvasImageSource & { naturalWidth?: number; naturalHeight?: number }, r: DOMRect) {
  const iw = img.naturalWidth || r.width;
  const ih = img.naturalHeight || r.height;
  const s = Math.max(r.width / iw, r.height / ih);
  const w = iw * s;
  const h = ih * s;
  g.drawImage(img, r.left + (r.width - w) / 2, r.top + (r.height - h) / 2, w, h);
}

class Painter {
  private nodes = 0;
  private g: CanvasRenderingContext2D;
  private images: boolean;
  constructor(g: CanvasRenderingContext2D, images: boolean) {
    this.g = g;
    this.images = images;
  }

  element(el: Element, alpha: number, clip: Box | null): void {
    if (++this.nodes > NODE_CAP) return;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    const a = alpha * (parseFloat(cs.opacity) || 0);
    if (a < 0.02) return;
    const r = el.getBoundingClientRect();
    if (el instanceof SVGSVGElement) { this.svg(el, a, clip); return; }
    if (r.width < 1 || r.height < 1) {
      /* A zero-size wrapper can still hold visible children. */
      if (cs.display !== 'contents' && cs.overflowX !== 'visible') return;
    }
    const g = this.g;
    g.save();
    g.globalAlpha = a;
    if (clip) { g.beginPath(); g.rect(clip.left, clip.top, clip.right - clip.left, clip.bottom - clip.top); g.clip(); }
    this.box(el, cs, r);
    g.restore();

    let inner = clip;
    if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') inner = clip ? intersect(clip, boxOf(r)) : boxOf(r);
    if (!inner && clip) return;
    for (const child of el.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) this.text(child as Text, cs, a, inner);
      else if (child instanceof Element) this.element(child, a, inner);
    }
  }

  private box(el: Element, cs: CSSStyleDeclaration, r: DOMRect): void {
    const g = this.g;
    if (r.width < 1 || r.height < 1) return;
    const radius = Math.min(parseFloat(cs.borderTopLeftRadius) || 0, r.width / 2, r.height / 2);
    const shape = () => { g.beginPath(); g.roundRect(r.left, r.top, r.width, r.height, radius); };

    if (!TRANSPARENT.test(cs.backgroundColor)) { g.fillStyle = cs.backgroundColor; shape(); g.fill(); }

    const image = cs.backgroundImage;
    if (image && image !== 'none') {
      const url = /url\("?([^")]+)"?\)/.exec(image);
      if (url && this.images) {
        const img = loadedImage(url[1]);
        if (img) { g.save(); shape(); g.clip(); drawCover(g, img, r); g.restore(); }
      } else if (image.includes('gradient')) {
        /* A glass fill is layers — a faint white sheen over the 92% floor —
           and each is painted on its own, bottom first. Blended into one
           gradient, a canvas mixes the white and the dark unpremultiplied and
           the card comes out a grey slab (measured, 2026-10-07). Stops are
           spread evenly along the diagonal; for dust that is the look. */
        for (const layer of layers(image).reverse()) {
          const stops = layer.match(COLOUR);
          if (!stops?.length) continue;
          const grad = g.createLinearGradient(r.left, r.top, r.right, r.bottom);
          try {
            stops.forEach((c, i) => grad.addColorStop(stops.length === 1 ? 0 : i / (stops.length - 1), c));
            g.fillStyle = grad; shape(); g.fill();
          } catch { /* a colour this canvas cannot parse — leave the layer out */ }
        }
      }
    }

    const bw = parseFloat(cs.borderTopWidth) || 0;
    if (bw > 0 && cs.borderTopStyle !== 'none' && !TRANSPARENT.test(cs.borderTopColor)) {
      g.strokeStyle = cs.borderTopColor; g.lineWidth = bw;
      g.beginPath();
      g.roundRect(r.left + bw / 2, r.top + bw / 2, r.width - bw, r.height - bw, Math.max(0, radius - bw / 2));
      g.stroke();
    }

    if (this.images && (el instanceof HTMLImageElement) && el.complete && el.naturalWidth > 0) {
      g.save(); shape(); g.clip();
      if (cs.objectFit === 'cover') drawCover(g, el, r);
      else g.drawImage(el, r.left, r.top, r.width, r.height);
      g.restore();
    }
  }

  /** Word by word, so a wrapped title lands on both of its lines. */
  private text(node: Text, cs: CSSStyleDeclaration, alpha: number, clip: Box | null): void {
    const data = node.data;
    if (!data.trim()) return;
    const g = this.g;
    g.save();
    g.globalAlpha = alpha;
    if (clip) { g.beginPath(); g.rect(clip.left, clip.top, clip.right - clip.left, clip.bottom - clip.top); g.clip(); }
    g.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    g.fillStyle = cs.color;
    g.textBaseline = 'middle';
    if ('letterSpacing' in g && cs.letterSpacing !== 'normal') (g as unknown as { letterSpacing: string }).letterSpacing = cs.letterSpacing;
    const range = document.createRange();
    const upper = cs.textTransform === 'uppercase';
    /* Most runs sit on one line: one rect, one draw. Word by word only for a
       run that wraps — that walk was most of a capture's cost (measured). */
    range.selectNodeContents(node);
    const lines = range.getClientRects();
    if (lines.length === 1 && cs.whiteSpace !== 'pre' && cs.whiteSpace !== 'pre-wrap') {
      const r = lines[0];
      const text = data.replace(/\s+/g, ' ').trim();
      if (r.width >= 1) g.fillText(upper ? text.toUpperCase() : text, r.left + (/^\s/.test(data) ? g.measureText(' ').width : 0), r.top + r.height / 2);
      g.restore();
      return;
    }
    for (const m of data.matchAll(/\S+/g)) {
      range.setStart(node, m.index);
      range.setEnd(node, m.index + m[0].length);
      const r = range.getClientRects()[0];
      if (!r || r.width < 1) continue;
      g.fillText(upper ? m[0].toUpperCase() : m[0], r.left, r.top + r.height / 2);
    }
    g.restore();
  }

  /** An icon: each shape through its own screen matrix, so viewBox and transforms come for free. */
  private svg(svg: SVGSVGElement, alpha: number, clip: Box | null): void {
    const g = this.g;
    const shapes = svg.querySelectorAll<SVGGraphicsElement>('path,circle,ellipse,line,rect,polyline,polygon');
    for (const shape of shapes) {
      if (++this.nodes > NODE_CAP) return;
      const cs = getComputedStyle(shape);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const m = shape.getScreenCTM();
      if (!m) continue;
      const p = shapePath(shape);
      if (!p) continue;
      g.save();
      if (clip) { g.beginPath(); g.rect(clip.left, clip.top, clip.right - clip.left, clip.bottom - clip.top); g.clip(); }
      g.globalAlpha = alpha * (parseFloat(cs.opacity) || 0);
      g.transform(m.a, m.b, m.c, m.d, m.e, m.f);
      if (cs.fill !== 'none' && !TRANSPARENT.test(cs.fill)) {
        g.fillStyle = cs.fill;
        g.globalAlpha *= parseFloat(cs.fillOpacity) || 1;
        g.fill(p, cs.fillRule === 'evenodd' ? 'evenodd' : 'nonzero');
      }
      if (cs.stroke !== 'none' && !TRANSPARENT.test(cs.stroke)) {
        g.strokeStyle = cs.stroke;
        g.lineWidth = parseFloat(cs.strokeWidth) || 1;
        g.lineCap = cs.strokeLinecap as CanvasLineCap;
        g.lineJoin = cs.strokeLinejoin as CanvasLineJoin;
        g.stroke(p);
      }
      g.restore();
    }
  }
}

function num(el: Element, attr: string): number {
  return parseFloat(el.getAttribute(attr) ?? '0') || 0;
}

function shapePath(el: Element): Path2D | null {
  const p = new Path2D();
  switch (el.tagName.toLowerCase()) {
    case 'path': {
      const d = el.getAttribute('d');
      return d ? new Path2D(d) : null;
    }
    case 'circle': p.arc(num(el, 'cx'), num(el, 'cy'), num(el, 'r'), 0, Math.PI * 2); return p;
    case 'ellipse': p.ellipse(num(el, 'cx'), num(el, 'cy'), num(el, 'rx'), num(el, 'ry'), 0, 0, Math.PI * 2); return p;
    case 'line': p.moveTo(num(el, 'x1'), num(el, 'y1')); p.lineTo(num(el, 'x2'), num(el, 'y2')); return p;
    case 'rect': p.roundRect(num(el, 'x'), num(el, 'y'), num(el, 'width'), num(el, 'height'), num(el, 'rx')); return p;
    case 'polyline':
    case 'polygon': {
      const pts = (el.getAttribute('points') ?? '').trim().split(/[\s,]+/).map(Number);
      for (let i = 0; i + 1 < pts.length; i += 2) (i ? p.lineTo : p.moveTo).call(p, pts[i], pts[i + 1]);
      if (el.tagName.toLowerCase() === 'polygon') p.closePath();
      return p;
    }
    default: return null;
  }
}

/** The thing as it looks right now, as pixels the size of its box. */
interface Snapshot {
  w: number;
  h: number;
  pixels: Uint8ClampedArray;
}

function paint(el: Element): Snapshot | null {
  const r = el.getBoundingClientRect();
  const w = Math.ceil(r.width);
  const h = Math.ceil(r.height);
  if (w < 1 || h < 1 || w * h > 4_000_000) return null;
  const draw = (images: boolean): Snapshot => {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const g = cv.getContext('2d', { willReadFrequently: true })!;
    g.translate(-r.left, -r.top);
    new Painter(g, images).element(el, 1, null);
    return { w, h, pixels: g.getImageData(0, 0, w, h).data };
  };
  try {
    return draw(true);
  } catch {
    /* A cover from another site without CORS taints the canvas, and reading it
       back throws. The card dusts without its picture rather than not at all. */
    try { return draw(false); } catch { return null; }
  }
}

/* ── Particles and the loop ──────────────────────────────────────────────── */

interface Burst {
  mode: 'scatter' | 'gather';
  /**
   * What the dust peels off: a live copy of the real element, wiped away (or,
   * gathering, back in) in step with the grains — never a painted stand-in
   * swapped for the real one (his note, 2026-10-07: "it gets pixelated then
   * comes to real thing").
   */
  face?: Face;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  image: ImageData;
  buf: Uint32Array;
  n: number;
  step: number;
  /** Start, relative to the thing's top-left. */
  x: Float32Array;
  y: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  delay: Float32Array;
  /** Colour, RGB packed little-endian with no alpha. */
  rgb: Uint32Array;
  alpha: Float32Array;
  /** Where the thing's top-left sits in the canvas. */
  ox: number;
  oy: number;
  t0: number;
  /** A gather follows its row, which may still be gliding into place — or be
      re-made by React a moment after it came back (measured on a board). */
  target?: HTMLElement;
  key?: string;
  done?: () => void;
}

let layer: HTMLDivElement | null = null;

function ensureLayer(): HTMLDivElement {
  if (layer?.isConnected) return layer;
  layer = document.createElement('div');
  layer.setAttribute('aria-hidden', 'true');
  layer.dataset.dustLayer = '';
  Object.assign(layer.style, {
    position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: String(Z.dust), overflow: 'hidden',
  });
  document.body.appendChild(layer);
  return layer;
}

/** Builds the particles for `shot`, from the pixels inside `visible` (relative to the thing). */
function makeBurst(
  mode: Burst['mode'], shot: Snapshot, visible: Box, at: Box, budget: number,
): Burst | null {
  const vw = visible.right - visible.left;
  const vh = visible.bottom - visible.top;
  const step = particleStep(vw * vh, budget);
  const cap = Math.ceil(vw / step) * Math.ceil(vh / step);
  const x = new Float32Array(cap), y = new Float32Array(cap);
  const vx = new Float32Array(cap), vy = new Float32Array(cap), delay = new Float32Array(cap);
  const rgb = new Uint32Array(cap), alpha = new Float32Array(cap);
  let n = 0;
  const { w, pixels } = shot;
  for (let py = Math.floor(visible.top); py < visible.bottom; py += step) {
    for (let px = Math.floor(visible.left); px < visible.right; px += step) {
      const i = (py * w + px) * 4;
      const a = pixels[i + 3];
      if (a < 12) continue;
      x[n] = px; y[n] = py;
      vx[n] = 0.036 + Math.random() * 0.132;
      vy[n] = -0.036 - Math.random() * 0.096;
      delay[n] = (px / w) * SWEEP_MS + Math.random() * JITTER_MS;
      rgb[n] = pixels[i] | (pixels[i + 1] << 8) | (pixels[i + 2] << 16);
      alpha[n] = a / 255;
      n++;
    }
  }
  if (n === 0) return null;

  const cw = Math.ceil(vw + MARGIN.left + MARGIN.right);
  const ch = Math.ceil(vh + MARGIN.top + MARGIN.bottom);
  /* CSS pixels, scaled up as crisp squares: a 2 px grain stays a sharp grain.
     At device pixels the stand-in fell from ~50 fps to 13-36 (measured). */
  const canvas = document.createElement('canvas');
  canvas.width = cw; canvas.height = ch;
  Object.assign(canvas.style, {
    position: 'absolute', left: '0', top: '0', width: `${cw}px`, height: `${ch}px`,
    imageRendering: 'pixelated',
  });
  const ox = MARGIN.left - visible.left;
  const oy = MARGIN.top - visible.top;
  place(canvas, at.left + visible.left - MARGIN.left, at.top + visible.top - MARGIN.top);
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(canvas.width, canvas.height);
  ensureLayer().appendChild(canvas);
  return {
    mode, canvas, ctx, image, buf: new Uint32Array(image.data.buffer), n, step,
    x, y, vx, vy, delay, rgb, alpha, ox, oy, t0: performance.now(),
  };
}

function place(canvas: HTMLCanvasElement, left: number, top: number) {
  canvas.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
}

const bursts = new Set<Burst>();
let raf = 0;

/** Draws one frame of `b` at its own time `t` (ms into a scatter). False once nothing is left. */
function drawBurst(b: Burst, t: number): boolean {
  const { buf, image, step, n } = b;
  const cw = image.width, ch = image.height;
  buf.fill(0);
  let alive = false;
  for (let i = 0; i < n; i++) {
    const age = t - b.delay[i];
    /* Not let go yet (or, gathering, already home): the face shows it. */
    if (age <= 0) { alive = true; continue; }
    const d = drift(b.vx[i], b.vy[i], age);
    const a = d.alpha * b.alpha[i];
    if (a <= 0.01) continue;
    alive = true;
    /* A grain shrinks as it fades, so it thins out rather than blinking off. */
    const size = Math.max(1, Math.round(step * (0.45 + 0.55 * d.alpha)));
    const px = Math.round(b.x[i] + b.ox + d.dx);
    const py = Math.round(b.y[i] + b.oy + d.dy);
    if (px >= cw || py >= ch || px + size <= 0 || py + size <= 0) continue;
    const c = b.rgb[i] | (Math.round(a * 255) << 24);
    const x0 = Math.max(0, px), x1 = Math.min(cw, px + size);
    for (let yy = Math.max(0, py), y1 = Math.min(ch, py + size); yy < y1; yy++) {
      buf.fill(c, yy * cw + x0, yy * cw + x1);
    }
  }
  b.ctx.putImageData(image, 0, 0);
  return alive;
}

/**
 * The copy the dust peels off, and the wipe that takes it away. Three boxes:
 * `holder` is the part of the thing that was on screen; `wiper` slides right
 * under a mask that is clear at its left edge and solid a band later; `card`
 * (the copy) slides left by the same amount, so it stays put while the soft
 * edge crosses it. Both slides are transforms and the mask never changes, so
 * the browser moves layers and repaints nothing. A mask redrawn each frame
 * held the stand-in at 30-39 fps; this costs what no sweep did (measured).
 */
interface Face {
  holder: HTMLElement;
  wiper: HTMLElement;
  card: HTMLElement;
  /** Where the thing's top-left was when the copy was made, to follow it. */
  ax: number;
  ay: number;
  w: number;
}

/**
 * A live copy of `el`: its own markup and classes, so it looks exactly like
 * it, where a painted copy differed in its fonts and chips. Carries the text
 * style and theme it inherited; inert, and with no `data-dust`, ids or
 * hiding of its own.
 */
function makeFace(el: HTMLElement): Face {
  const L = layoutBox(el);
  const w = L.right - L.left;
  const h = L.bottom - L.top;
  const band = (w * JITTER_MS) / SWEEP_MS;
  /* The part that can be seen: a row half scrolled under its list's edge is copied half. */
  const shown = clipped(el, L) ?? L;
  const holder = document.createElement('div');
  const parent = el.parentElement ? getComputedStyle(el.parentElement) : null;
  if (el.closest('[data-v3]')) holder.setAttribute('data-v3', '');
  Object.assign(holder.style, {
    position: 'absolute', overflow: 'hidden',
    left: `${shown.left}px`, top: `${shown.top}px`,
    width: `${shown.right - shown.left}px`, height: `${shown.bottom - shown.top}px`,
    ...(parent ? {
      color: parent.color, fontFamily: parent.fontFamily, fontSize: parent.fontSize, fontWeight: parent.fontWeight,
      lineHeight: parent.lineHeight, letterSpacing: parent.letterSpacing,
    } : {}),
  });
  const wiper = document.createElement('div');
  const edge = `linear-gradient(90deg, transparent 0px, #000 ${band.toFixed(1)}px)`;
  Object.assign(wiper.style, {
    position: 'absolute', overflow: 'hidden',
    left: `${L.left - shown.left - band}px`, top: `${L.top - shown.top}px`, width: `${w + band}px`, height: `${h}px`,
    maskImage: edge, webkitMaskImage: edge,
  });
  const opacity = getComputedStyle(el).opacity;
  const card = el.cloneNode(true) as HTMLElement;
  for (const x of [card, ...card.querySelectorAll<HTMLElement>('[data-dust],[data-dust-hidden],[id]')]) {
    x.removeAttribute('data-dust');
    x.removeAttribute('data-dust-hidden');
    x.removeAttribute('id');
  }
  card.setAttribute('aria-hidden', 'true');
  card.inert = true;
  Object.assign(card.style, {
    position: 'absolute', margin: '0', boxSizing: 'border-box',
    left: `${band}px`, top: '0', width: `${w}px`, height: `${h}px`,
    transform: 'none', translate: 'none', scale: 'none', opacity,
  });
  wiper.appendChild(card);
  holder.appendChild(wiper);
  return { holder, wiper, card, ax: L.left, ay: L.top, w };
}

/** Starts the wipe: away for a scatter, back in (backwards, later, faster) for a gather. */
function sweep(face: Face, mode: Burst['mode']): void {
  const far = (face.w * (SWEEP_MS + JITTER_MS)) / SWEEP_MS;
  const there = [{ transform: 'translateX(0)' }, { transform: `translateX(${far}px)` }];
  const back = [{ transform: 'translateX(0)' }, { transform: `translateX(${-far}px)` }];
  const timing: KeyframeAnimationOptions = mode === 'scatter'
    ? { duration: SWEEP_MS + JITTER_MS, easing: 'linear', fill: 'forwards' }
    : { duration: (SWEEP_MS + JITTER_MS) / GATHER_SPEED, delay: LIFE_MS / GATHER_SPEED, easing: 'linear', fill: 'both', direction: 'reverse' };
  face.wiper.animate?.(there, timing);
  face.card.animate?.(back, timing);
}

function tick(now: number) {
  raf = 0;
  for (const b of bursts) {
    const elapsed = now - b.t0;
    if (b.mode === 'scatter') {
      if (!drawBurst(b, Math.max(0, elapsed)) && elapsed > 0) end(b);
    } else {
      const t = SCATTER_MS - elapsed * GATHER_SPEED;
      if (b.key && !b.target?.isConnected) {
        for (const el of document.querySelectorAll<HTMLElement>(selector(b.key))) if (visibleBox(el)) { retarget(b, el); break; }
      }
      if (b.target?.isConnected) {
        const r = b.target.getBoundingClientRect();
        place(b.canvas, r.left - b.ox, r.top - b.oy);
        if (b.face) {
          const L = layoutBox(b.target);
          b.face.holder.style.transform = `translate(${L.left - b.face.ax}px, ${L.top - b.face.ay}px)`;
          /* The row may still be fading in from its mount; the copy keeps pace. */
          b.face.card.style.opacity = getComputedStyle(b.target).opacity;
        }
      }
      drawBurst(b, Math.max(0, t));
      if (t <= 0) end(b);
    }
  }
  if (bursts.size) raf = requestAnimationFrame(tick);
}

function start(b: Burst) {
  bursts.add(b);
  if (!raf) raf = requestAnimationFrame(tick);
  /* Frames do not come in a hidden tab; nothing may be left on screen or hidden. */
  const total = b.mode === 'scatter' ? SCATTER_MS : SCATTER_MS / GATHER_SPEED;
  setTimeout(() => { if (bursts.has(b)) end(b); }, total + 1500);
}

function end(b: Burst) {
  if (!bursts.delete(b)) return;
  b.done?.();
  b.canvas.remove();
  b.face?.holder.remove();
}

/* ── Turning to dust, and gathering back ─────────────────────────────────── */

interface Held { shot: Snapshot; visible: Box }
const held = new Map<string, Held>();

interface Pending { key: string; el: HTMLElement; shot: Snapshot; visible: Box; at: Box; face: Face }
let pending: Pending[] = [];

/**
 * Hidden while its dust stands in for it. An attribute and an `!important`
 * rule (`index.css`), never `style.visibility`: Framer Motion writes
 * `visibility: ""` onto every `layout` element as it projects, and a board
 * row came back in full view under its own gathering dust (measured).
 */
const hide = (el: HTMLElement) => { el.dataset.dustHidden = ''; };
const show = (el: HTMLElement) => { delete el.dataset.dustHidden; };

const selector = (key: string) => `[data-dust="${CSS.escape(key)}"]`;

/** Everything on screen marked `key` — a task can be on the board and in an open panel at once. */
function visibleCopies(key: string): { el: HTMLElement; visible: Box }[] {
  const out: { el: HTMLElement; visible: Box }[] = [];
  for (const el of document.querySelectorAll<HTMLElement>(selector(key))) {
    if (el.dataset.dustHidden !== undefined) continue;
    const visible = visibleBox(el);
    if (visible) out.push({ el, visible });
  }
  return out;
}

/**
 * Turns everything marked with these keys to dust, now, before it is deleted.
 * Call it just before the delete; the store's three deletes already do.
 * Captures synchronously (React may take the row away in the next microtask)
 * and starts the dust once the whole press has been captured, so one press
 * shares one budget.
 */
export function turnToDust(keys: string[]): void {
  if (typeof document === 'undefined' || reducedMotion() || document.hidden) return;
  for (const key of keys) {
    for (const { el, visible } of visibleCopies(key)) {
      const shot = paint(el);
      if (!shot) continue;
      const at = boxOf(el.getBoundingClientRect());
      const rel: Box = { left: visible.left - at.left, top: visible.top - at.top, right: visible.right - at.left, bottom: visible.bottom - at.top };
      /* The copy goes in before the real one hides, so not a frame is missing. */
      const face = makeFace(el);
      ensureLayer().appendChild(face.holder);
      pending.push({ key, el, shot, visible: rel, at, face });
      hide(el);
      /* If the delete did not take it away after all, it comes back. */
      setTimeout(() => {
        if (el.isConnected) show(el);
      }, SCATTER_MS + 1500);
    }
  }
  if (pending.length) queueMicrotask(flush);
}

function flush() {
  const batch = pending;
  pending = [];
  if (!batch.length) return;
  const each = Math.min(PER_ITEM, Math.floor(BUDGET / batch.length));
  for (const p of batch) {
    held.delete(p.key);
    held.set(p.key, { shot: p.shot, visible: p.visible });
    while (held.size > HELD) held.delete(held.keys().next().value!);
    const b = makeBurst('scatter', p.shot, p.visible, p.at, each);
    if (!b) { p.face.holder.remove(); continue; }
    /* The canvas went in after the copy, so the grains fly over what is left of it. */
    b.face = p.face;
    sweep(b.face, 'scatter');
    start(b);
  }
}

/**
 * Plays `key`'s dust backwards into `el`, which has just come back and is
 * hidden until the dust has rebuilt it.
 */
function gatherInto(key: string, el: HTMLElement, budget: number): void {
  const h = held.get(key);
  held.delete(key);
  const at = boxOf(el.getBoundingClientRect());
  /* Its new box may differ by a wrap; the dust fills what both share. */
  const visible = h && intersect(h.visible, { left: 0, top: 0, right: Math.min(h.shot.w, at.right - at.left), bottom: Math.min(h.shot.h, at.bottom - at.top) });
  const b = h && visible ? makeBurst('gather', h.shot, visible, at, budget) : null;
  if (!b || !visible) { show(el); return; }
  b.target = el;
  b.key = key;
  /* A copy of the returning row is wiped back in under the landing grains,
     and the row itself shows only when the copy is whole: the same pixels,
     so the hand-over cannot be seen. */
  b.face = makeFace(el);
  ensureLayer().insertBefore(b.face.holder, b.canvas);
  sweep(b.face, 'gather');
  gathering.set(key, b);
  b.done = () => {
    gathering.delete(key);
    if (b.target) show(b.target);
  };
  drawBurst(b, SCATTER_MS);
  start(b);
}

/** Gathers running, by key, so a row React re-makes mid-gather is found and hidden too. */
const gathering = new Map<string, Burst>();

/** The gather's row was replaced: the new one is hidden and the dust follows it. */
function retarget(b: Burst, el: HTMLElement): void {
  if (b.target === el || b.target?.isConnected) return;
  hide(el);
  b.target = el;
}

/** How long a returning row may take to be on screen — a list it is in may still be opening. */
const ARRIVE_MS = 700;

/**
 * After an undo: the keys whose dust we still hold gather into their rows as
 * the rows come back. A row usually mounts in React's commit after the store
 * changes, so a MutationObserver catches it before it is ever painted and
 * hides it; one still on screen (an undo inside its exit animation) is taken
 * at once. Either way it is held hidden until it is actually on screen — the
 * list it lands in may be opening around it — and the first copy that shows
 * gathers; any other (a hidden kept screen's) is let go untouched. Waited on
 * with timers, not frames: frames stop in a hidden tab, and a row left hidden
 * would be a row lost. Exported for `/design`'s specimen; the app's own
 * undo reaches it through `installDust`.
 */
export function gatherBack(keys: string[]): void {
  const wanted = new Set(keys.filter((k) => held.has(k)));
  if (!wanted.size || reducedMotion() || document.hidden) return;
  const budget = Math.min(PER_ITEM, Math.floor(BUDGET / wanted.size));
  const tried = new WeakSet<HTMLElement>();
  const take = (el: HTMLElement) => {
    const key = el.dataset.dust;
    if (!key) return;
    if (!wanted.has(key)) { const g = gathering.get(key); if (g) retarget(g, el); return; }
    if (tried.has(el)) return;
    tried.add(el);
    hide(el);
    const since = performance.now();
    const wait = () => {
      if (!wanted.has(key) || !el.isConnected) { show(el); return; }
      if (visibleBox(el)) { wanted.delete(key); gatherInto(key, el, budget); return; }
      if (performance.now() - since > ARRIVE_MS) { show(el); return; }
      setTimeout(wait, 16);
    };
    wait();
  };
  for (const key of [...wanted]) {
    for (const el of document.querySelectorAll<HTMLElement>(selector(key))) take(el);
  }
  /* Watched even when every row was taken at once: React may still re-make one. */
  const ours = [...keys];
  const settled = () => !wanted.size && !ours.some((k) => gathering.has(k));
  if (settled()) return;
  const mo = new MutationObserver((records) => {
    for (const rec of records) {
      for (const node of rec.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.dataset.dust) take(node);
        for (const el of node.querySelectorAll<HTMLElement>('[data-dust]')) take(el);
      }
    }
    if (settled()) mo.disconnect();
  });
  mo.observe(document.body, { childList: true, subtree: true });
  setTimeout(() => mo.disconnect(), ARRIVE_MS + SCATTER_MS / GATHER_SPEED + 200);
}

/* ── Installing ──────────────────────────────────────────────────────────── */

let installed = false;

/**
 * Once, at startup, after `installUndoRecorder` (`main.tsx`): the store's
 * three deletes dust what they are about to take, and an undo of a delete
 * gathers it back. Atlas's deletes go through the same actions, so a row
 * deleted by Atlas while he watches turns to dust too — his call.
 */
export function installDust(): void {
  if (installed) return;
  installed = true;
  const s = useStore.getState();
  const { deleteBacklogTask, deleteTaskList, deleteProject } = s;
  useStore.setState({
    deleteBacklogTask: (id: string) => { turnToDust([`task:${id}`]); return deleteBacklogTask(id); },
    deleteTaskList: (id: string) => { turnToDust([`list:${id}`]); return deleteTaskList(id); },
    deleteProject: (id: string) => { turnToDust([`project:${id}`]); return deleteProject(id); },
  } as never);

  let seen = 0;
  useUndoStore.subscribe((u) => {
    const ran = u.ran;
    if (!ran || ran.seq === seen) return;
    seen = ran.seq;
    if (ran.op !== 'undo') return;
    gatherBack(ran.action.entries.map((e) => `${e.kind}:${e.id}`));
  });
}
