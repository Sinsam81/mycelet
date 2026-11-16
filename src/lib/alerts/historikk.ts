import { VARSEL_MIN_SCORE } from './decision';

/**
 * Fra regionens lagrede dagsscorer til det skalVarsle() trenger: «i går»,
 * ukas bunn og datoen for siste omslag.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ÉN MANGLENDE DAG SKAL IKKE SVELGE ET HELT OMSLAG
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * region_daily_scores skrives bare når varsel-cronen selv kjører og regionen
 * har fliser den natta. Feiler flisgenereringen én natt (nettopp når NIBIO og
 * CORINE er trege), eller lagringen, mangler raden for den dagen. To regler
 * som hver for seg var fornuftige ga da til sammen et tapt varsel:
 *
 *   dag D    «i går» fantes ikke            → 'ingen-gaardag', ingen e-post
 *   dag D+1  i går var bra, og omslaget     → 'var-allerede-bra' resten av
 *            (D−2 → D) var ikke «nabodager»   syklusen
 *
 * Ingen abonnenter i regionen fikk varselet for den oppturen, og stillheten
 * var umulig å skille fra «det snudde ikke». Varselet er hele produktløftet.
 *
 * Derfor brobygges hull på inntil MAKS_HULL_DAGER dager:
 *
 *   · «i går» er nyeste MÅLTE dag før i dag, inntil MAKS_HULL_DAGER + 1 dager
 *     tilbake (forrigeMaalteDag)
 *   · et omslag er to målte dager — under terskelen, så over — med høyst
 *     MAKS_HULL_DAGER umålte dager imellom (sisteOmslag)
 *
 * Det er ikke gjetting: under terskelen på D−2 og over på D ER en kryssing et
 * sted i det vinduet. Vi vet bare ikke hvilken av dagene. Et lengre hull
 * forblir manglende data — da tier vi, som før.
 *
 * Og vi brobygger aldri TIL et omslag: var forrige målte dag over terskelen,
 * er svaret «var allerede bra», selv om den umålte dagen imellom kan ha vært
 * under. Det ville vært å gjette.
 *
 * ⚠️ Dette løsner ingenting i skalVarsle(): terskelen, økningskravet mot ukas
 * bunn og karantenen står urørt, så det blir fortsatt høyst én e-post per
 * syklus. Ukas bunn regnes over færre dager når noen mangler, og kan da bare
 * bli høyere — kravet blir strengere, aldri slakkere.
 *
 * ⚠️ Fyll ALDRI hullene i tabellen med interpolerte tall. Tabellen leses av
 * kalibreringen (scripts/kalibrer-regionterskler.mjs), og et oppdiktet tall
 * der ville flyttet tersklene.
 */

/** Så mange umålte dager kan ligge mellom to målte før hullet regnes som manglende data. */
export const MAKS_HULL_DAGER = 2;

/**
 * Vinduet for ukas bunn: så mange DATOER, i dag medregnet. Samme definisjon
 * som decision.ts («de siste sju dagene (i dag medregnet)») og sesongtesten
 * (`scorer.slice(d - 6, d + 1)`). Trekk derfor fra HISTORIKK_DAGER − 1 når
 * startdatoen regnes ut — å trekke fra 7 gir et vindu på åtte datoer.
 */
export const HISTORIKK_DAGER = 7;

const DAG_MS = 86_400_000;

/** Datoene er rene ÅÅÅÅ-MM-DD (tile_date) — alt regnes i UTC, uten sommertid å snuble i. */
function dagMs(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`);
}

export interface MaaltDag {
  dato: string;
  score: number;
  /** Umålte dager mellom denne og dagen den ble slått opp for. 0 = dagen rett før. */
  hullDager: number;
}

/**
 * Nyeste målte dag strengt FØR `tileDate`, høyst `maksHullDager` umålte dager
 * unna. null når ingen finnes — da vet vi ikke hva det var «i går».
 */
export function forrigeMaalteDag(
  datoer: ReadonlyMap<string, number>,
  tileDate: string,
  maksHullDager: number = MAKS_HULL_DAGER
): MaaltDag | null {
  const iDag = dagMs(tileDate);
  let beste: MaaltDag | null = null;
  let besteMs = -Infinity;
  for (const [dato, score] of datoer) {
    const t = dagMs(dato);
    const avstand = iDag - t;
    // NaN (ugyldig dato) faller ut av begge sammenligningene.
    if (!(avstand > 0 && avstand <= (maksHullDager + 1) * DAG_MS)) continue;
    if (t > besteMs) {
      besteMs = t;
      beste = { dato, score, hullDager: Math.round(avstand / DAG_MS) - 1 };
    }
  }
  return beste;
}

/**
 * Datoen for siste omslag under→over terskelen blant de målte dagene, eller
 * null. Datoen er dagen som var OVER — den første vi vet at det var bra.
 * decision.ts bruker den til å hente inn igjen varsler som feilet på selve
 * omslagsdagen (regel 3).
 */
export function sisteOmslag(
  datoer: ReadonlyMap<string, number>,
  terskel: number = VARSEL_MIN_SCORE,
  maksHullDager: number = MAKS_HULL_DAGER
): string | null {
  const sortert = [...datoer.keys()].sort();
  let siste: string | null = null;
  for (let i = 1; i < sortert.length; i += 1) {
    const avstand = dagMs(sortert[i]) - dagMs(sortert[i - 1]);
    // Lengre hull enn vi brobygger: manglende data, ikke et omslag.
    if (!(avstand > 0 && avstand <= (maksHullDager + 1) * DAG_MS)) continue;
    const forrige = datoer.get(sortert[i - 1]);
    const denne = datoer.get(sortert[i]);
    if (forrige !== undefined && denne !== undefined && forrige < terskel && denne >= terskel) {
      siste = sortert[i];
    }
  }
  return siste;
}

export interface RegionHistorikk {
  /** Scoren forrige målte dag (normalt i går), eller null — se forrigeMaalteDag. */
  scoreIGar: number | null;
  /** Hvor mange umålte dager «i går» ble hentet over. 0 = gårsdagen fantes. */
  hullDager: number;
  /** Laveste målte score i vinduet, i dag medregnet. null når vinduet er tomt. */
  lavesteSisteUke: number | null;
  /** Siste omslag i vinduet (ÅÅÅÅ-MM-DD), eller null. */
  sisteOmslagIso: string | null;
}

/**
 * Alt cronen trenger fra én regions dagsscorer, for dagen `tileDate`.
 *
 * `datoer` kan gjerne inneholde mer enn vinduet (og dagens egen rad): bare de
 * HISTORIKK_DAGER siste datoene til og med `tileDate` leses, så testene kan
 * sende inn en hel sesong og cronen akkurat det den hentet.
 */
export function lesRegionHistorikk(
  datoer: ReadonlyMap<string, number>,
  tileDate: string,
  terskel: number = VARSEL_MIN_SCORE
): RegionHistorikk {
  const iDag = dagMs(tileDate);
  const vindu = new Map<string, number>();
  for (const [dato, score] of datoer) {
    const avstand = iDag - dagMs(dato);
    if (avstand >= 0 && avstand <= (HISTORIKK_DAGER - 1) * DAG_MS) vindu.set(dato, score);
  }

  const forrige = forrigeMaalteDag(vindu, tileDate);
  return {
    scoreIGar: forrige?.score ?? null,
    hullDager: forrige?.hullDager ?? 0,
    lavesteSisteUke: vindu.size > 0 ? Math.min(...vindu.values()) : null,
    sisteOmslagIso: sisteOmslag(vindu, terskel)
  };
}
