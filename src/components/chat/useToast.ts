/* The one toast the chat screen shows. Moved out of `pages/ChatPage.tsx`,
   unchanged, when it was split (BUILD-7). */
import { useCallback, useEffect, useRef, useState } from 'react';

/** Long summaries are the norm; six seconds is enough to read one. */
const TOAST_MS = 6000;

export function useToast() {
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  return { toast, setToast, showToast };
}
