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

/**
 * Hvorfor et bilde ikke lot seg behandle.
 *
 *   • `ulesbart`      — nettleseren klarte ikke å dekode fila (skadet, eller
 *                       et format den ikke leser). Brukeren kan velge et annet
 *                       bilde, så dette er den ene koden som fortjener sin
 *                       egen tekst.
 *   • `canvas`        — ingen 2D-kontekst (typisk for lite minne).
 *   • `komprimering`  — canvas.toBlob ga ingenting.
 *   • `ugyldig-data`  — en data:-URL uten innhold.
 */
export type BildeFeilKode = 'ulesbart' | 'canvas' | 'komprimering' | 'ugyldig-data';

const BILDE_FEIL_TEKST: Record<BildeFeilKode, string> = {
  ulesbart: 'Kunne ikke lese bilde.',
  canvas: 'Kunne ikke initialisere canvas.',
  komprimering: 'Kunne ikke komprimere bilde.',
  'ugyldig-data': 'Ugyldig bilde-data.'
};

/**
 * Feilen bildefunksjonene her kaster.
 *
 * De kastet `new Error('Kunne ikke lese bilde.')`, og sidene viste
 * `err.message` rått — så en svensk bruker som valgte et bilde nettleseren
 * ikke kunne lese, fikk norsk tekst. En tekst kan ikke oversettes der den
 * vises; en kode kan. Kallstedet slår opp sin egen oversatte tekst med
 * `bildeFeilKode(err)`, samme mønster som `kameraFeil` i native/camera.ts.
 *
 * `message` er fortsatt den norske setningen, av to grunner: den er lesbar i
 * Sentry, og kallsteder som ikke er flyttet ennå viser det samme som før i
 * stedet for en intern kode.
 */
export class BildeFeil extends Error {
  readonly kode: BildeFeilKode;

  constructor(kode: BildeFeilKode) {
    super(BILDE_FEIL_TEKST[kode]);
    this.name = 'BildeFeil';
    this.kode = kode;
  }
}

/** Koden hvis feilen er en BildeFeil, ellers null. Leser feltet, ikke klassen. */
export function bildeFeilKode(feil: unknown): BildeFeilKode | null {
  if (!feil || typeof feil !== 'object') return null;
  const kode = (feil as { kode?: unknown }).kode;
  // hasOwnProperty, ikke `in`: «toString» finnes på alle objekter.
  return typeof kode === 'string' && Object.prototype.hasOwnProperty.call(BILDE_FEIL_TEKST, kode)
    ? (kode as BildeFeilKode)
    : null;
}

function drawToCanvas(file: Blob, maxDim: number): Promise<HTMLCanvasElement> {
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
        reject(new BildeFeil('canvas'));
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
      reject(new BildeFeil('ulesbart'));
    };

    img.src = URL.createObjectURL(file);
  });
}

/**
 * Decode base64 image data to a Blob without fetch().
 *
 * fetch('data:…') and fetch('capacitor://…') are subject to connect-src in
 * the (enforcing) CSP, which allowlists neither scheme — in Safari/WKWebView
 * they die with the bare «Load failed». Manual decoding has no CSP surface.
 */
export function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

/** Decode a data:-URL (e.g. canvas.toDataURL output) to a Blob without fetch(). */
export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',');
  if (!base64) throw new BildeFeil('ugyldig-data');
  const mimeType = header.match(/^data:([^;]+)/)?.[1] ?? 'application/octet-stream';
  return base64ToBlob(base64, mimeType);
}

/**
 * Historikk-kopien av et identifiseringsbilde.
 *
 * Tar base64-strengen som ALLEREDE er sendt til Kindwise (altså den
 * EXIF-frie 1500 px-versjonen) og krymper den videre til historikkstørrelse.
 * Vi går bevisst ut fra den og ikke fra originalfila: den er allerede
 * metadata-fri, og brukeren skal aldri kunne havne i at historikken bærer
 * GPS-en fra kamerarullen selv om identifiseringen ikke gjorde det.
 *
 * Størrelsen er valgt etter Supabase-planen — se HISTORY_IMAGE_MAX_DIM.
 */
export async function reencodeBase64ForHistory(
  base64: string,
  maxDim: number,
  quality: number
): Promise<Blob> {
  const canvas = await drawToCanvas(base64ToBlob(base64, 'image/jpeg'), maxDim);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new BildeFeil('komprimering'))),
      'image/jpeg',
      quality
    );
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
      (blob) => (blob ? resolve(blob) : reject(new BildeFeil('komprimering'))),
      'image/jpeg',
      0.85
    );
  });
}
