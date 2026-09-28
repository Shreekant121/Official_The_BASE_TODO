import { useRef, useState, type ChangeEvent } from 'react';
import { compressImage } from '../../lib/compressImage';

/**
 * File-picker plumbing behind a task's cover image. Shared by the card-shaped
 * `CoverImageField` and the task panel's full-bleed hero treatment, which look
 * different but pick, compress, and store the image identically.
 */
export function useCoverUpload(onChange: (dataUrl: string) => void) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const openPicker = () => inputRef.current?.click();

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try { onChange(await compressImage(file)); }
    catch { /* a failed decode just leaves the previous cover in place */ }
    finally { setIsUploading(false); e.target.value = ''; }
  };

  return { inputRef, isUploading, openPicker, handleFileChange };
}
