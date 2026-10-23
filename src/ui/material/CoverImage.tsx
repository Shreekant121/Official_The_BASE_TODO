import { useCoverSrc } from '../../lib/covers/coverCache';

/**
 * A cover photograph shown WHOLE inside a fixed box (FIX-9).
 *
 * Every cover in the app used to be `object-fit: cover` in a box of a fixed
 * height — 156px on a project card, 116px on the masthead, 144px on a task
 * card — which is what cropped his pictures: the design draws covers at 3:1,
 * and anything taller loses its top and bottom. Shreekant's call on
 * 2026-09-22, chosen over letting the card grow to the image's own shape:
 * **the box keeps its height and the whole image fits inside it**, with the
 * leftover sides filled by a blurred copy of the same picture, so a portrait
 * photo on a wide card reads as a photo and not as a letterbox.
 *
 * The fill is a second `<img>`, not a CSS background: `filter: blur()` cannot
 * reach a background layer, and a React `background` shorthand clears
 * `background-image` on re-render. It is scaled up a touch so the blur's
 * transparent edge falls outside the box. Full colour on both layers — FIX-3,
 * see `ProjectCard.tsx`; do not reinstate a dimming filter on the fill either.
 *
 * The parent owns the box (height, radius, `overflow: hidden`); this fills it.
 *
 * `src` may be a `cover:` pointer — covers are their own documents now
 * (`lib/covers/`) — and is resolved here, so every caller passes `imageUrl`
 * as it is. Until the picture lands the box stays empty rather than broken.
 */
/**
 * The shape of a project card's cover on Home — 1200×700, Shreekant's number
 * (2026-09-23), so a cover he designs at that size fills the card exactly.
 * Until then the card had a fixed 156px height and took the grid's width, so
 * its shape drifted from 2.1:1 to 2.6:1 with the screen (measured).
 *
 * NOT the project page's header. That was 3:1 for one commit (`27e26fe`) and
 * he found it too big; it is back to its 116px strip, where the same picture
 * shows whole with blurred sides. The hint in `CreateProjectModal` and its
 * preview thumbnail name this ratio; change the three together.
 */
export const PROJECT_COVER_RATIO = '12 / 7';

export interface CoverImageProps {
  src: string;
  /**
   * `'crop'` fills the box and cuts what does not fit, centred — the old
   * `object-fit: cover`, no blurred fill. Only the project page's 116px strip
   * uses it (Shreekant, 2026-09-23): shrunk to fit a 1200×700 picture was a
   * postage stamp in a band of blur. Everything else shows the whole picture.
   */
  fit?: 'whole' | 'crop';
}

export function CoverImage({ src: imageUrl, fit = 'whole' }: CoverImageProps) {
  const src = useCoverSrc(imageUrl);
  if (!src) return null;
  if (fit === 'crop') {
    return (
      <img
        src={src}
        alt=""
        draggable={false}
        style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          objectFit: 'cover', objectPosition: 'center', display: 'block',
        }}
      />
    );
  }
  return (
    <>
      <img
        src={src}
        alt=""
        aria-hidden="true"
        draggable={false}
        style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          objectFit: 'cover', display: 'block',
          filter: 'blur(18px)', transform: 'scale(1.15)',
        }}
      />
      <img
        src={src}
        alt=""
        draggable={false}
        style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          objectFit: 'contain', display: 'block',
        }}
      />
    </>
  );
}
