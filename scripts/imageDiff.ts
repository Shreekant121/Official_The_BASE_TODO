/**
 * Image comparison for the screenshot harness.
 *
 * ── Why this is not a byte comparison ────────────────────────────────────────
 *
 * Chromium rasterises `backdrop-filter` layers at very slightly different
 * sub-pixel offsets from one run to the next, and this app is built out of
 * them, so every 1px border and every glyph sitting on a glass surface flips
 * contrast somewhere in the frame. It is measurable and it is not fixable from
 * here: `/project/p-empire`, whose task rows are plain translucent black, comes
 * back byte-identical every single run, while `/` and `/scoring`, which are
 * glass wall to wall, never do. (Freezing the clock removed the *animation*
 * half of the drift and dropped the numbers by an order of magnitude; this is
 * the half that is left. Chromium's deterministic-rendering flags, forced
 * software rasterisation and repeated warm-up paints were all tried; none of
 * them closes it.)
 *
 * ── Why it is not a plain tolerance either ───────────────────────────────────
 *
 * Counting pixels over a tolerance does not separate the two populations. On a
 * half-resolution comparison the rendering noise runs to a couple of thousand
 * cells, while genuinely moving the whole floating nav by four pixels — the
 * kind of regression this harness exists to catch — moves only a few hundred.
 * Any threshold that ignores the first also ignores the second.
 *
 * What *does* separate them is shape. Rendering noise is speckle: isolated
 * cells scattered along edges. A real change is a solid region — a band where
 * something moved, a block where something appeared. So the mask of changed
 * cells is eroded, keeping only cells whose neighbourhood also changed, and the
 * survivors are counted. Speckle erodes to nothing; a moved control does not.
 */
import type { Browser, Page } from 'playwright';

/**
 * Comparison runs at half resolution: fine enough that a few-pixel shift still
 * lights up several cells, coarse enough to average away sub-pixel edge noise
 * before the erosion pass ever sees it.
 */
const SCALE = 2;

/** Per-channel difference, 0–255, above which a cell counts as changed. */
const CHANNEL_TOLERANCE = 20;

/**
 * How many of a changed cell's eight neighbours must also have changed for it
 * to survive erosion. Five is comfortably more than a speckle or a one-cell
 * diagonal thread ever manages, and comfortably less than any edge of a solid
 * region.
 */
const NEIGHBOURS_REQUIRED = 5;

export interface Comparison {
  /** Changed cells left after erosion — the number that decides pass or fail. */
  clustered: number;
  /** Changed cells before erosion, reported only to make a borderline case legible. */
  raw: number;
  /** Surviving cells in magenta over a dimmed copy of the new capture. */
  diffPng: Buffer;
}

/**
 * Compares two PNGs inside a page of the browser the harness already has open,
 * rather than adding an image-decoding dependency to do it. Chromium decodes
 * PNG, scales it and hands back pixels; that is the whole job.
 */
export class Comparator {
  private constructor(private readonly page: Page) {}

  static async create(browser: Browser): Promise<Comparator> {
    const page = await browser.newPage();
    // `tsx` compiles these files with esbuild's `keepNames`, which rewrites
    // named inner functions as `__name(fn, "fn")` — including inside the
    // callback handed to `page.evaluate`, where that helper does not exist.
    // Passed as a string so it reaches the page uncompiled.
    await page.evaluate('globalThis.__name ??= (fn) => fn');
    return new Comparator(page);
  }

  async compare(baseline: Buffer, current: Buffer): Promise<Comparison> {
    const result = await this.page.evaluate(
      async ({ a, b, scale, tolerance, neighbours }) => {
        const load = (data: string) =>
          new Promise<HTMLImageElement>((resolve) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.src = `data:image/png;base64,${data}`;
          });

        const [before, after] = await Promise.all([load(a), load(b)]);
        const width = Math.ceil(after.width / scale);
        const height = Math.ceil(after.height / scale);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        const sample = (image: HTMLImageElement) => {
          ctx.clearRect(0, 0, width, height);
          ctx.drawImage(image, 0, 0, width, height);
          return ctx.getImageData(0, 0, width, height).data;
        };
        const da = sample(before);
        const db = sample(after);

        const changed = new Uint8Array(width * height);
        let raw = 0;
        for (let cell = 0; cell < changed.length; cell++) {
          const p = cell * 4;
          const delta = Math.max(
            Math.abs(da[p] - db[p]),
            Math.abs(da[p + 1] - db[p + 1]),
            Math.abs(da[p + 2] - db[p + 2]),
          );
          if (delta > tolerance) {
            changed[cell] = 1;
            raw++;
          }
        }

        // Erosion: drop every changed cell whose neighbourhood is mostly
        // unchanged. This is what separates scattered rasterisation noise from
        // a region that genuinely moved.
        const out = ctx.createImageData(width, height);
        let clustered = 0;
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const cell = y * width + x;
            const p = cell * 4;
            let survives = false;

            if (changed[cell] === 1) {
              let count = 0;
              for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                  if (dx === 0 && dy === 0) continue;
                  const nx = x + dx;
                  const ny = y + dy;
                  if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
                  count += changed[ny * width + nx];
                }
              }
              survives = count >= neighbours;
            }

            if (survives) {
              clustered++;
              out.data[p] = 255;
              out.data[p + 1] = 0;
              out.data[p + 2] = 255;
            } else {
              out.data[p] = db[p] * 0.3;
              out.data[p + 1] = db[p + 1] * 0.3;
              out.data[p + 2] = db[p + 2] * 0.3;
            }
            out.data[p + 3] = 255;
          }
        }
        ctx.putImageData(out, 0, 0);

        return { clustered, raw, dataUrl: canvas.toDataURL('image/png') };
      },
      {
        a: baseline.toString('base64'),
        b: current.toString('base64'),
        scale: SCALE,
        tolerance: CHANNEL_TOLERANCE,
        neighbours: NEIGHBOURS_REQUIRED,
      },
    );

    return {
      clustered: result.clustered,
      raw: result.raw,
      diffPng: Buffer.from(result.dataUrl.split(',')[1], 'base64'),
    };
  }
}
