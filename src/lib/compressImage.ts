/**
 * Downscales an image file and re-encodes it as a JPEG data URL.
 *
 * A cover is its own Firestore document now (`lib/covers/`), so this is what
 * keeps each picture under that document's 1 MiB — `fitCoverDocument` is the
 * backstop for the rare photo that still comes out too big.
 */
export async function compressImage(file: File, maxDim = 800, quality = 0.78): Promise<string> {
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
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image')); };
    img.src = url;
  });
}

/** Characters a picture may take and still fit one cover document with room to spare. */
const COVER_DOC_BUDGET = 900_000;

/**
 * Shrink an already-compressed picture until it fits its own document. A
 * noisy full-size photo at the project modal's 1200px can top 1 MiB as a data
 * URL; each round draws it 80% the size, a little softer.
 */
export async function fitCoverDocument(dataUrl: string): Promise<string> {
  let current = dataUrl;
  for (let round = 0; current.length > COVER_DOC_BUDGET && round < 6; round++) {
    current = await new Promise<string>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * 0.8));
        canvas.height = Math.max(1, Math.round(img.height * 0.8));
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.75));
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = current;
    });
  }
  return current;
}
