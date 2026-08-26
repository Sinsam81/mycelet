/**
 * Normalisering og validering av bildefeltet i /api/identify-forespørselen.
 *
 * Flerbilde (inntil tre bilder av SAMME sopp — hatt, underside, stilk) sendes
 * som `images: string[]`. Den gamle formen `image: string` godtas fortsatt:
 * API-testene sender den, og en fane som var åpen under en deploy kan fyre
 * den gamle formen mot den nye serveren.
 *
 * Grensene finnes for å avvise absurde payloads FØR vi betaler for et
 * Kindwise-kall. Regnestykket er i WIRE-BYTES: ett base64-tegn er én byte i
 * JSON-kroppen (ikke ¾ — det er den dekodede størrelsen, som ingen grense
 * bryr seg om). Vercel kutter request-kroppen ved 4,5 MB med en HTML-413 som
 * aldri når ruta, så tak som skal bety noe i prod MÅ ligge under det:
 *  · maks 3 bilder — Kindwise tar 5, men deres egen FAQ sier at 3 holder.
 *  · 2,5M tegn per bilde — bevisst strammet fra den gamle enkeltbilde-grensen
 *    på 8M (som lå over Vercel-taket og aldri kunne slå til der); klienten
 *    re-enkoder til 1500px/q0.85, typisk 350–950k tegn.
 *  · 4,0M tegn totalt: reell margin under 4,5 MB inkludert JSON-overhead.
 *    Klienten håndhever samme tak ved innlegging (identify/page.tsx), for
 *    en payload over Vercel-taket ville ellers dødd som HTML-413 før ruta.
 */

export const MAX_IDENTIFY_IMAGES = 3;
export const MAX_IMAGE_BASE64_CHARS = 2_500_000;
export const MAX_TOTAL_BASE64_CHARS = 4_000_000;

export type IdentifyImagesResult =
  | { ok: true; images: string[] }
  | { ok: false; error: 'missing_image' | 'too_many_images' | 'image_too_large' };

export function normalizeIdentifyImages(body: {
  image?: unknown;
  images?: unknown;
}): IdentifyImagesResult {
  const raw = Array.isArray(body.images) && body.images.length > 0 ? body.images : body.image != null ? [body.image] : [];

  if (raw.length === 0) return { ok: false, error: 'missing_image' };
  if (raw.length > MAX_IDENTIFY_IMAGES) return { ok: false, error: 'too_many_images' };

  let total = 0;
  const images: string[] = [];
  for (const img of raw) {
    if (typeof img !== 'string' || img.length === 0) return { ok: false, error: 'missing_image' };
    if (img.length > MAX_IMAGE_BASE64_CHARS) return { ok: false, error: 'image_too_large' };
    total += img.length;
    images.push(img);
  }
  if (total > MAX_TOTAL_BASE64_CHARS) return { ok: false, error: 'image_too_large' };

  return { ok: true, images };
}
