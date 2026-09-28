/**
 * The two pure pieces of web push — APP-3.
 *
 * Both fail *silently* when they are wrong, which is why they are here rather
 * than left to the browser proof the item asks for. A key that decodes to the
 * wrong length makes `pushManager.subscribe()` reject with a message naming
 * neither the key nor the length; an unstable document id leaves a second row
 * per device and doubles every notification a year from now, in item 27's code,
 * where nobody would look here for the cause.
 */
import { describe, expect, it } from 'vitest';
import { subscriptionDocId, urlBase64ToUint8Array } from './pushEncoding';

/*
 * A throwaway P-256 public key in the same base64url spelling the real one
 * uses, generated for this test and belonging to nothing. Deliberately NOT the
 * app's own `VITE_VAPID_PUBLIC_KEY`: that one lives in `.env`, which is
 * gitignored, and nothing in this repo should be the second place a key is
 * written down even when the key is a public one. The assertion below is about
 * the *shape* every VAPID key shares, so a real one buys nothing.
 */
const VAPID_PUBLIC_KEY =
  'BDo_u0GDZNY3DjUJMyYM3IJSdTDMQMs7RNGqjHrjmkb0_IuGbrnt_jAZbulE3wRz1nqWRoMIejGd5uQLAbZUECo';

describe('urlBase64ToUint8Array', () => {
  it('decodes a VAPID key to an uncompressed P-256 point', () => {
    const bytes = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
    /*
     * 65 bytes, leading `0x04`. This is the whole assertion: the push service
     * rejects any other length, and `-`/`_` left untranslated or the padding
     * left off both produce a *shorter* array rather than an error.
     */
    expect(bytes.length).toBe(65);
    expect(bytes[0]).toBe(0x04);
  });

  it('translates the URL-safe alphabet rather than dropping it', () => {
    // `-` and `_` stand in for `+` and `/`; decoded naively they vanish and the
    // key silently comes out short.
    expect(Array.from(urlBase64ToUint8Array('-_8'))).toEqual([251, 255]);
  });

  it('restores the padding base64url leaves off', () => {
    // 'AQ' is one byte's worth of base64 with its '==' stripped. Without the
    // padding, `atob` throws on some runtimes and returns nothing on others.
    expect(Array.from(urlBase64ToUint8Array('AQ'))).toEqual([1]);
  });
});

describe('subscriptionDocId', () => {
  const endpoint =
    'https://fcm.googleapis.com/fcm/send/ecGm4lCh0Ao:APA91bHqVnRT0yCk2dQ9Xr8zPfKmE1sJ';

  it('is stable, so re-subscribing overwrites the same row', () => {
    expect(subscriptionDocId(endpoint)).toBe(subscriptionDocId(endpoint));
  });

  it('separates two endpoints that differ only at the end', () => {
    expect(subscriptionDocId(`${endpoint}A`)).not.toBe(subscriptionDocId(`${endpoint}B`));
  });

  it('is a legal Firestore document id', () => {
    // Never empty, never a `.`/`..`, never a path, and never leading with a
    // digit — the prefix is what guarantees the last of those.
    expect(subscriptionDocId(endpoint)).toMatch(/^s[0-9a-f]{8}$/);
  });

  it('still answers what it answered when it was written', () => {
    /*
     * The literal, pinned. This is the guard the three above are not: they all
     * stay green if the hash is *replaced*, because a different stable hash is
     * still stable and still distinct. What must not change is the answer
     * itself — every device's row is named by it, so a "tidier" implementation
     * would orphan every subscription already stored and silently double the
     * notifications the next time each device re-enabled them.
     *
     * Proved by breaking it: swapping the shifts for a plain
     * `hash * 16777619` — which loses precision past 2^53 and is the obvious
     * simplification somebody will reach for — turns this red, and turns none
     * of the other three.
     */
    expect(subscriptionDocId(endpoint)).toBe('s34f14c86');
  });
});
