import { useRef, useState, type ChangeEvent } from 'react';
import { compressImage } from '../../lib/compressImage';
import { storeCover } from '../../lib/covers/coverCache';

/**
 * File-picker plumbing behind a task's cover image. Shared by the card-shaped
 * `CoverImageField` and the task panel's full-bleed hero treatment, which look
 * different but pick, compress, and store the image identically.
 *
 * What `onChange` receives is a `cover:<id>` pointer, not the picture: the
 * picture is its own document (`lib/covers/`). Draw it with `useCoverSrc`.
 */
export function useCoverUpload(onChange: (dataUrl: string) => void) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const openPicker = () => inputRef.current?.click();

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try { onChange(await storeCover(await compressImage(file))); }
    catch { /* a failed decode just leaves the previous cover in place */ }
    finally { setIsUploading(false); e.target.value = ''; }
  };

  return { inputRef, isUploading, openPicker, handleFileChange };
}
