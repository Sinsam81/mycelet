import { intlLocale } from '@/lib/utils/intl-locale';

/**
 * De tolv månedsnavnene skrevet helt ut på leserens språk («september»,
 * «augusti»), indeks 0 = januar.
 *
 * Artssidens faktaliste bruker forkortelsene fra meldingskatalogen («jul –
 * nov»). I løpende tekst — metabeskrivelsen og «flest registrerte funn i
 * midten av september» — trengs hele navnet, og det gir `Intl` på begge språk
 * uten tolv nøkler til i hver katalog.
 *
 * Dagen midt i måneden og UTC, så verken tidssone eller sommertid kan flytte
 * datoen over en månedsgrense.
 */
export function langeManedsnavn(locale: string): string[] {
  const format = new Intl.DateTimeFormat(intlLocale(locale), { month: 'long', timeZone: 'UTC' });
  return Array.from({ length: 12 }, (_, maaned) => format.format(new Date(Date.UTC(2026, maaned, 15))));
}
