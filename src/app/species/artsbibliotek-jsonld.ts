import type { Locale } from '@/i18n/config';
import { NETTSTED } from '@/lib/seo/side-metadata';
import { compareSpeciesByDisplayName, getSpeciesDisplayName, type LocalizedSpeciesName } from '@/lib/utils/species-name';

/**
 * Strukturerte data for artsbiblioteket: en ItemList over artssidene.
 *
 * Bare navn og adresse per art — ALDRI spiselighet. Et «spiselig» i
 * strukturerte data ville blitt lest ut av sammenhengen (et søketreff, et
 * AI-svar) uten forbeholdet som står over kortene på siden. Rekkefølgen er den
 * leseren ser uten søk: alfabetisk på navnet på leserens språk.
 */
export function byggArtsbibliotekJsonLd(
  arter: ReadonlyArray<LocalizedSpeciesName & { id: number }>,
  locale: Locale | string,
  navn: string
) {
  const sortert = [...arter].sort((a, b) => compareSpeciesByDisplayName(a, b, locale));
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: navn,
    url: `${NETTSTED}/species`,
    numberOfItems: sortert.length,
    itemListElement: sortert.map((art, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: getSpeciesDisplayName(art, locale),
      url: `${NETTSTED}/species/${art.id}`
    }))
  };
}
