/**
 * Colour from a cover (ideas 46 and 68, BIG-15's shared piece, born in
 * 29-1P8a2): the one colour a photo is "about", the way Spotify's player
 * takes an album's. Its first job is the glow behind a project's icon when
 * the project has a photo (idea 150); Focus takes it next (29-1P11).
 *
 * Pure: it is handed the pixels of a small copy of the picture and returns a
 * colour, so the choosing is tested. `useCoverColour.ts` does the decoding.
 *
 * NOT THE AVERAGE. The average of a photo is brown-grey. The colours are
 * sorted into twelve hue slices, each pixel weighted by how colourful it is
 * (a grey sky counts for nothing, a red door for a lot), and the heaviest
 * slice wins; the answer is that slice's own mean hue. A photo with almost no
 * colour in it answers `null`, and the caller shows grey.
 *
 * The lightness is NOT the photo's: every glow sits at the same lightness as
 * a made cover's (`coverGlow`, 0.68), and the chroma is held in a band, so a
 * dark photo still glows and a neon one does not shout.
 */

export interface Oklch {
  l: number;
  c: number;
  h: number;
}

const SLICES = 12;
/** Below this share of colourful weight per pixel, the picture is grey. */
const GREY_BELOW = 0.025;
export const GLOW_L = 0.68;
const C_MIN = 0.07;
const C_MAX = 0.17;

/** sRGB 0-255 → OKLab (Björn Ottosson's matrices). */
export function toOklab(r: number, g: number, b: number): [number, number, number] {
  const lin = (v: number) => {
    const x = v / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  const R = lin(r), G = lin(g), B = lin(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/**
 * The colour a picture is about, from its RGBA pixels (a copy a few dozen
 * pixels wide is plenty), or null for a grey one.
 */
export function mainColour(rgba: ArrayLike<number>): Oklch | null {
  return coverColours(rgba)?.[0] ?? null;
}

/** A second colour must be this far round the wheel from the first (two slices)… */
const SECOND_APART = 2;
/** …and carry at least this share of the first's weight, or the photo has one colour. */
const SECOND_SHARE = 0.2;

/**
 * The photo's two colours, for Focus's light (29-1P11c, which casts a cover's
 * two colours as a made cover has two inks): the main one, and the heaviest
 * slice at least 60° from it. A photo with only one colour in it answers
 * that colour twice. Null for a grey picture, as `mainColour`.
 */
export function coverColours(rgba: ArrayLike<number>): [Oklch, Oklch] | null {
  const weight = new Float64Array(SLICES);
  const sumA = new Float64Array(SLICES);
  const sumB = new Float64Array(SLICES);
  let pixels = 0;
  let total = 0;
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3] < 128) continue;
    pixels++;
    const [L, a, b] = toOklab(rgba[i], rgba[i + 1], rgba[i + 2]);
    const c = Math.hypot(a, b);
    /* Near-black and near-white carry no colour worth glowing, however saturated the maths says they are. */
    const w = c * (L < 0.15 || L > 0.97 ? 0.2 : 1);
    if (w <= 0) continue;
    const h = (Math.atan2(b, a) * 180) / Math.PI;
    const slice = Math.floor((((h % 360) + 360) % 360) / (360 / SLICES)) % SLICES;
    weight[slice] += w;
    sumA[slice] += a * w;
    sumB[slice] += b * w;
    total += w;
  }
  if (pixels === 0 || total / pixels < GREY_BELOW) return null;
  let best = 0;
  for (let s = 1; s < SLICES; s++) if (weight[s] > weight[best]) best = s;
  let second = -1;
  for (let s = 0; s < SLICES; s++) {
    const apart = Math.min(Math.abs(s - best), SLICES - Math.abs(s - best));
    if (apart < SECOND_APART || weight[s] < weight[best] * SECOND_SHARE) continue;
    if (second < 0 || weight[s] > weight[second]) second = s;
  }
  const first = sliceColour(sumA[best], sumB[best], weight[best]);
  return [first, second < 0 ? first : sliceColour(sumA[second], sumB[second], weight[second])];
}

/** A slice's own mean colour, at the glow lightness and inside the chroma band. */
function sliceColour(sumA: number, sumB: number, weight: number): Oklch {
  const a = sumA / weight;
  const b = sumB / weight;
  const h = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  const c = Math.min(C_MAX, Math.max(C_MIN, Math.hypot(a, b) * 1.15));
  return { l: GLOW_L, c: round(c, 3), h: round(h, 1) };
}

export function oklchCss({ l, c, h }: Oklch): string {
  return `oklch(${l} ${c} ${h})`;
}

/** The glow a grey (or not yet read) photo gets: the quiet grey of an icon at rest. */
export const GREY_GLOW = 'oklch(0.5 0.008 260)';

function round(v: number, places: number): number {
  const f = 10 ** places;
  return Math.round(v * f) / f;
}
