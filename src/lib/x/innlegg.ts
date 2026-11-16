import { VARSEL_MIN_OKNING, VARSEL_MIN_SCORE } from '@/lib/alerts/decision';
import { fasitDato } from '@/lib/alerts/email';
import { lesRegionHistorikk } from '@/lib/alerts/historikk';
import { REGION_CONDITION_THRESHOLDS } from '@/lib/prediction/region-score';

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
  /**
   * Satt (true) når «i går» ble hentet over et hull i historikken — se
   * src/lib/alerts/historikk.ts. Da vet vi AT det snudde, et sted i et vindu
   * på to–tre døgn, men ikke hvilken natt. Tekster som bygges av omslaget skal
   * ikke si «i natt» om et slikt. Utelatt når gårsdagen var målt.
   */
  brobygd?: boolean;
}

/** Det finnOmslag trenger, lest fra regionenes lagrede dagsscorer. */
export interface Omslagsgrunnlag {
  iDag: Map<string, number>;
  iGar: Map<string, number>;
  lavesteUke: Map<string, number>;
  /** Regioner der «i går» ble hentet over et hull — se Omslag.brobygd. */
  brobygde: Set<string>;
}

/**
 * Fra lagrede dagsscorer (region → dato → score) til «i dag», «i går» og ukas
 * bunn for dagen `tileDate`.
 *
 * «I går» og bunnen leses med lesRegionHistorikk — SAMME funksjon som
 * e-postvarselet bruker. Det er hele poenget: X-posteren leste før bare raden
 * for nøyaktig datoen før, så én natt uten lagrede scorer (flisgenereringen
 * eller 05:00-jobben feilet) ga ingen «i går» på omslagsdagen, og dagen etter
 * var det «allerede bra». E-posten gikk ut — den brobygger hullet — mens X
 * tidde, og bunnteksten i e-posten sier at omslagene også publiseres åpent
 * der. De to kanalene skal fyre på samme omslag eller tie sammen.
 *
 * Bare regioner med score for `tileDate` tas med: uten dagens tall finnes
 * ingenting å vurdere.
 */
export function lesOmslagsgrunnlag(
  scorePerRegion: ReadonlyMap<string, ReadonlyMap<string, number>>,
  tileDate: string
): Omslagsgrunnlag {
  const grunnlag: Omslagsgrunnlag = { iDag: new Map(), iGar: new Map(), lavesteUke: new Map(), brobygde: new Set() };
  for (const [region, datoer] of scorePerRegion) {
    const iDag = datoer.get(tileDate);
    if (iDag === undefined) continue;
    grunnlag.iDag.set(region, iDag);
    const lest = lesRegionHistorikk(datoer, tileDate);
    if (lest.scoreIGar !== null) grunnlag.iGar.set(region, lest.scoreIGar);
    if (lest.lavesteSisteUke !== null) grunnlag.lavesteUke.set(region, lest.lavesteSisteUke);
    if (lest.hullDager > 0) grunnlag.brobygde.add(region);
  }
  return grunnlag;
}

/**
 * Regionens omslag under→over terskelen, med samme krav som e-postvarselet:
 * i går under, i dag over, og bedringen målt mot ukas bunn må være reell.
 * (Karantenen i decision.ts er per abonnent og gjelder ikke her — en flanke
 * kan per definisjon ikke fyre to dager på rad.)
 *
 * «I går» er forrige MÅLTE dag — se lesOmslagsgrunnlag. Regioner i `brobygde`
 * fikk den hentet over et hull, og omslaget merkes da `brobygd`.
 */
export function finnOmslag(args: {
  iDag: Map<string, number>;
  iGar: Map<string, number>;
  lavesteUke: Map<string, number>;
  brobygde?: ReadonlySet<string>;
}): Omslag[] {
  const omslag: Omslag[] = [];
  for (const [region, til] of args.iDag) {
    const iGar = args.iGar.get(region);
    if (iGar === undefined) continue; // uten gårsdag finnes ingen flanke — samme regel som decision.ts
    if (til < VARSEL_MIN_SCORE || iGar >= VARSEL_MIN_SCORE) continue;
    const bunn = args.lavesteUke.get(region) ?? til;
    if (til - bunn < VARSEL_MIN_OKNING) continue;
    omslag.push({ region, fra: bunn, til, ...(args.brobygde?.has(region) ? { brobygd: true } : {}) });
  }
  return omslag.sort((a, b) => b.til - a.til);
}

const FORBEHOLD = 'Vær + sesong for et område — ikke en lovnad om skogen der du står.';
const FASIT_LOVNAD = 'Fasit publiseres når funnene er inne. 🍄';

/**
 * Omslagsposten: «det snudde i natt» — dagens nyhet, når den finnes.
 *
 * «i natt» står der bare når HVERT omslag i posten er målt mot gårsdagen. Er
 * ett av dem brobygd over et hull (Omslag.brobygd), vet vi at det snudde, men
 * ikke hvilken natt — da sier posten bare at varselet slo ut. Regelen gjelder
 * hele posten, også regionene som bare telles («og N til»).
 *
 * Tar bevisst ingen tekstlinje utenfra: et år-mot-år-tall fra
 * registreringsdata skal aldri ut til kunder (se «Rapportpuls» i CLAUDE.md).
 */
export function byggOmslagsPost(omslag: Omslag[]): string | null {
  if (omslag.length === 0) return null;

  const naar = omslag.some((o) => o.brobygd) ? '' : ' i natt';

  let hode: string;
  if (omslag.length === 1) {
    const o = omslag[0];
    hode = `Soppvarselet slo ut${naar}: forholdene i ${o.region} snudde — fra ${o.fra} til ${o.til} av 100 siste uka.`;
  } else {
    const navngitte = omslag.slice(0, MAKS_REGIONER).map((o, i) => `${o.region} (${o.fra}→${o.til}${i === 0 ? ' av 100' : ''})`);
    const rest = omslag.length - MAKS_REGIONER;
    const liste =
      navngitte.length > 1
        ? `${navngitte.slice(0, -1).join(', ')} og ${navngitte[navngitte.length - 1]}`
        : navngitte[0];
    hode = `Soppvarselet slo ut${naar}: ${liste}${rest > 0 ? `, og ${rest} til` : ''}.`;
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
  // Ingenting verdt å si → ingen post. Uten denne porten gikk «Ukas
  // soppforhold: best an ligger Bergen (4 av 100) …» ut hver søndag hele
  // vinteren: eneste vilkår var at lista ikke var tom. Under medianen for et
  // regiondøgn finnes det ikke noe «best an» å hevde, og taushet slår et
  // ukentlig «4 av 100» på en kanal som lever av etterprøvbare påstander.
  //
  // Terskelen er REGIONSTIGENS `moderate` — aldri et tall skrevet inn her og
  // aldri punktskalaens FORECAST_*-bånd (se «Three distributions» i CLAUDE.md).
  // Maks, ikke topp[0], så funksjonen ikke avhenger av kallerens sortering.
  //
  // Kjent følge: en middelmådig søndag MIDT i sesongen blir også stille, og en
  // fasit som modnes etter at tallene har falt, kommer ikke på X (den står
  // fortsatt på /apenhet). En egen fasit-post er ny offentlig tekst og en
  // eierbeslutning.
  if (Math.max(...topp.map((t) => t.score)) < REGION_CONDITION_THRESHOLDS.moderate) return null;

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
