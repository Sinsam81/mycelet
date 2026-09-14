import type { HJEM_OMRADER } from '@/lib/bruk/bruksdag';
import { sammeRute } from './husket-posisjon';

/** «egen» = brukerens egen eller huskede posisjon, «standard» = standardområdet for språket (bruksdag.ts). */
type Kilde = (typeof HJEM_OMRADER)[number];

export interface VistPosisjon {
  lat: number;
  lng: number;
  kilde: Kilde;
}

export interface PosisjonsVisning {
  /** Standardområdet vises: merk «omtrentlig» og gjør det store tilbudet om å dele posisjon. */
  omtrentlig: boolean;
  /** Posisjonen kan være feil: vis den lille «Min posisjon»-lenka, så den kan rettes fra kortet. */
  kanRettes: boolean;
}

/**
 * Hva forsidekortet skal si om posisjonen det viser, og om den kan rettes derfra.
 *
 * En husket posisjon er brukerens egen — men den kan være opptil sju dager
 * gammel, og på Safari (ingen Permissions API for geolocation) eller etter at
 * tilgangen ble trukket, kommer det aldri en fersk posisjon av seg selv. Da er
 * den huskede eneste kilde, og uten en knapp på kortet var eneste vei ut å
 * åpne kartet: en som var i Bergen på mandag så «📍 Bergen» hele uka i Oslo.
 * Derfor: bare en posisjon som en fersk måling fra DENNE åpningen bekrefter
 * (samme ~1 km-rute) er ferdig; alt annet får «Min posisjon». «Omtrentlig» og
 * det store delingstilbudet gjelder fortsatt bare standardområdet.
 */
export function posisjonsVisning(
  vist: VistPosisjon,
  fersk: { lat: number; lng: number } | null
): PosisjonsVisning {
  const omtrentlig = vist.kilde === 'standard';
  const bekreftet = !omtrentlig && fersk !== null && sammeRute(vist, fersk);
  return { omtrentlig, kanRettes: !bekreftet };
}
