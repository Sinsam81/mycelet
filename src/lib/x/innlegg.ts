import { VARSEL_MIN_OKNING, VARSEL_MIN_SCORE } from '@/lib/alerts/decision';
import { fasitDato } from '@/lib/alerts/email';

/**
 * Tekstene @mycelet publiserer — rene funksjoner, testet i __tests__/.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * SAMME PÅSTAND SOM E-POSTEN, SAMME ÆRLIGHET
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Strategien (2026-08-31) er at Mycelet blir go-to for soppvarsel ved å være
 * ETTERPRØVBAR: hver publisering er en falsifiserbar påstand, og fasiten
 * publiseres — også når vi bommer. X-postene er den offentlige utgaven av
 * nøyaktig det e-postvarselet sier, med de samme tallene og det samme
 * forbeholdet: tallet er vær + sesong for et OMRÅDE, aldri en lovnad om
 * skogen der leseren står. Skriv aldri om tekstene til noe som lover mer.
 *
 * ── Regler som koster penger eller troverdighet om de brytes ────────────────
 *  · ALDRI en URL i teksten. X priser en post med URL til $0.20 mot $0.015
 *    uten — og algoritmen deres straffer lenkeposter i rekkevidde. Lenken bor
 *    i profilen. («mycelet.com» i løpende tekst autolenkes av X og teller
 *    som URL — skriv «Mycelet» eller ingenting.)
 *  · Maks 280 tegn. Komponistene kutter pynt i fast rekkefølge til teksten
 *    passer, i stedet for å la X avvise posten kl. 05:30 uten noen ved tastene.
 */

const MAKS_TEGN = 280;
/** Flere enn dette navngis ikke — resten blir «og N til». */
const MAKS_REGIONER = 3;

export interface Omslag {
  region: string;
  /** Ukas bunn — samme «fra» som e-posten viser og fasitloggen lagrer. */
  fra: number;
  til: number;
}

/**
 * Regionens omslag under→over terskelen, med samme krav som e-postvarselet:
 * i går under, i dag over, og bedringen målt mot ukas bunn må være reell.
 * (Karantenen i decision.ts er per abonnent og gjelder ikke her — en flanke
 * kan per definisjon ikke fyre to dager på rad.)
 */
export function finnOmslag(args: {
  iDag: Map<string, number>;
  iGar: Map<string, number>;
  lavesteUke: Map<string, number>;
}): Omslag[] {
  const omslag: Omslag[] = [];
  for (const [region, til] of args.iDag) {
    const iGar = args.iGar.get(region);
    if (iGar === undefined) continue; // uten gårsdag finnes ingen flanke — samme regel som decision.ts
    if (til < VARSEL_MIN_SCORE || iGar >= VARSEL_MIN_SCORE) continue;
    const bunn = args.lavesteUke.get(region) ?? til;
    if (til - bunn < VARSEL_MIN_OKNING) continue;
    omslag.push({ region, fra: bunn, til });
  }
  return omslag.sort((a, b) => b.til - a.til);
}

const FORBEHOLD = 'Vær + sesong for et område — ikke en lovnad om skogen der du står.';
const FASIT_LOVNAD = 'Fasit publiseres når funnene er inne. 🍄';

/** Omslagsposten: «det snudde i natt» — dagens nyhet, når den finnes. */
export function byggOmslagsPost(omslag: Omslag[]): string | null {
  if (omslag.length === 0) return null;

  let hode: string;
  if (omslag.length === 1) {
    const o = omslag[0];
    hode = `Soppvarselet slo ut i natt: forholdene i ${o.region} snudde — fra ${o.fra} til ${o.til} av 100 siste uka.`;
  } else {
    const navngitte = omslag.slice(0, MAKS_REGIONER).map((o, i) => `${o.region} (${o.fra}→${o.til}${i === 0 ? ' av 100' : ''})`);
    const rest = omslag.length - MAKS_REGIONER;
    const liste =
      navngitte.length > 1
        ? `${navngitte.slice(0, -1).join(', ')} og ${navngitte[navngitte.length - 1]}`
        : navngitte[0];
    hode = `Soppvarselet slo ut i natt: ${liste}${rest > 0 ? `, og ${rest} til` : ''}.`;
  }

  return kuttTilMaks([hode, FORBEHOLD, FASIT_LOVNAD]);
}

export interface UkensTopp {
  region: string;
  score: number;
}

export interface UkensFasit {
  region: string;
  /** Varseldatoen (ÅÅÅÅ-MM-DD). */
  dato: string;
  ukenEtter: number;
  ukenFor: number;
}

/** Søndagsposten: ukas beste områder + fasit for et modent varsel når vi har en. */
export function byggUkesPost(topp: UkensTopp[], fasit: UkensFasit | null): string | null {
  if (topp.length === 0) return null;

  const navngitte = topp.slice(0, MAKS_REGIONER).map((t, i) => `${t.region} (${t.score}${i === 0 ? ' av 100' : ''})`);
  const liste =
    navngitte.length > 1
      ? `${navngitte.slice(0, -1).join(', ')} og ${navngitte[navngitte.length - 1]}`
      : navngitte[0];

  const deler = [
    `Ukas soppforhold: best an ligger ${liste}.`,
    'Regnet ut hver natt fra nedbør, jordfuktighet, temperatur og sesong.'
  ];
  if (fasit) {
    deler.push(
      `Fasit for varselet i ${fasit.region} ${fasitDato(fasit.dato, 'nb')}: ${fasit.ukenEtter} funn uken etter, mot ${fasit.ukenFor} uken før.`
    );
  }
  return kuttTilMaks(deler);
}

/**
 * Sett sammen delene og kutt bakfra-i-midten til teksten passer: første del
 * (selve påstanden) ryker aldri, pynten ryker i rekkefølgen minst viktig
 * først. Passer ikke engang påstanden alene, kappes den hardt — det skal i
 * praksis ikke skje (3 navngitte regioner er godt under grensen), men en
 * avvist post kl. 05:30 er verre enn en amputert.
 */
function kuttTilMaks(deler: string[]): string {
  const kandidater: string[][] = [];
  for (let n = deler.length; n >= 1; n -= 1) kandidater.push(deler.slice(0, n));
  // Behold alltid siste del (fasitlovnaden/fasiten) om mulig: påstand + fasit
  // er viktigere enn påstand + forbehold når bare én av dem får plass.
  if (deler.length >= 3) kandidater.splice(1, 0, [deler[0], deler[deler.length - 1]]);

  for (const valg of kandidater) {
    const tekst = valg.join(' ');
    if (vektetLengde(tekst) <= MAKS_TEGN) return tekst;
  }
  return [...deler[0]].slice(0, MAKS_TEGN / 2).join('');
}

/**
 * X teller ikke tegn — de teller VEKT: kodepunkter i noen få lave områder
 * (latin med æøå, vanlig tegnsetting) veier 1, alt annet (piler, emoji) veier
 * 2. «→» og «🍄» koster altså dobbelt. Områdene under er fra X sin publiserte
 * twitter-text-konfigurasjon (v3).
 */
export function vektetLengde(tekst: string): number {
  let sum = 0;
  for (const tegn of tekst) {
    const cp = tegn.codePointAt(0) ?? 0;
    const lett =
      cp <= 4351 || (cp >= 8192 && cp <= 8205) || (cp >= 8208 && cp <= 8223) || (cp >= 8242 && cp <= 8247);
    sum += lett ? 1 : 2;
  }
  return sum;
}
