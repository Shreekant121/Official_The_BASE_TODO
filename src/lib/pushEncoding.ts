/**
 * The two pure pieces of web push — APP-3.
 *
 * Split out of `push.ts` for the reason `publicShareSnapshot.ts` was split out
 * of `publicShare.ts`: that file reaches `./firebase`, which cannot load in
 * Node, so anything importing it is untestable in vitest. These two are
 * arithmetic over strings and hold no browser or Firebase API at all.
 *
 * Both of them fail *silently* when they are wrong, which is the whole reason
 * they are asserted rather than watched. A VAPID key decoded to the wrong
 * length makes `pushManager.subscribe()` reject with a message that names
 * neither the key nor the length; a document id that is not stable across runs
 * leaves a second row per device and quietly doubles every notification.
 */

/**
 * Decodes a URL-safe base64 VAPID key into the byte array `subscribe()` wants.
 *
 * `applicationServerKey` accepts a bare string in Chrome and a `BufferSource`
 * everywhere, and the string form is the one that is quietly wrong on some
 * versions — so it is always converted. A VAPID public key is an uncompressed
 * P-256 point: **65 bytes, first byte `0x04`**, which is what the test pins.
 *
 * Backed by an explicit `ArrayBuffer` rather than `new Uint8Array(length)`,
 * whose type is `ArrayBufferLike` and so might be a `SharedArrayBuffer` —
 * which `applicationServerKey` will not take. Same bytes, narrower type.
 */
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalised = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalised);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/**
 * A stable Firestore document id for one push endpoint.
 *
 * The endpoint **is** the identity of a subscription, so the id is derived from
 * it rather than generated — re-subscribing on the same device then overwrites
 * its own row instead of leaving a second copy behind, and `api/push-test.ts`
 * sends one notification per device rather than one per time it was enabled.
 *
 * FNV-1a, 32-bit, hex, prefixed so the id can never begin with a digit. This is
 * **not** a security choice and is not pretending to be one: the endpoint is
 * stored in plain sight in the document beside it. All it has to do is turn a
 * 250-character URL into a legal document id, deterministically.
 */
export function subscriptionDocId(endpoint: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < endpoint.length; i += 1) {
    hash ^= endpoint.charCodeAt(i);
    // The FNV prime (16777619), as the shifts that keep this inside a 32-bit
    // integer — a plain multiply overflows JS's float precision and stops
    // being a hash function somewhere past the fourth character.
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return `s${hash.toString(16).padStart(8, '0')}`;
}
