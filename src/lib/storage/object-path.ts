/**
 * Finner filstien i Supabase Storage ut fra den offentlige URL-en vi lagret.
 *
 * `findings.image_url` og `thumbnail_url` er resultatet av getPublicUrl(), og
 * det er alt vi har når et funn skal ryddes. Formen er
 *
 *   https://<prosjekt>.supabase.co/storage/v1/object/public/<bøtte>/<sti>
 *
 * og vi trenger `<sti>` for å kunne kalle storage.remove().
 *
 * HVORFOR DENNE ER STRENG
 * URL-en er ikke vår — den kom inn i raden fra nettleseren
 * (AddFindingSheet laster opp og sender `imageUrl` videre til POST
 * /api/findings). En bruker som kaller API-et direkte kan skrive HVA SOM HELST
 * i det feltet, inkludert URL-en til en annen brukers bilde. Slettejobben må
 * derfor aldri stole på at stien peker på noe som tilhører eieren av funnet:
 * den skal hente stien her, og kallstedet skal kreve `<bruker-id>/`-prefikset
 * (se eierskapsvakten i purge-jobben). Uten den kombinasjonen ville
 * «lagre funn med andres bilde-URL → slett funnet» vært en vei til å slette
 * andres bilder.
 *
 * Returnerer null for alt som ikke er en offentlig URL i akkurat denne bøtta.
 * Null betyr «rør ingenting» — aldri «prøv noe annet».
 */

/** Segmentet Supabase legger inn foran bøttenavnet for offentlige objekter. */
const PUBLIC_PREFIX = '/storage/v1/object/public/';

export function storagePathFromPublicUrl(
  url: string | null | undefined,
  bucket: string
): string | null {
  if (!url || !bucket) return null;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  // Bare http(s). En data:- eller file:-URL har ingenting her å gjøre.
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;

  const marker = `${PUBLIC_PREFIX}${bucket}/`;
  const at = parsed.pathname.indexOf(marker);
  if (at === -1) return null;

  // decodeURIComponent fordi getPublicUrl prosentkoder stien. Kaster den
  // (ugyldig %-sekvens), er URL-en ikke en vi har laget.
  let path: string;
  try {
    path = decodeURIComponent(parsed.pathname.slice(at + marker.length));
  } catch {
    return null;
  }

  if (path.length === 0) return null;
  // Belte og seler. `new URL()` normaliserer allerede bort `..` (også
  // prosentkodet) før vi ser stien, så disse to skal aldri slå til i dag — de
  // står der for den dagen noen bytter URL-parsingen mot en strengsplitt.
  if (path.startsWith('/') || path.split('/').includes('..')) return null;

  return path;
}

/**
 * Er stien inne i brukerens egen mappe?
 *
 * Alle opplastinger legges under `${user.id}/` (se upload-path.ts). Vakten er
 * det som gjør en URL fra en annens bøtte-mappe harmløs: den blir liggende i
 * stedet for å bli slettet.
 */
export function isOwnedByUser(path: string | null, userId: string): boolean {
  if (!path || !userId) return false;
  return path.startsWith(`${userId}/`);
}
