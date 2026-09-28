/**
 * New / Edit project.
 * Mockup: the `NewProject` function in `design-system/screens/home.html`.
 *
 * Rebuilt on Aurora Glass. Two things genuinely changed for the user, and
 * both are deliberate:
 *
 *   - **The colour picker narrowed to the system's six hues plus a hex
 *     field.** The mockup's own note says why: ten saturated presets would
 *     out-shout emerald, which in this system is the one colour that means
 *     *live*. The hex field covers the real case the old picker existed for
 *     — a project that has to match an external brand — so no colour is
 *     unreachable, and one already saved outside the six loads straight
 *     into that field and round-trips untouched.
 *   - **The cover image moved out of the header.** It used to be a 160px
 *     banner across the top of the sheet; it is now a row inside the "Cover
 *     image" section — a 108×36 proof, the file name, and a remove button.
 *     The dashed target it replaces also accepts a dropped file now.
 *
 * The glyph picker did NOT narrow. The mockup hard-codes twelve emoji
 * against fake data; the real list is `PRESET_ICONS` plus whatever the
 * custom-icon registry holds, and an existing project's glyph has to
 * survive an edit. It keeps `AppIcon` for the same reason — a custom icon
 * is an image, not a character. What it takes from the mockup is the
 * shape: the grid grows out of the tile inside a well rather than floating
 * over the sheet as a popover.
 *
 * One departure from the mockup's own state model: it keeps the chosen hue
 * and the typed hex as two separate values and derives the swatch from
 * them. Here the hex field is bound straight to `color`, the single thing
 * that gets saved, so the field always reads back exactly what will be
 * stored — which is also what makes an existing custom colour appear in it
 * on open without any loading step.
 *
 * Unchanged underneath: `onSave`'s payload field for field, `compressImage`
 * on upload, `parseBulkLines` for batch mode, the reset-on-open pattern,
 * and `useOverlayDismiss` owning Escape. Batch mode still writes only name
 * + colour + icon — a description and a cover are inherently per-project,
 * so the sheet hides them rather than pretending they apply to ten
 * projects at once.
 */
import { useState, useRef } from 'react';
import type { ChangeEvent, CSSProperties, ReactNode } from 'react';
import { Button, Dialog, Icon, IconButton, Input, Textarea } from '../ui';
import { type Project } from '../store/useStore';
import { CUSTOM_ICONS } from '../lib/customIcons';
import { parseBulkLines } from '../lib/bulkAdd';
import { DEFAULT_PROJECT_COLOR, DEFAULT_PROJECT_ICON, PROJECT_HUES } from '../lib/projectHues';
import { useOverlayDismiss } from '../lib/useOverlayDismiss';
import { Z } from '../lib/zLayers';
import AppIcon from './AppIcon';

/**
 * The six hues, from the mockup's own `HUES` table. They live in
 * `lib/projectHues.ts` since BUILD-3, so a project Atlas creates is painted
 * from the same table as one made here.
 */
const HUES = PROJECT_HUES;

const DEFAULT_COLOR = DEFAULT_PROJECT_COLOR;

const PRESET_ICONS = [DEFAULT_PROJECT_ICON, '💡', '📋', '🎯', '⚡', '🌟', '🔥', '💎', '🧠', '🎨', '📊', '🛠️', '📌', '🏆', '🌈', '🎵'];

/** All pickable icons: built-in emoji plus anything registered in the custom-icon registry (see `src/lib/customIcons.ts`). */
const ALL_ICON_OPTIONS: string[] = [...PRESET_ICONS, ...CUSTOM_ICONS.map((c) => c.key)];

/** `#rrggbb`, the `#` optional — what the hex field accepts. */
const HEX_RE = /^#?[0-9a-f]{6}$/i;

const normalizeHex = (v: string) => {
  const t = v.trim();
  return t.startsWith('#') ? t : '#' + t;
};

/** The id of the hue this colour *is*, or `custom` when it is none of them. */
const hueOf = (color: string) =>
  HUES.find((h) => h.hex.toLowerCase() === color.trim().toLowerCase())?.id ?? 'custom';

async function compressImage(file: File, maxDim = 1200, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    img.src = url;
  });
}

/** A glyph and a label above a block — the mockup's `Section` helper. */
function Section({ icon, label, children }: { icon: 'palette' | 'image'; label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--sp-4)' }}>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 'var(--sp-3)',
          font: 'var(--type-kicker)',
          letterSpacing: 'var(--tracking-kicker)',
          textTransform: 'var(--kicker-transform)' as CSSProperties['textTransform'],
          color: 'var(--fg-3)',
        }}
      >
        <Icon name={icon} size={14} />
        {label}
      </span>
      {children}
    </div>
  );
}

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Omit<Project, 'id' | 'createdAt' | 'order'>) => void;
  project?: Project;
}

export default function CreateProjectModal({ isOpen, onClose, onSave, project }: CreateProjectModalProps) {
  const [name, setName] = useState(project?.name ?? '');
  const [description, setDescription] = useState(project?.description ?? '');
  const [color, setColor] = useState(project?.color ?? DEFAULT_COLOR);
  const [icon, setIcon] = useState(project?.icon ?? '🚀');
  const [imageUrl, setImageUrl] = useState(project?.imageUrl ?? '');
  const [imageName, setImageName] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkNames, setBulkNames] = useState('');
  const [dropping, setDropping] = useState(false);

  const imageInputRef = useRef<HTMLInputElement>(null);

  useOverlayDismiss(isOpen, onClose);

  /**
   * The "New Project" modal instance is kept permanently mounted by `Home`
   * (only its `isOpen` prop toggles, so the sheet can play its exit) — so
   * without this, the field `useState` initializers only ever ran once on
   * the very first mount, and every subsequent open of the modal silently
   * reused whatever name/description/color/icon/image was left over from
   * the previous project. Re-sync from `project` (or blank defaults for
   * "create" mode) every time the modal opens.
   *
   * Done as a render-time adjustment (comparing against the previous `isOpen`
   * seen so far) rather than a `useEffect`, per React's guidance on syncing
   * state from a changing prop — it resets in the same render/commit instead
   * of flashing the stale fields for one extra paint and triggering a second
   * render pass.
   */
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      setName(project?.name ?? '');
      setDescription(project?.description ?? '');
      setColor(project?.color ?? DEFAULT_COLOR);
      setIcon(project?.icon ?? '🚀');
      setImageUrl(project?.imageUrl ?? '');
      setImageName('');
      setShowIconPicker(false);
      setBulkMode(false);
      setBulkNames('');
      setDropping(false);
    }
  }

  /** Shared by the file input and the drop target. */
  const readFile = async (file: File | undefined) => {
    if (!file || !file.type.startsWith('image/')) return;
    setIsUploading(true);
    try {
      const compressed = await compressImage(file);
      setImageUrl(compressed);
      setImageName(file.name);
    } catch {
      // ignore
    } finally {
      setIsUploading(false);
    }
  };

  const handleImageUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    await readFile(file);
  };

  const bulkNameLines = parseBulkLines(bulkNames);
  const valid = bulkMode ? bulkNameLines.length > 0 : name.trim().length > 0;

  const hue = hueOf(color);
  const hexValid = HEX_RE.test(color);

  const handleSave = () => {
    if (!valid) return;
    if (bulkMode) {
      // Shared accent color + icon across every project created; no
      // description/cover image since those are inherently per-project.
      bulkNameLines.forEach((line) => onSave({ name: line, color, icon }));
      onClose();
      return;
    }
    onSave({
      name: name.trim(),
      description: description.trim() || undefined,
      color,
      icon,
      imageUrl: imageUrl || undefined,
    });
    onClose();
  };

  const title = project ? 'Edit project' : bulkMode ? 'New projects' : 'New project';
  const blurb = project
    ? 'Changes show up everywhere this project appears.'
    : bulkMode
      ? 'One name per line. Lists and tasks come after.'
      : 'Name it now. Lists and tasks come after.';

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      width={560}
      label={title}
      /* Escape is `useOverlayDismiss`'s above, which answers only for the
         topmost overlay. See Dialog's port note 2. */
      closeOnEscape={false}
      zIndex={Z.modal}
      style={{ gap: 0, padding: 0, gridTemplateColumns: 'minmax(0, 1fr)' }}
    >
      <div
        className="ag-scroll"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr)',
          gap: 'var(--sp-8)',
          padding: 'var(--pad-sheet)',
          minWidth: 0,
          boxSizing: 'border-box',
          maxHeight: '84vh',
          overflowY: 'auto',
          overscrollBehavior: 'contain',
        }}
      >
        <header style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-5)' }}>
          <div style={{ display: 'grid', gap: 'var(--sp-3)', flex: 1, minWidth: 0 }}>
            <h2
              style={{
                font: 'var(--type-title)',
                fontSize: 'var(--text-2xl)',
                letterSpacing: 'var(--tracking-title)',
                color: 'var(--fg-1)',
              }}
            >
              {title}
            </h2>
            <p style={{ font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-3)' }}>{blurb}</p>
          </div>
          <IconButton label="Close" variant="ghost" onClick={onClose}>
            <Icon name="x" size={18} />
          </IconButton>
        </header>

        {/* Batch mode: the same sheet, one name per line. A separate "bulk
            add" screen would duplicate every other field here. Not offered
            while editing — there is exactly one project to rename. */}
        {!project && (
          <button
            type="button"
            onClick={() => setBulkMode((v) => !v)}
            aria-pressed={bulkMode}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--sp-3)',
              justifySelf: 'start',
              height: 34,
              padding: '0 var(--sp-5)',
              border: 0,
              cursor: 'pointer',
              borderRadius: 'var(--r-pill)',
              background: bulkMode ? 'var(--glass-tint-accent)' : 'var(--glass-fill-1)',
              boxShadow: bulkMode ? 'var(--glass-rim-2), var(--glow-accent-sm)' : 'var(--glass-rim-1)',
              color: bulkMode ? 'oklch(0.93 0.07 162)' : 'var(--fg-3)',
              font: 'var(--type-label)',
              fontSize: 'var(--text-sm)',
              transition: 'var(--t-hover)',
            }}
          >
            <Icon name="layers" size={15} />
            Add multiple at once
          </button>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--sp-5)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)' }}>
            <button
              type="button"
              onClick={() => setShowIconPicker((v) => !v)}
              aria-label="Choose project glyph"
              aria-expanded={showIconPicker}
              style={{
                flex: '0 0 auto',
                display: 'grid',
                placeItems: 'center',
                width: 48,
                height: 48,
                border: 0,
                cursor: 'pointer',
                borderRadius: 'var(--r-md)',
                backgroundImage: 'var(--glass-fill-3)',
                boxShadow: showIconPicker
                  ? 'var(--glass-rim-2), 0 0 0 1px var(--accent-hairline)'
                  : 'var(--glass-rim-2), var(--glass-cast-2)',
                transition: 'var(--t-hover)',
              }}
            >
              <AppIcon icon={icon} size={23} />
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              {bulkMode ? (
                <Textarea
                  autoFocus
                  rows={4}
                  value={bulkNames}
                  onChange={(e) => setBulkNames(e.target.value)}
                  aria-label="Project names, one per line"
                  placeholder={'One project per line\nStudio Launch\nQ3 Filings'}
                />
              ) : (
                <Input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSave();
                  }}
                  placeholder="Project name"
                  aria-label="Project name"
                />
              )}
            </div>
          </div>

          {/* Grows out of the tile instead of floating over the sheet. It
              scrolls: the registry can hold more glyphs than the mockup's
              twelve, and a sheet that grows a third taller when you open a
              picker is worse than one that scrolls inside it. */}
          {showIconPicker && (
            <div
              className="ag-scroll"
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 'var(--sp-3)',
                padding: 'var(--sp-4)',
                maxHeight: 200,
                overflowY: 'auto',
                overscrollBehavior: 'contain',
                borderRadius: 'var(--r-lg)',
                backgroundImage: 'var(--glass-well)',
                boxShadow: 'var(--glass-well-shadow)',
                animation: 'var(--kf-condense) var(--dur-base) var(--ease-morph) both',
              }}
            >
              {ALL_ICON_OPTIONS.map((em) => (
                <button
                  key={em}
                  type="button"
                  onClick={() => {
                    setIcon(em);
                    setShowIconPicker(false);
                  }}
                  aria-label={`Glyph ${em}`}
                  aria-pressed={em === icon}
                  style={{
                    display: 'grid',
                    placeItems: 'center',
                    width: 40,
                    height: 40,
                    border: 0,
                    cursor: 'pointer',
                    borderRadius: 'var(--r-sm)',
                    background: em === icon ? 'var(--glass-fill-3)' : 'transparent',
                    boxShadow: em === icon ? 'var(--glass-rim-2)' : 'none',
                    transition: 'var(--t-hover)',
                  }}
                >
                  <AppIcon icon={em} size={19} />
                </button>
              ))}
            </div>
          )}

          {bulkMode ? (
            <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)' }}>
              Every project gets the glyph and accent colour above. Descriptions and covers are
              per project — add those once the projects exist.
            </span>
          ) : (
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              aria-label="Short description"
              placeholder="Short description — what has to be true when it's done. (optional)"
            />
          )}
        </div>

        <Section icon="palette" label="Accent colour">
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--sp-4)' }}>
            {HUES.map((h) => {
              const on = hue === h.id;
              return (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => setColor(h.hex)}
                  aria-label={h.label}
                  aria-pressed={on}
                  style={{
                    width: 30,
                    height: 30,
                    padding: 0,
                    border: 0,
                    cursor: 'pointer',
                    borderRadius: '50%',
                    background: h.token,
                    boxShadow: on
                      ? `inset 0 1px 0 oklch(1 0 0 / 0.35), 0 0 0 2px var(--void-0), 0 0 0 4px ${h.token}`
                      : 'inset 0 1px 0 oklch(1 0 0 / 0.35), 0 1px 4px oklch(0 0 0 / 0.5)',
                    transform: on ? 'scale(1)' : 'scale(0.94)',
                    transition: 'var(--t-hover)',
                  }}
                />
              );
            })}
            <span style={{ width: 1, height: 22, background: 'var(--line-soft)' }} />
            {/* The one real case the ten-preset picker existed for: a project
                that has to match an external brand. Typing here IS choosing
                custom — there is no separate swatch to arm first. */}
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 'var(--sp-3)',
                height: 34,
                padding: '0 var(--sp-4) 0 var(--sp-3)',
                borderRadius: 'var(--r-pill)',
                backgroundImage: 'var(--glass-well)',
                boxShadow:
                  hue === 'custom' && hexValid
                    ? 'var(--glass-well-shadow), 0 0 0 1px var(--line-strong)'
                    : 'var(--glass-well-shadow), 0 0 0 1px var(--line-faint)',
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  background: hexValid ? normalizeHex(color) : 'var(--void-3)',
                  boxShadow: 'inset 0 1px 0 oklch(1 0 0 / 0.3)',
                }}
              />
              <input
                className="ag-field"
                data-ag-field=""
                value={color}
                onChange={(e) => setColor(e.target.value)}
                onBlur={() => {
                  if (hexValid) setColor(normalizeHex(color));
                }}
                placeholder="#hex"
                aria-label="Custom accent hex"
                maxLength={7}
                spellCheck={false}
                style={{
                  width: 74,
                  border: 0,
                  outline: 'none',
                  background: 'transparent',
                  color: 'var(--fg-1)',
                  font: 'var(--type-numeric)',
                  fontSize: 'var(--text-xs)',
                  textTransform: 'lowercase',
                }}
              />
            </label>
          </div>
        </Section>

        {/* Cover image — per-project, hidden in bulk mode. */}
        {!bulkMode && (
          <Section icon="image" label="Cover image">
            {imageUrl ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--sp-5)',
                  padding: 'var(--sp-4)',
                  borderRadius: 'var(--r-lg)',
                  backgroundImage: 'var(--glass-fill-1)',
                  boxShadow: 'var(--glass-rim-1)',
                }}
              >
                {/* The preview is undimmed because the cover it previews is
                    (FIX-3). It carried its own slightly different filter,
                    `brightness(0.85)`, which made this thumbnail lie about the
                    picture twice over once the real covers went full colour. */}
                <img
                  src={imageUrl}
                  alt=""
                  style={{
                    /* The card's 12:7 in miniature, so a 1200×700
                       picture previews uncropped. */
                    width: 62,
                    height: 36,
                    objectFit: 'cover',
                    borderRadius: 'var(--r-sm)',
                    flex: '0 0 auto',
                  }}
                />
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    font: 'var(--type-caption)',
                    color: 'var(--fg-2)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {/* A cover loaded off an existing project has no file name
                      to show — it was a data URL by the time it was saved. */}
                  {imageName || 'Cover image'}
                </span>
                <IconButton
                  label="Remove cover"
                  variant="ghost"
                  onClick={() => {
                    setImageUrl('');
                    setImageName('');
                  }}
                >
                  <Icon name="x" size={16} />
                </IconButton>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                disabled={isUploading}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDropping(true);
                }}
                onDragLeave={() => setDropping(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDropping(false);
                  void readFile(e.dataTransfer.files[0]);
                }}
                style={{
                  display: 'grid',
                  placeItems: 'center',
                  gap: 'var(--sp-3)',
                  width: '100%',
                  minHeight: 88,
                  padding: 'var(--sp-6)',
                  cursor: isUploading ? 'default' : 'pointer',
                  borderRadius: 'var(--r-lg)',
                  border: `1px dashed ${dropping ? 'var(--accent-hairline)' : 'var(--line-strong)'}`,
                  background: dropping ? 'var(--accent-wash)' : 'transparent',
                  color: dropping ? 'var(--fg-1)' : 'var(--fg-3)',
                  font: 'var(--type-label)',
                  transition: 'var(--t-hover)',
                }}
              >
                <Icon name="image-up" size={20} />
                {isUploading ? 'Compressing…' : 'Upload cover image'}
              </button>
            )}
            <input ref={imageInputRef} type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
            <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)' }}>
              {/* Home's project card is `PROJECT_COVER_RATIO`, so a picture
                  this size fills it exactly; the project page's slim header
                  shows it whole with blurred sides. 1200 wide because upload
                  scales anything larger down to 1200 (`compressImage`). */}
              1200×700 fits the project card exactly. Under 5 MB.
            </span>
          </Section>
        )}

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--sp-4)',
            paddingTop: 'var(--sp-5)',
            borderTop: '1px solid var(--line-faint)',
          }}
        >
          {bulkMode && (
            <span
              style={{
                font: 'var(--type-numeric)',
                fontSize: 'var(--text-xs)',
                color: 'var(--fg-3)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {bulkNameLines.length} queued
            </span>
          )}
          <span style={{ flex: 1 }} />
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="gel"
            disabled={!valid}
            onClick={handleSave}
            iconLeft={<Icon name={project ? 'check' : 'plus'} size={16} />}
          >
            {project
              ? 'Save changes'
              : bulkMode && bulkNameLines.length > 1
                ? `Create ${bulkNameLines.length} projects`
                : 'Create project'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
