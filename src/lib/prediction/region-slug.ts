import { PREDICTION_TILE_REGIONS, type PredictionTileRegion } from './tile-regions';

/**
 * URL-slugs for regionsidene under /soppforhold/[omrade].
 *
 * Regionnavnene er den eneste identiteten regionene har (ingen id-er i
 * tile-regions.ts), så slugen avledes av navnet: «Ålesund» → alesund,
 * «Östersund» → ostersund. ASCII uten diakritika er valgt med vilje — det er
 * det folk faktisk skriver i adressefeltet og det som deles penest i lenker.
 *
 * ⚠️ Slugene er offentlige URL-er fra det øyeblikket sitemap.xml er ute.
 * Endres avledningen, brekker delte lenker og Google-indeksen. Testen i
 * __tests__/region-slug.test.ts låser derfor hver enkelt slug eksplisitt.
 */

const ERSTATNINGER: Record<string, string> = {
  æ: 'ae',
  ø: 'o',
  å: 'a',
  ä: 'a',
  ö: 'o',
  ü: 'u',
  é: 'e',
  è: 'e'
};

export function regionSlug(navn: string): string {
  return navn
    .toLowerCase()
    .split('')
    .map((tegn) => ERSTATNINGER[tegn] ?? tegn)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const REGION_PER_SLUG = new Map<string, PredictionTileRegion>(
  PREDICTION_TILE_REGIONS.map((r) => [regionSlug(r.name), r])
);

// To regioner med samme slug ville stille og rolig skjult den ene siden.
// Smeller heller ved modul-lasting (og dermed i alle tester og bygg).
if (REGION_PER_SLUG.size !== PREDICTION_TILE_REGIONS.length) {
  throw new Error('regionSlug: to regionnavn gir samme slug — gi dem unike navn i tile-regions.ts');
}

export function regionFromSlug(slug: string): PredictionTileRegion | null {
  return REGION_PER_SLUG.get(slug) ?? null;
}

/**
 * Uten filter: alle regioner. Med landfilter: bare det landets slugs.
 * (Landfilteret fantes fra da bare de norske sidene var publisert; siden
 * 2026-08-13 er alle 22 områdesidene ute, med språk etter land — se
 * [omrade]/page.tsx — og kallene bruker den filterløse formen.)
 */
export function alleRegionSlugs(country?: PredictionTileRegion['country']): string[] {
  return [...REGION_PER_SLUG.entries()]
    .filter(([, r]) => country === undefined || r.country === country)
    .map(([slug]) => slug);
}
