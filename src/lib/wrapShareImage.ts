/**
 * Share on the wrapped story's summary (29-1P14e2, idea 107's "a card to
 * share"). His calls (2026-10-20): **a picture of the summary, handed to the
 * device's share sheet** (WhatsApp, Instagram, save to Photos), **saved on the
 * laptop**; **the top project's name is on it**, as the page shows it.
 *
 * The picture is drawn on a canvas by hand, story-sized (1080 × 1920), from
 * the same `summaryStats` the page draws — no library that photographs the
 * page (a few hundred KB for one button), and nothing here is imported until
 * Share is pressed. Colours are the page's own tokens read off the frame, so
 * the picture is the page's colours, his dark tint included.
 */
import type { WrapStat } from './monthWrapped';

const W = 1080;
const H = 1920;
const PAD = 96;

/** A token or colour as the canvas can paint it: `var(--x)` read off `from`. */
function paint(colour: string | undefined, from: Element, fallback: string): string {
  if (!colour) return fallback;
  const v = /^var\((--[\w-]+)\)$/.exec(colour.trim());
  if (!v) return colour;
  return getComputedStyle(from).getPropertyValue(v[1]).trim() || fallback;
}

/** `text`, cut with an ellipsis to fit `width` in the context's font. */
function fit(ctx: CanvasRenderingContext2D, text: string, width: number): string {
  if (ctx.measureText(text).width <= width) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > width) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

export interface WrapPicture {
  /** "September", "2026". */
  name: string;
  /** The kicker over the title: "September in BASE". */
  kicker: string;
  stats: WrapStat[];
}

/** Draws the summary picture; `from` is an element inside the story, for its tokens and fonts. */
export async function drawWrapPicture(picture: WrapPicture, from: Element): Promise<Blob> {
  const style = getComputedStyle(from);
  const display = style.getPropertyValue('--font-display').trim() || 'system-ui, sans-serif';
  const numeric = style.getPropertyValue('--font-numeric').trim() || display;
  await Promise.all([
    document.fonts.load(`300 120px ${display}`),
    document.fonts.load(`500 40px ${display}`),
    document.fonts.load(`300 120px ${numeric}`),
  ]).catch(() => undefined);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No canvas');
  const ink = 'oklch(0.98 0.01 260)';

  /* The ground: the cover's and summary's celebration on the dark. */
  ctx.fillStyle = paint('var(--void-1)', from, '#16161c');
  ctx.fillRect(0, 0, W, H);
  const glow = (x: number, y: number, r: number, colour: string, alpha: number) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, colour);
    g.addColorStop(1, 'transparent');
    ctx.globalAlpha = alpha;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  };
  glow(W * 0.9, 0, 1150, paint('var(--job-rose)', from, '#e0609a'), 0.42);
  glow(0, H, 1050, paint('var(--job-orange)', from, '#f07a2a'), 0.38);

  /* The cover's three shapes, small, as the mark in the corner. */
  ctx.fillStyle = paint('var(--job-gold)', from, '#e8b830');
  ctx.beginPath();
  ctx.arc(W - 120, 170, 70, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.translate(W - 250, 250);
  ctx.rotate((18 * Math.PI) / 180);
  ctx.fillStyle = paint('var(--job-lime)', from, '#b8e04a');
  ctx.beginPath();
  ctx.roundRect(-45, -45, 90, 90, 24);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = paint('var(--job-rose)', from, '#e0609a');
  ctx.beginPath();
  ctx.roundRect(W - 300, 330, 210, 34, 17);
  ctx.fill();

  /* The kicker and the title. */
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = ink;
  ctx.globalAlpha = 0.82;
  ctx.font = `500 40px ${display}`;
  ctx.letterSpacing = '1.5px';
  ctx.fillText(picture.kicker, PAD, 210);
  ctx.globalAlpha = 1;
  ctx.font = `300 132px ${display}`;
  ctx.letterSpacing = '-5px';
  ctx.fillText(`${picture.name},`, PAD, 470);
  ctx.fillText('wrapped.', PAD, 610);

  /* The numbers, two to a row, a wide one across both, standing on the foot like the story's pages. */
  const col = (W - PAD * 2 - 60) / 2;
  const rows: { stats: WrapStat[]; tall: number }[] = [];
  for (const stat of picture.stats) {
    const row = rows.at(-1);
    if (row && row.stats.length === 1 && !row.stats[0].wide && !stat.wide) row.stats.push(stat);
    else rows.push({ stats: [stat], tall: 0 });
  }
  for (const row of rows) row.tall = row.stats.some((s) => s.big) ? 250 : 175;
  let y = Math.max(790, H - 250 - rows.reduce((a, r) => a + r.tall, 0));
  for (const row of rows) {
    row.stats.forEach((stat, x) => {
      const left = PAD + x * (col + 60);
      const width = stat.wide ? W - PAD * 2 : col;
      ctx.letterSpacing = '0px';
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = ink;
      ctx.font = `400 36px ${display}`;
      ctx.fillText(stat.label, left, y);
      ctx.globalAlpha = 1;
      ctx.fillStyle = paint(stat.colour, from, ink);
      /* A big number shrinks to fit its column; words are cut with an ellipsis. */
      let size = stat.big ? 120 : 58;
      const face = (px: number) => (stat.big ? `300 ${px}px ${numeric}` : `500 ${px}px ${display}`);
      ctx.font = face(size);
      ctx.letterSpacing = stat.big ? '-3px' : '-1px';
      while (stat.big && size > 64 && ctx.measureText(stat.value).width > width) {
        size -= 4;
        ctx.font = face(size);
      }
      ctx.fillText(fit(ctx, stat.value, width), left, y + (stat.big ? 130 : 78));
    });
    y += row.tall;
  }

  /* The name at the foot. */
  ctx.letterSpacing = '6px';
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = ink;
  ctx.font = `600 34px ${display}`;
  ctx.fillText('BASE', PAD, H - 110);
  ctx.globalAlpha = 1;

  return new Promise((resolve, reject) => {
    /* A JPEG: the glows make a PNG of this over a megabyte, a JPEG a fraction of it. */
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No picture'))), 'image/jpeg', 0.92);
  });
}

export type ShareOutcome = 'shared' | 'saved' | 'cancelled';

/**
 * Hands the picture to the share sheet on a touch device, and saves it
 * everywhere else (his call) — or wherever the sheet cannot take a file.
 */
export async function shareOrSave(blob: Blob, fileName: string, title: string): Promise<ShareOutcome> {
  const file = new File([blob], fileName, { type: blob.type });
  const touch = !window.matchMedia('(pointer: fine)').matches;
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled';
      /* Refused for another reason: save it instead. */
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'saved';
}
