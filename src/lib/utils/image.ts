/**
 * Client-side image re-encoding.
 *
 * SECURITY/PRIVACY: every photo leaves the device ONLY after a canvas
 * re-encode. Canvas drawing copies pixels, never metadata — so EXIF
 * (including the GPS position phone cameras embed) is stripped. Mushroom
 * finds are location-sensitive: uploading the raw file would leak the exact
 * spot inside the image file even when the find is shown as "approximate"
 * on the map. Re-encoding also shrinks uploads (faster on forest networks).
 */

function drawToCanvas(file: File, maxDim: number): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      let { width, height } = img;

      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(img.src);
        reject(new Error('Kunne ikke initialisere canvas.'));
        return;
      }

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(img.src);
      resolve(canvas);
    };

    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error('Kunne ikke lese bilde.'));
    };

    img.src = URL.createObjectURL(file);
  });
}

/** EXIF-free base64 JPEG (max 1500px) for the AI identification call. */
export async function optimizeImageForIdentification(file: File): Promise<string> {
  const canvas = await drawToCanvas(file, 1500);
  const base64 = canvas.toDataURL('image/jpeg', 0.85);
  return base64.split(',')[1];
}

/** EXIF-free JPEG blob (max 2000px) for storage uploads (finding/forum photos). */
export async function reencodeImageForUpload(file: File, maxDim = 2000): Promise<Blob> {
  const canvas = await drawToCanvas(file, maxDim);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Kunne ikke komprimere bilde.'))),
      'image/jpeg',
      0.85
    );
  });
}
