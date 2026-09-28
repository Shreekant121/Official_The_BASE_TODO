/**
 * The six hues a project can wear, and what a new project starts with.
 *
 * Moved out of `components/CreateProjectModal.tsx` at BUILD-3 so Atlas's
 * `create_project` paints a project exactly the way the New Project sheet
 * does. The tools run in Node under `mcp/`, which cannot import a component,
 * and a second copy of the table would drift the first time a hue changed.
 *
 * `token` is what the sheet's swatch paints with and `hex` is what gets
 * stored: the same colour twice, the hex being the sRGB form of the oklch
 * token (`src/ui/tokens/colors.css` spells that pairing out for emerald). The
 * store needs a real colour string — `project.color` is concatenated with an
 * alpha suffix and handed to gradients and to canvas all over the app, none of
 * which can take a `var(--…)`.
 */
export const PROJECT_HUES: { id: string; label: string; token: string; hex: string }[] = [
  { id: 'emerald', label: 'Emerald', token: 'var(--accent)', hex: '#10B981' },
  { id: 'cyan', label: 'Cyan', token: 'var(--hue-cyan)', hex: '#00A6C4' },
  { id: 'violet', label: 'Violet', token: 'var(--hue-violet)', hex: '#8C7BEC' },
  { id: 'amber', label: 'Amber', token: 'var(--hue-amber)', hex: '#D69A22' },
  { id: 'rose', label: 'Rose', token: 'var(--hue-rose)', hex: '#E4655F' },
  { id: 'grey', label: 'Grey', token: 'var(--hue-grey)', hex: '#A6A6AA' },
];

export const DEFAULT_PROJECT_COLOR = PROJECT_HUES[0].hex;

/** The glyph the New Project sheet opens on. */
export const DEFAULT_PROJECT_ICON = '🚀';
