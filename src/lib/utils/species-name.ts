import type { Locale } from '@/i18n/config';

export interface LocalizedSpeciesName {
  // Begge er valgfrie: joinede rader fra PostgREST kan mangle feltet helt, og
  // implementasjonen under takler det uansett. En strengere type ville bare
  // tvunget kallstedene til å kaste inn `as`-konverteringer.
  norwegian_name?: string | null;
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

/**
 * Samme oppslag, men for en JOINET art fra Supabase.
 *
 * PostgREST returnerer en relasjon som objekt eller som array-med-ett-element
 * avhengig av hvordan joinet er skrevet, og som null når funnet ikke har noen
 * art. Uten denne innpakningen måtte hvert kallsted håndtert alle tre formene,
 * og i praksis gjorde de det ikke — de leste `norwegian_name` rått, så svenske
 * brukere så norske artsnavn i forumet, på profilen og i Mine steder.
 *
 * Returnerer TOM STRENG, ikke en fallback-tekst, slik at kallstedet kan falle
 * videre på `species_name_override` (brukerens eget navn på funnet) før det
 * lander på «ukjent art».
 */
export function getJoinedSpeciesName(
  relation: LocalizedSpeciesName | LocalizedSpeciesName[] | null | undefined,
  locale: Locale | string
): string {
  const row = Array.isArray(relation) ? relation[0] : relation;
  if (!row) return '';
  return getSpeciesDisplayName(row, locale);
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
