import type { Locale } from '@/i18n/config';

export interface LocalizedSpeciesName {
  norwegian_name: string | null;
  swedish_name?: string | null;
}

/**
 * Use the user's language for a species name when curated data exists.
 * Norwegian remains the fallback so an incomplete Swedish data row never
 * produces a blank label.
 */
export function getSpeciesDisplayName(species: LocalizedSpeciesName, locale: Locale | string): string {
  const norwegianName = species.norwegian_name?.trim() ?? '';
  const swedishName = species.swedish_name?.trim() ?? '';

  if (locale === 'sv') return swedishName || norwegianName;
  return norwegianName || swedishName;
}

export function compareSpeciesByDisplayName(
  a: LocalizedSpeciesName,
  b: LocalizedSpeciesName,
  locale: Locale | string
): number {
  return getSpeciesDisplayName(a, locale).localeCompare(
    getSpeciesDisplayName(b, locale),
    locale === 'sv' ? 'sv-SE' : 'nb-NO'
  );
}
