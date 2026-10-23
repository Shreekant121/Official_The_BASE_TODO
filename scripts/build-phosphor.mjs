/*
 * Writes `src/ui/core/phosphor.generated.ts` — the V3 icon set (V3-1).
 *
 *   node scripts/build-phosphor.mjs      (npm run build:icons)
 *
 * WHY A GENERATED FILE AND NOT `@phosphor-icons/react`
 * ---------------------------------------------------
 * The v4 design swaps Lucide's hairline strokes for Phosphor's solid glyphs
 * (`design-system/readme.md`, "Iconography"; `components/core/Icon.jsx`). The
 * React package ships every icon as a component carrying all SIX weights, and
 * `<Icon name="…" />` addresses glyphs by string, so it has to import every
 * one it might draw: ~150 icons x 6 weights, most of which nothing ever shows,
 * precached onto the tablet by the service worker. V3 uses exactly one weight
 * per glyph — `fill`, or `bold` for the small marks (x, check, chevrons, plus,
 * arrows) — so this script lifts that one weight's path data out of
 * `@phosphor-icons/core`'s SVGs and nothing else. `@phosphor-icons/core` is a
 * devDependency: nothing at runtime imports it.
 *
 * THE MAP IS THE DESIGN'S OWN, EXTENDED
 * -------------------------------------
 * Keys are the app's Lucide names — the keys of `REGISTRY` in `Icon.tsx` — so
 * a V3 screen asks for the same name an old screen does and gets the other
 * set. `DESIGN` below is `Icon.jsx`'s `MAP`, verbatim, for every name the app
 * uses; `OURS` covers the app's names that map does not, picked the same way
 * (the nearest Phosphor noun, never a different idea). A name in neither is
 * reported and draws its Lucide glyph, which is also what the design does with
 * an unmapped name. `BOLD` is `Icon.jsx`'s list plus the same kinds of mark.
 *
 * Re-run after adding a glyph to `REGISTRY`; the script says which names have
 * no Phosphor twin yet.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = join(ROOT, 'node_modules', '@phosphor-icons', 'core', 'assets');
const OUT = join(ROOT, 'src', 'ui', 'core', 'phosphor.generated.ts');

/* design-system/components/core/Icon.jsx, `MAP` — the entries the app uses. */
const DESIGN = {
  'square-pen': 'note-pencil', 'pencil': 'pencil-simple', 'chevron-right': 'caret-right',
  'chevron-left': 'caret-left', 'chevron-down': 'caret-down', 'chevron-up': 'caret-up',
  'share-2': 'share-network', 'ellipsis': 'dots-three', 'more-horizontal': 'dots-three',
  'plus': 'plus', 'minus': 'minus', 'x': 'x', 'check': 'check', 'check-check': 'checks',
  'corner-down-right': 'arrow-elbow-down-right', 'zap': 'lightning', 'list-checks': 'list-checks',
  'list': 'list', 'git-branch': 'git-branch', 'triangle-alert': 'warning',
  'circle-alert': 'warning-circle', 'info': 'info', 'keyboard': 'keyboard',
  'arrow-right': 'arrow-right', 'arrow-left': 'arrow-left', 'arrow-up': 'arrow-up',
  'arrow-down': 'arrow-down', 'arrow-up-right': 'arrow-up-right',
  'layout-dashboard': 'squares-four', 'layers': 'stack', 'image-up': 'image', 'image': 'image',
  'search': 'magnifying-glass', 'user': 'user', 'users': 'users', 'refresh-cw': 'arrows-clockwise',
  'rotate-ccw': 'arrow-counter-clockwise', 'undo-2': 'arrow-u-up-left', 'log-out': 'sign-out',
  'power': 'power', 'trash-2': 'trash', 'clock': 'clock', 'timer': 'timer', 'hourglass': 'hourglass',
  'calendar': 'calendar-blank', 'calendar-clock': 'calendar-dots', 'bell': 'bell',
  'bell-ring': 'bell-ringing', 'bell-off': 'bell-slash', 'settings': 'gear-six',
  'settings-2': 'sliders-horizontal', 'sliders-horizontal': 'sliders-horizontal',
  'mic': 'microphone', 'mic-off': 'microphone-slash', 'play': 'play', 'pause': 'pause',
  'square': 'stop', 'sparkles': 'sparkle', 'send': 'paper-plane-tilt', 'link': 'link',
  'link-2': 'link', 'copy': 'copy', 'mail': 'envelope-simple', 'inbox': 'tray', 'star': 'star',
  'tag': 'tag', 'target': 'target', 'flame': 'fire', 'bar-chart-3': 'chart-bar',
  'folder': 'folder', 'folder-open': 'folder-open', 'file-text': 'file-text', 'lock': 'lock',
  'shield-check': 'shield-check', 'eye': 'eye', 'eye-off': 'eye-slash', 'filter': 'funnel',
  'grip-vertical': 'dots-six-vertical', 'move': 'arrows-out-cardinal',
  'external-link': 'arrow-square-out', 'globe': 'globe', 'home': 'house', 'house': 'house',
  'book-open': 'book-open', 'brain': 'brain', 'cpu': 'cpu', 'server': 'hard-drives',
  'database': 'database', 'volume-2': 'speaker-high', 'volume-x': 'speaker-x', 'circle': 'circle',
  'circle-check': 'check-circle', 'x-circle': 'x-circle', 'circle-dot': 'record',
  'scroll-text': 'scroll', 'at-sign': 'at', 'moon': 'moon', 'panel-left': 'sidebar',
  'columns-3': 'columns', 'repeat': 'repeat', 'skip-forward': 'skip-forward', 'eraser': 'eraser',
  'smartphone': 'device-mobile', 'laptop': 'laptop', 'tablet': 'device-tablet',
};

/* The app's names that `MAP` does not cover. */
const OURS = {
  'alarm-clock': 'alarm', 'archive': 'archive', 'archive-restore': 'box-arrow-up', 'library': 'books',
  'activity': 'pulse', 'align-left': 'text-align-left',
  /* 29-1P14d1 (idea 114): back online, every change synced. */
  'cloud-check': 'cloud-check',
  /* 29-1P7c (idea 159): the three densities. */
  'rows-2': 'rows', 'align-justify': 'text-align-justify', 'equal': 'equals',
  'arrow-down-left': 'arrow-down-left', 'arrow-down-right': 'arrow-down-right',
  'arrow-down-up': 'arrows-down-up', 'arrow-down-wide-narrow': 'sort-descending',
  'arrow-up-left': 'arrow-up-left', 'award': 'medal', 'badge-check': 'seal-check',
  'battery-charging': 'battery-charging', 'battery-low': 'battery-low', 'calculator': 'calculator',
  'calendar-plus': 'calendar-plus', 'calendar-x': 'calendar-x', 'check-circle-2': 'check-circle',
  'check-square': 'check-square', 'square-check-big': 'check-square', 'cloud-off': 'cloud-slash',
  'corner-down-left': 'arrow-elbow-down-left', 'corner-up-left': 'arrow-elbow-up-left',
  'edit-2': 'pencil-simple', 'flag-triangle-right': 'flag-pennant', 'folder-kanban': 'kanban',
  'folder-plus': 'folder-plus', 'grid-2x2': 'grid-four', 'hand': 'hand', 'hard-drive': 'hard-drive',
  'indian-rupee': 'currency-inr', 'key-round': 'key', 'list-tree': 'tree-structure',
  'loader': 'spinner', 'loader-2': 'spinner-gap', 'message-square-plus': 'chat-circle-dots',
  'palette': 'palette', 'map-pin': 'map-pin', 'panel-right-open': 'sidebar-simple', 'panel-top': 'browser', 'pin': 'push-pin',
  'pipette': 'eyedropper', 'plus-circle': 'plus-circle', 'qr-code': 'qr-code',
  'rotate-cw': 'arrow-clockwise', 'scaling': 'resize', 'scissors': 'scissors',
  'search-x': 'magnifying-glass-minus', 'shield-alert': 'shield-warning', 'sigma': 'sigma',
  'sliders': 'sliders', 'stethoscope': 'stethoscope', 'text': 'text-t', 'unlink': 'link-break',
  'user-circle': 'user-circle', 'wifi-off': 'wifi-slash', 'wind': 'wind', 'wrench': 'wrench',
  /* 29-1P8a (idea 149): Shuffle a project's cover. */
  'shuffle': 'shuffle',
};

/* `Icon.jsx`'s BOLD list, plus the marks of the same kind the app also draws. */
const BOLD = new Set([
  'x', 'check', 'plus', 'minus', 'chevron-right', 'chevron-left', 'chevron-down', 'chevron-up',
  'arrow-right', 'arrow-left', 'arrow-up', 'arrow-down', 'arrow-up-right', 'corner-down-right',
  'ellipsis', 'search', 'external-link',
  'arrow-down-left', 'arrow-down-right', 'arrow-up-left', 'corner-down-left', 'corner-up-left',
  'more-horizontal', 'search-x',
  /* 29-1P8a: Shuffle on a project's cover — two crossing arrows, a mark. */
  'shuffle',
  /* The drag grip, like the ellipsis: `dots-six-vertical-fill` is a grey tile
     with the dots cut out of it, and he asked (V3-6) for bare dots, no tile. */
  'grip-vertical',
]);

const iconSource = readFileSync(join(ROOT, 'src', 'ui', 'core', 'Icon.tsx'), 'utf8');
const registry = iconSource.slice(iconSource.indexOf('const REGISTRY'), iconSource.indexOf('satisfies Record'));
const names = [...registry.matchAll(/^\s*'([a-z0-9-]+)':/gm)].map((m) => m[1]);

const out = {};
const unmapped = [];
for (const name of names) {
  const ph = DESIGN[name] ?? OURS[name];
  if (!ph) { unmapped.push(name); continue; }
  const weight = BOLD.has(name) ? 'bold' : 'fill';
  const file = join(ASSETS, weight, `${ph}-${weight}.svg`);
  if (!existsSync(file)) throw new Error(`[build-phosphor] ${name} → ${ph}: no ${weight} glyph at ${file}`);
  const svg = readFileSync(file, 'utf8');
  const inner = svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  const paths = [...inner.matchAll(/<path d="([^"]+)"\/>/g)].map((m) => m[1]);
  if (paths.join('') === '' || inner.replace(/<path d="[^"]+"\/>/g, '') !== '') {
    throw new Error(`[build-phosphor] ${ph}-${weight}.svg holds something other than <path d>: ${inner.slice(0, 120)}`);
  }
  out[name] = paths;
}

const body = Object.entries(out)
  .map(([k, v]) => `  '${k}': ${JSON.stringify(v)},`)
  .join('\n');
writeFileSync(
  OUT,
  `/* GENERATED by scripts/build-phosphor.mjs (npm run build:icons) — do not edit by hand.
   The V3 icon set: one Phosphor weight per glyph, keyed by the app's Lucide
   names. Path data is Phosphor's (MIT, @phosphor-icons/core), in its 256-unit
   viewBox. See the script's header for why this is not @phosphor-icons/react. */
export const PHOSPHOR: Readonly<Record<string, readonly string[]>> = {
${body}
};
`,
);
console.log(`[build-phosphor] ${Object.keys(out).length} glyphs written; ${unmapped.length} fall back to Lucide${unmapped.length ? ': ' + unmapped.join(', ') : ''}`);
