import { DEFAULT_LOCALE, isLocale, type Locale } from '@/i18n/config';

/**
 * Der forsidekortet starter når vi ikke vet hvor brukeren er.
 *
 * Før sto Oslo for alle — også på svensk, merket «Södra Norge». En svensk
 * «kantarell»-installasjon fikk altså norsk vær på sitt eget språk. Standarden
 * følger språket: nb → Oslo, sv → Stockholm. Begge ligger inne i hver sin
 * PREDICTION_TILE_REGION, så etiketten blir bynavnet, ikke en løs landsdel
 * (testen vokter det). Dette er et utgangspunkt, aldri et gjett på hvor
 * brukeren er — kortet sier «omtrentlig» og tilbyr egen posisjon.
 */
export const STANDARD_POSISJON: Record<Locale, { lat: number; lng: number }> = {
  nb: { lat: 59.91, lng: 10.75 },
  sv: { lat: 59.33, lng: 18.07 }
};

export function standardPosisjon(locale: string): { lat: number; lng: number } {
  return STANDARD_POSISJON[isLocale(locale) ? locale : DEFAULT_LOCALE];
}
