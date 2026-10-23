/**
 * New / Edit project.
 * Mockup: the `NewProject` function in `design-system/screens/home.html`.
 *
 * Rebuilt on Aurora Glass. One thing genuinely changed for the user, and it
 * is deliberate:
 *
 *   - **The cover image moved out of the header.** It used to be a 160px
 *     banner across the top of the sheet; it is now a row inside the "Cover
 *     image" section — a 108×36 proof, the file name, and a remove button.
 *     The dashed target it replaces also accepts a dropped file now.
 *
 * **The icon is a white Phosphor glyph since 29-1P8a2** (idea 150, his
 * call): the tile is `ProjectIcon`, the glow behind it the cover's colour —
 * the cover chosen below, live, so picking a cover recolours the icon here
 * before Save. Its picker (`ProjectIconPicker`) searches every Phosphor
 * glyph and grows out of the tile inside a well, as the emoji grid it
 * replaced did. An emoji chosen before stays until he picks an icon.
 *
 * **No colour picker since OPT-4** (2026-10-06, his call: *"Remove the
 * Accent colour from the software entirely it just wastes the space"*).
 * Projects carry no colour anywhere in the app.
 *
 * Unchanged underneath: `onSave`'s payload field for field, `compressImage`
 * on upload, `parseBulkLines` for batch mode, the reset-on-open pattern,
 * and `useOverlayDismiss` owning Escape. Batch mode still writes only name
 * + icon — a description and a cover are inherently per-project,
 * so the sheet hides them rather than pretending they apply to ten
 * projects at once.
 */
import { useState, useRef } from 'react';
import type { ChangeEvent, CSSProperties, ReactNode } from 'react';
import { Button, Dialog, Icon, IconButton, Input, SoftToggle, Textarea, WhiteButton, type IconName } from '../ui';
import { useStore, type Project } from '../store/useStore';
import { parseBulkLines } from '../lib/bulkAdd';
import { DEFAULT_PROJECT_ICON, FALLBACK_PROJECT_ICON } from '../lib/projectIcon';
import { useOverlayDismiss } from '../lib/useOverlayDismiss';
import { Z } from '../lib/zLayers';
import { storeCover, useCoverSrc } from '../lib/covers/coverCache';
import CoverPicker from './CoverPicker';
import ProjectIcon from './ProjectIcon';
import ProjectIconPicker from './ProjectIconPicker';
import { hashId, type ProjectCoverStyle } from '../lib/projectCover';

/**
 * A new project's first cover, chosen here rather than left to its id's
 * default, so the preview in this sheet is the cover it is created with —
 * the id does not exist until Create. Rolled from how many projects there
 * are, not `Math.random`, so each new project gets another one and the
 * sheet's screenshot is the same every run; Shuffle is the random part.
 */
const freshCover = (count: number): ProjectCoverStyle => ({ seed: hashId(`new-project-${count}`) });

/** What the sheet opens with: an existing project's own icon, or a new one's rocket. */
const startIcon = (project: Project | undefined): string =>
  project ? (project.icon || FALLBACK_PROJECT_ICON) : DEFAULT_PROJECT_ICON;

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
function Section({ icon, label, children }: { icon: IconName; label: string; children: ReactNode }) {
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
  /** Creating inside another project (BIG-2): its name, for the sentence under the title. */
  insideName?: string;
}

export default function CreateProjectModal({ isOpen, onClose, onSave, project, insideName }: CreateProjectModalProps) {
  const [name, setName] = useState(project?.name ?? '');
  const [description, setDescription] = useState(project?.description ?? '');
  const [finishBy, setFinishBy] = useState(project?.finishBy ?? '');
  const [icon, setIcon] = useState(() => startIcon(project));
  const [imageUrl, setImageUrl] = useState(project?.imageUrl ?? '');
  const projectCount = useStore((s) => s.projects.length);
  const [cover, setCover] = useState<ProjectCoverStyle | undefined>(() => project ? project.cover : freshCover(projectCount));
  const imageSrc = useCoverSrc(imageUrl);
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
   * reused whatever name/description/icon/image was left over from
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
      setFinishBy(project?.finishBy ?? '');
      setIcon(startIcon(project));
      setImageUrl(project?.imageUrl ?? '');
      setCover(project ? project.cover : freshCover(projectCount));
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
      // Its own document, not this project's record (`lib/covers/`).
      setImageUrl(await storeCover(await compressImage(file)));
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

  const handleSave = () => {
    if (!valid) return;
    if (bulkMode) {
      // Shared icon across every project created; no description/cover
      // image since those are inherently per-project.
      bulkNameLines.forEach((line) => onSave({ name: line, icon }));
      onClose();
      return;
    }
    onSave({
      name: name.trim(),
      description: description.trim() || undefined,
      finishBy: finishBy || undefined,
      icon,
      imageUrl: imageUrl || undefined,
      cover,
    });
    onClose();
  };

  const title = project ? 'Edit project' : bulkMode ? 'New projects' : 'New project';
  const blurb = project
    ? 'Changes show up everywhere this project appears.'
    : `${insideName ? `Inside ${insideName}. ` : ''}${bulkMode
      ? 'One name per line. Lists and tasks come after.'
      : 'Name it now. Lists and tasks come after.'}`;

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
        className="ag-scroll ag-fade"
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
          <SoftToggle
            size="sm"
            pressed={bulkMode}
            onPressedChange={setBulkMode}
            icon={<Icon name="layers" size={15} />}
            style={{ justifySelf: 'start' }}
          >
            Add multiple at once
          </SoftToggle>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--sp-5)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)' }}>
            <button
              type="button"
              className="ag-licon-host"
              onClick={() => setShowIconPicker((v) => !v)}
              aria-label="Choose project icon"
              aria-expanded={showIconPicker}
              style={{
                flex: '0 0 auto',
                display: 'grid',
                placeItems: 'center',
                padding: 0,
                border: 0,
                cursor: 'pointer',
                borderRadius: 'var(--r-md)',
                backgroundColor: 'transparent',
                boxShadow: showIconPicker ? '0 0 0 1px var(--job-lime-line)' : 'none',
                transition: 'var(--t-hover)',
              }}
            >
              <ProjectIcon project={{ id: project?.id ?? 'new', icon, imageUrl, cover }} size={48} />
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

          {/* Grows out of the tile instead of floating over the sheet, and
              is built the first time it opens (its icons are a download of
              their own). Picking closes it. */}
          {showIconPicker && (
            <ProjectIconPicker
              value={icon}
              projectName={name}
              onPick={(next) => {
                setIcon(next);
                setShowIconPicker(false);
              }}
            />
          )}

          {bulkMode ? (
            <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)' }}>
              Every project gets the icon above. Descriptions and covers are
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

        {/* 29-1P9b (idea 156, his pick C): the day it should be finished by,
            the coral line on the board's "when it'll be done" chart. */}
        {!bulkMode && (
          <Section icon="calendar" label="Finish by">
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)' }}>
              <Input
                type="date"
                value={finishBy}
                onChange={(e) => setFinishBy(e.target.value)}
                aria-label="Finish by"
                block={false}
              />
              {finishBy && (
                <IconButton label="Clear the finish date" variant="ghost" size="sm" onClick={() => setFinishBy('')}>
                  <Icon name="x" size={16} />
                </IconButton>
              )}
            </div>
          </Section>
        )}

        {/* Cover image — per-project, hidden in bulk mode. */}
        {!bulkMode && (
          <Section icon="image" label="Cover">
            <CoverPicker
              subject={{ id: project?.id ?? 'new', name: name.trim() || 'New project', icon, imageUrl, cover }}
              onCoverChange={setCover}
              onClearPhoto={() => {
                setImageUrl('');
                setImageName('');
              }}
            />
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
                  src={imageSrc}
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
                  border: `1px dashed ${dropping ? 'var(--job-lime-line)' : 'var(--line-strong)'}`,
                  background: dropping ? 'var(--job-lime-wash)' : 'transparent',
                  color: dropping ? 'var(--fg-1)' : 'var(--fg-3)',
                  font: 'var(--type-label)',
                  transition: 'var(--t-hover)',
                }}
              >
                <Icon name="image-up" size={20} />
                {isUploading ? 'Compressing…' : 'Or upload your own photo'}
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
          {/* The sheet's confirm: solid white since 29-1P2 (gel is for a
              screen's one main action, and this is a dialog's yes). */}
          <WhiteButton
            disabled={!valid}
            onClick={handleSave}
            icon={<Icon name={project ? 'check' : 'plus'} size={16} />}
          >
            {project
              ? 'Save changes'
              : bulkMode && bulkNameLines.length > 1
                ? `Create ${bulkNameLines.length} projects`
                : 'Create project'}
          </WhiteButton>
        </div>
      </div>
    </Dialog>
  );
}
