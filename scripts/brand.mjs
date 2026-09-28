/**
 * Derives the app's served brand assets from the masters in
 * `public/brand/source/`. Run it after a design re-export overwrites
 * `public/brand/mark-white.png` — see `public/brand/README.md`.
 *
 *   node scripts/brand.mjs
 *
 * Five outputs, all from `base-mark-white.png`:
 *
 *   public/brand/mark-white.png    512x512, transparent  — the header/login/splash mark
 *   public/Logo.png                512x512, #050505 tile — the favicon
 *   public/brand/icon-192.png      192x192, #050505 tile — manifest icon, `purpose: any`
 *   public/brand/icon-512.png      512x512, #050505 tile — manifest icon, `purpose: any`
 *   public/brand/icon-maskable.png 512x512, #050505 tile — manifest icon, `purpose: maskable`
 *
 * **The glyph is not centred in its master and that is the whole reason this
 * file exists.** Measured on `base-mark-white.png` (1024x1024): the ink runs
 * `x 0..834`, `y 146..877` — margins L0 R189 T146 B146. It touches the left
 * edge. Drawn as-is beside the wordmark it sits visibly off-centre, so the ink
 * is translated to the middle of the canvas here. **The scale is untouched**
 * for the first four outputs: the glyph is moved, never resized, so what ships
 * is the size the master was drawn at, re-padded to L94 R94 T146 B146.
 * Symmetric on both axes, which is all "centred" has to mean for a mark that is
 * wider than it is tall.
 *
 * **The maskable icon is the one exception, and it is a separate composition
 * rather than a resize (APP-2).** Android hands the icon to the launcher, which
 * crops it to a circle, a squircle or a teardrop depending on which launcher it
 * is; only the centre 80% — a circle of diameter 0.8 x the tile — is guaranteed
 * to survive. So the glyph is scaled down until every opaque pixel of it fits
 * inside that circle, and the scale is *measured* rather than assumed: the
 * script finds the furthest opaque pixel from the ink's centre and works back
 * from it. The number it prints is the one to trust. APP-2 guessed "roughly
 * 70%"; the measurement is in `public/brand/README.md` beside the rest.
 *
 * The tile is `#050505`, not the master's pure `#000000` — that is `--void-0`
 * in `src/ui/tokens/colors.css`, the app's page floor, so the icon and the app
 * read as one black rather than two. The maskable tile is filled edge to edge
 * with it: whatever the launcher crops away has to be the brand's black, not
 * transparency, or the icon arrives with clipped corners on some phones and a
 * white ground on others.
 *
 * Playwright's Chromium does the raster work; it is already a devDependency
 * for `npm run shots` and nothing else here decodes a PNG.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MASTER = path.join(root, 'public/brand/source/base-mark-white.png');

/** The app's page floor — `--void-0`, `src/ui/tokens/colors.css`. */
const TILE_BG = '#050505';
/** Served size. Every call site sets explicit width/height, so this is only about file weight. */
const OUT = 512;
/**
 * The share of a maskable icon the launcher guarantees not to crop: a circle
 * of this diameter, centred. Every launcher shape (circle, squircle, teardrop,
 * rounded square) contains it. https://w3c.github.io/manifest/#purpose-member
 */
const MASKABLE_SAFE = 0.8;

const browser = await chromium.launch();
const page = await browser.newPage();

const master = `data:image/png;base64,${fs.readFileSync(MASTER).toString('base64')}`;

const { markPng, logoPng, icon192Png, icon512Png, maskablePng, ink, maskable } =
  await page.evaluate(
    async ({ src, bg, out, safe }) => {
      const img = new Image();
      img.src = src;
      await img.decode();

      // Measure the ink: the alpha bounding box of the glyph on the master.
      const probe = document.createElement('canvas');
      probe.width = img.width;
      probe.height = img.height;
      const pctx = probe.getContext('2d', { willReadFrequently: true });
      pctx.drawImage(img, 0, 0);
      const { data } = pctx.getImageData(0, 0, probe.width, probe.height);
      let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
      for (let y = 0; y < probe.height; y++) {
        for (let x = 0; x < probe.width; x++) {
          if (data[(y * probe.width + x) * 4 + 3] > 8) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      const w = maxX - minX + 1;
      const h = maxY - minY + 1;

      // Centre the ink on a canvas the size of the master. Translation only —
      // the glyph keeps the scale it was drawn at.
      const dx = Math.round((img.width - w) / 2) - minX;
      const dy = Math.round((img.height - h) / 2) - minY;

      const centred = document.createElement('canvas');
      centred.width = img.width;
      centred.height = img.height;
      centred.getContext('2d').drawImage(img, dx, dy);

      /*
       * How far the glyph actually reaches from its own centre. The bounding
       * box's corner is the wrong number to scale by — it is empty on a mark
       * shaped like this one, and scaling to fit the corner inside the safe
       * circle would shrink the icon for no reason. So every opaque pixel is
       * measured against the centre of the centred canvas and the largest
       * radius wins.
       */
      const cx = (img.width - 1) / 2;
      const cy = (img.height - 1) / 2;
      const cdata = centred
        .getContext('2d', { willReadFrequently: true })
        .getImageData(0, 0, img.width, img.height).data;
      let maxR = 0;
      for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) {
          if (cdata[(y * img.width + x) * 4 + 3] > 8) {
            const r = Math.hypot(x - cx, y - cy);
            if (r > maxR) maxR = r;
          }
        }
      }
      const shrink = ((safe / 2) * img.width) / maxR;

      /** Downscale in one high-quality step; optionally on a filled ground. */
      const emit = (ground, size, scale = 1) => {
        const c = document.createElement('canvas');
        c.width = size;
        c.height = size;
        const ctx = c.getContext('2d');
        if (ground) {
          ctx.fillStyle = ground;
          ctx.fillRect(0, 0, size, size);
        }
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        const drawn = size * scale;
        const off = (size - drawn) / 2;
        ctx.drawImage(centred, off, off, drawn, drawn);
        return c.toDataURL('image/png');
      };

      return {
        markPng: emit(null, out),
        logoPng: emit(bg, out),
        icon192Png: emit(bg, 192),
        icon512Png: emit(bg, 512),
        maskablePng: emit(bg, 512, shrink),
        ink: { minX, minY, maxX, maxY, w, h, dx, dy, canvas: img.width },
        maskable: {
          maxR: Math.round(maxR),
          shrink,
          inkWidthPct: Math.round(((w * shrink) / img.width) * 100),
        },
      };
    },
    { src: master, bg: TILE_BG, out: OUT, safe: MASKABLE_SAFE },
  );

await browser.close();

const write = (rel, dataUrl, size) => {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log(`  ${rel} — ${size}x${size}, ${fs.statSync(file).size} bytes`);
};

console.log(
  `base-mark-white.png ${ink.canvas}x${ink.canvas} — ink ${ink.w}x${ink.h} at ` +
    `x ${ink.minX}..${ink.maxX} y ${ink.minY}..${ink.maxY}; centred by ${ink.dx},${ink.dy}`,
);
console.log(
  `maskable — furthest ink ${maskable.maxR}px from centre, so the glyph is scaled to ` +
    `${(maskable.shrink * 100).toFixed(1)}% to sit inside the ` +
    `${MASKABLE_SAFE * 100}% safe circle; ink then spans ${maskable.inkWidthPct}% of the tile`,
);
write('public/brand/mark-white.png', markPng, OUT);
write('public/Logo.png', logoPng, OUT);
write('public/brand/icon-192.png', icon192Png, 192);
write('public/brand/icon-512.png', icon512Png, 512);
write('public/brand/icon-maskable.png', maskablePng, 512);
