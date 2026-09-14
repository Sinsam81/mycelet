/**
 * Når får tilbudsarket på forsiden lov til å komme?
 *
 * Før lå det en fast 800 ms-timer her. Da la arket (z-1100) seg oppå
 * velkomstintroen (z-100) før forsidekortet hadde data: det første en ny
 * bruker så, var et salgsark over en intro over et tomt kort. Nå venter arket
 * på to ting, uavhengig av rekkefølge:
 *
 *   1. Introen er ferdig — enten ONBOARDING_DONE_EVENT kommer, eller lagringen
 *      sier at den alt er sett (samme nøkkel som introen og cookie-notisen).
 *   2. Forsidekortet har data — hendelsen FORSIDEKORT_KLAR_EVENT fra
 *      MushroomDayCard, eller fristen FORSIDEKORT_FRIST_MS, så et kort som
 *      aldri får data (nettfeil) ikke holder tilbudet igjen for alltid.
 *
 * Deretter et lite pusterom, så arket ikke kommer i samme bilde som introen
 * forsvinner. Ren logikk her; tidene og lytterne ligger i ProvGratisVedStart.
 */

/** Sendes av forsidekortet første gang det har prognosedata. */
export const FORSIDEKORT_KLAR_EVENT = 'mycelet:forsidekort-klar';
/** Så lenge venter arket på kortet før det gir opp og viser seg likevel. */
export const FORSIDEKORT_FRIST_MS = 6_000;
/** Pusterom fra alt er klart til arket vises. */
export const PROVETILBUD_PUSTEROM_MS = 600;

export interface Venting {
  introFerdig: boolean;
  kortKlar: boolean;
}

export type VentingHendelse = 'intro-ferdig' | 'kort-klar' | 'kort-frist';

/** Utgangspunktet ved mount: introen er ferdig hvis lagringen sier «1». */
export function startVenting(introLagret: string | null | undefined): Venting {
  return { introFerdig: introLagret === '1', kortKlar: false };
}

export function nesteVenting(v: Venting, hendelse: VentingHendelse): Venting {
  switch (hendelse) {
    case 'intro-ferdig':
      return v.introFerdig ? v : { ...v, introFerdig: true };
    case 'kort-klar':
    case 'kort-frist':
      return v.kortKlar ? v : { ...v, kortKlar: true };
  }
}

export function klarTilArk(v: Venting): boolean {
  return v.introFerdig && v.kortKlar;
}
