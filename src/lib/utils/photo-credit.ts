/**
 * Krediteringslinja under et artsbilde: «Foto: {fotograf} ({lisens})».
 *
 * Alle artsbildene er Wikimedia Commons-filer under CC BY / CC BY-SA, og de
 * lisensene KREVER at fotograf og lisens navngis der bildet vises. Denne
 * funksjonen bestemmer hva linja skal si når vi bare har halve opplysningen —
 * og, viktigst, når den ikke skal si noe i det hele tatt.
 *
 * Den harde regelen: en plassholderverdi skal aldri rendres som om den var en
 * lisens. Seedingen (migrasjon 012 og 017) skrev `license = 'Wikimedia
 * Commons'` — en KILDE, ikke en lisens. Rendret rått ville artssiden påstått
 * at bildet er lisensiert under «Wikimedia Commons», som er en falsk
 * lisenspåstand og verre enn ingen linje. Rader som ennå ikke er
 * etterfylt av scripts/backfill-photo-credits.mjs får derfor ingen linje.
 */

export interface PhotoCreditSource {
  photographer?: string | null;
  license?: string | null;
  /** Filsiden på Wikimedia Commons — lenkemålet, og der de fulle vilkårene står. */
  sourceUrl?: string | null;
}

/**
 * Hvilken melding linja skal bruke, med verdiene den trenger. Formen holdes
 * atskilt fra teksten fordi teksten finnes på to språk (messages/nb.json og
 * sv.json) og bare komponenten har tilgang til katalogen.
 */
export type PhotoCreditShape =
  | { key: 'full'; values: { photographer: string; license: string } }
  | { key: 'photographerOnly'; values: { photographer: string } }
  | { key: 'licenseOnly'; values: { license: string } };

export interface PhotoCredit {
  shape: PhotoCreditShape;
  /** Satt kun når kilden er en ekte http(s)-adresse. */
  href: string | null;
}

/**
 * Verdier som står i feltene, men ikke er en kreditering.
 *
 * Speiler PLACEHOLDERS i scripts/lib/commons-credit.mjs — skriptet bruker
 * lista til å avgjøre hva som skal OVERSKRIVES, denne til å avgjøre hva som
 * skal VISES. Endres den ene, endre den andre.
 */
const PLACEHOLDERS = new Set([
  'wikimedia commons',
  'wikimedia',
  'commons',
  'cc by-sa / public domain',
  'ukjent',
  'unknown'
]);

function realValue(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  return PLACEHOLDERS.has(trimmed.toLowerCase()) ? null : trimmed;
}

function safeHref(value: string | null | undefined): string | null {
  const trimmed = realValue(value);
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    // Bare http(s). En javascript:-adresse fra en databasekolonne skal ikke
    // kunne bli et lenkemål.
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function buildPhotoCredit(source: PhotoCreditSource | null | undefined): PhotoCredit | null {
  if (!source) return null;

  const photographer = realValue(source.photographer);
  const license = realValue(source.license);
  const href = safeHref(source.sourceUrl);

  if (photographer && license) {
    return { shape: { key: 'full', values: { photographer, license } }, href };
  }
  if (photographer) {
    return { shape: { key: 'photographerOnly', values: { photographer } }, href };
  }
  if (license) {
    // Fotografen mangler hos Commons på noen få filer. Lisensen alene er
    // fortsatt en opplysning brukeren har krav på — og lenka til filsiden
    // fører til den fulle krediteringen.
    return { shape: { key: 'licenseOnly', values: { license } }, href };
  }
  return null;
}

/**
 * Radformen krediteringen ligger i på `mushroom_species` — den denormaliserte
 * tvillingen til species_photos, som artslista, AI-resultatet og
 * forvekslingssjekken leser direkte.
 */
export interface SpeciesImageCreditRow {
  primary_image_photographer?: string | null;
  primary_image_license?: string | null;
  primary_image_source_url?: string | null;
}

/**
 * Plukker krediteringen ut av en artsrad, eller null om det ikke finnes noe
 * som faktisk kan vises. Null-formen er med vilje: uten den ville hvert
 * eneste AI-forslag båret med seg `{photographer: null, license: null,
 * sourceUrl: null}` ut til klienten.
 */
export function photoCreditFromSpeciesRow(
  row: SpeciesImageCreditRow | null | undefined
): { photographer: string | null; license: string | null; sourceUrl: string | null } | null {
  if (!row) return null;
  const credit = {
    photographer: row.primary_image_photographer ?? null,
    license: row.primary_image_license ?? null,
    sourceUrl: row.primary_image_source_url ?? null
  };
  return buildPhotoCredit(credit) ? credit : null;
}
