/**
 * Flatetellinger — anonym dagsteller for skjermene FØR konto i appen
 * (migrasjon 070).
 *
 * Bruksdager (064) skrives bare for innloggede, så alt som skjer før konto
 * var mørkt: to av tre installasjoner lager aldri konto, og ingen visste om
 * de i det hele tatt så første skjerm (docs/konvertering-og-gjenbruk-2026-09.md
 * § 2). Dette er nevneren som manglet.
 *
 * Én rad per dag, flate og språk med et heltall — ingen bruker-ID, ingen
 * enhets-ID, ingen IP, ikke klokkeslett. Det er ikke persondata, og derfor
 * verken i GDPR-eksporten eller i slettingen; personvernerklæringen nevner
 * det i én setning. Skrives via SQL-funksjonen tell_flate (service role)
 * fra /api/tell, som svarer 204 uansett — målingen skal aldri stå i veien.
 *
 *   soppforhold  første skjerm i skallet, utlogget (/soppforhold)
 *   register     registreringsskjemaet åpnet (/auth/register)
 */

import { LOCALES, isLocale, type Locale } from '@/i18n/config';

export const TELLBARE_FLATER = ['soppforhold', 'register'] as const;
export type TellbarFlate = (typeof TELLBARE_FLATER)[number];

export function erTellbarFlate(v: unknown): v is TellbarFlate {
  return typeof v === 'string' && (TELLBARE_FLATER as readonly string[]).includes(v);
}

/** Nøkkel i sessionStorage — én telling per flate per app-økt (kald start = ny økt). */
export function tellNokkel(flate: TellbarFlate): string {
  return `mycelet:tell:${flate}`;
}

/** Én rad fra tabellen, slik rapporten leser den. */
export interface TellingRad {
  /** YYYY-MM-DD (Oslo-dato) */
  dag: string;
  flate: string;
  sprak: string;
  antall: number;
}

export type TellingerPerSprak = Record<Locale, number>;
export type Tellinger = Record<TellbarFlate, TellingerPerSprak>;

export function tomTellinger(): Tellinger {
  const perSprak = () => Object.fromEntries(LOCALES.map((l) => [l, 0])) as TellingerPerSprak;
  return { soppforhold: perSprak(), register: perSprak() };
}

/**
 * Summerer radene fra og med `fraDag` (inklusiv) per flate og språk. Ukjente
 * flater og språk hoppes over — kolonnene har CHECK, men rapporten skal tåle
 * at noen endrer det for hånd.
 */
export function summerTellinger(rader: TellingRad[], fraDag: string): Tellinger {
  const sum = tomTellinger();
  for (const r of rader) {
    if (r.dag < fraDag) continue;
    if (!erTellbarFlate(r.flate) || !isLocale(r.sprak)) continue;
    const n = Number(r.antall);
    if (!Number.isFinite(n) || n < 0) continue;
    sum[r.flate][r.sprak] += n;
  }
  return sum;
}
