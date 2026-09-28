/**
 * The task's cover image — upload, preview, remove (UI-13).
 *
 * The empty state is a plain glass `Button`, for the reason written on
 * `AssigneeField`: the dashed placeholder was not a design-system shape and
 * read as a disabled control.
 *
 * The frame keeps `--r-card` rather than the control radius: it holds a
 * picture, so it is a pane, not a pill.
 *
 * Only the Score screen mounts this. The task sheet puts add / change / remove
 * in its header, over the cover itself, and uses `useCoverUpload` directly.
 */
import { Button, Icon, IconButton } from '../../ui';
import { useCoverUpload } from './useCoverUpload';

interface CoverImageFieldProps {
  value: string;
  onChange: (imageUrl: string) => void;
}

export default function CoverImageField({ value, onChange }: CoverImageFieldProps) {
  const { inputRef, isUploading, openPicker, handleFileChange } = useCoverUpload(onChange);

  return (
    <div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

      {value ? (
        <div
          className="relative overflow-hidden"
          style={{ borderRadius: 'var(--r-card)', boxShadow: 'var(--glass-rim-1), var(--glass-cast-1)' }}
        >
          <img src={value} alt="" className="w-full object-cover" style={{ height: 160, display: 'block' }} />
          {/* The scrim is what keeps the remove control legible over a bright
              photograph — the button carries no fill of its own. */}
          <div
            aria-hidden="true"
            className="absolute inset-0"
            style={{ backgroundImage: 'linear-gradient(to top, oklch(0 0 0 / 0.62), transparent 55%)' }}
          />
          <div className="absolute" style={{ right: 'var(--sp-4)', bottom: 'var(--sp-4)' }}>
            <IconButton size="sm" label="Remove cover" onClick={() => onChange('')}>
              <Icon name="x" size={14} />
            </IconButton>
          </div>
        </div>
      ) : (
        <Button
          block
          disabled={isUploading}
          loading={isUploading}
          onClick={openPicker}
          iconLeft={<Icon name="image-up" size={16} />}
        >
          {isUploading ? 'Uploading…' : 'Add a cover image'}
        </Button>
      )}
    </div>
  );
}
