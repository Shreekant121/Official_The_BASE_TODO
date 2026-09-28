import { useEffect, useRef } from 'react';

/**
 * Keep the screen awake while `active` is true (used by the focus timer so a
 * long-running session doesn't dim/lock the display mid-task).
 *
 * Strategy:
 *  - Primary: the Screen Wake Lock API (`navigator.wakeLock.request('screen')`).
 *    The OS auto-releases this sentinel whenever the tab is hidden, so we
 *    re-acquire on `visibilitychange` when we become visible again.
 *  - Fallback: a "NoSleep"-style hidden, muted, looping <video>. Where the
 *    Wake Lock API is missing or blocked (older Safari, some in-app/embedded
 *    webviews), continuously playing video is what keeps the screen on. We
 *    feed it a canvas `captureStream` so no binary video asset is needed.
 *
 * The lock is only ever held while `active` AND the page is visible; it's
 * fully released on `active = false`, on unmount (leaving focus), and on tab
 * hide.
 */
export function useWakeLock(active: boolean) {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const drawTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinel> };
    };

    const startVideoFallback = () => {
      if (videoRef.current) return;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 2;
        canvas.height = 2;
        const ctx = canvas.getContext('2d');
        // Nudge a pixel on an interval so the captured stream keeps emitting
        // frames — a frozen stream can let the display sleep.
        const draw = () => {
          if (!ctx) return;
          ctx.fillStyle = ctx.fillStyle === '#000000' ? '#010101' : '#000000';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        };
        draw();

        const capturable = canvas as HTMLCanvasElement & {
          captureStream?: (frameRate?: number) => MediaStream;
        };
        const stream = capturable.captureStream?.(2);
        if (!stream) return;

        const video = document.createElement('video');
        video.muted = true;
        video.setAttribute('muted', '');
        video.setAttribute('playsinline', '');
        video.playsInline = true;
        video.loop = true;
        video.srcObject = stream;
        Object.assign(video.style, {
          position: 'fixed',
          top: '-1px',
          left: '-1px',
          width: '1px',
          height: '1px',
          opacity: '0',
          pointerEvents: 'none',
        });
        document.body.appendChild(video);
        videoRef.current = video;
        drawTimerRef.current = setInterval(draw, 1000);
        void video.play().catch(() => {});
      } catch {
        // No fallback available — give up silently rather than break focus mode.
      }
    };

    const stopVideoFallback = () => {
      if (drawTimerRef.current) {
        clearInterval(drawTimerRef.current);
        drawTimerRef.current = null;
      }
      const video = videoRef.current;
      if (video) {
        try {
          video.pause();
          const stream = video.srcObject as MediaStream | null;
          stream?.getTracks().forEach((track) => track.stop());
          video.srcObject = null;
          video.remove();
        } catch {
          // ignore teardown errors
        }
        videoRef.current = null;
      }
    };

    const acquire = async () => {
      if (cancelled || document.visibilityState !== 'visible') return;
      if (sentinelRef.current || videoRef.current) return; // already held

      if (nav.wakeLock) {
        try {
          const sentinel = await nav.wakeLock.request('screen');
          if (cancelled) {
            void sentinel.release().catch(() => {});
            return;
          }
          sentinelRef.current = sentinel;
          sentinel.addEventListener('release', () => {
            if (sentinelRef.current === sentinel) sentinelRef.current = null;
          });
          return;
        } catch {
          // Blocked/unavailable (e.g. permission policy) → try the video trick.
        }
      }
      startVideoFallback();
    };

    const release = () => {
      if (sentinelRef.current) {
        void sentinelRef.current.release().catch(() => {});
        sentinelRef.current = null;
      }
      stopVideoFallback();
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (active) void acquire();
      } else {
        // The OS auto-releases the screen wake lock when hidden; drop our
        // reference so we re-request it when we return, and pause the fallback.
        sentinelRef.current = null;
        stopVideoFallback();
      }
    };

    if (active) void acquire();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      release();
    };
  }, [active]);
}
