/**
 * «⭐ Lovende»: hvor langt skal kartet lete, og hva sier det når det ikke
 * finner noe?
 *
 * HVORFOR
 * Serveren svarer (med rette) med en tom liste når ingen rute når bunngrensen
 * for «lovende» — en granskog i januar scorer 28 av 100. Kartet leste en tom
 * liste som «ingen skog her» og utvidet søket: 5, 10, 20 og 35 km, fire tunge
 * rutenettkall etter hverandre, hvert med opptil fem skogoppslag per rute og
 * hvert på brukerens kvote (10 i minuttet). Så avsluttet det med «prøv å flytte
 * kartet nærmere skog» — til en som sto midt i Nordmarka. Fra sent i oktober
 * til mai var kartets mest synlige knapp både treg og usann om årsaken, og
 * svaret var kjent etter første kall: forholdene er regionale, og å utvide fra
 * 5 til 35 km endrer ikke årstiden.
 *
 * REGELEN
 * Svaret fra serveren sier to ting kartet ikke leste: `coverage` (andelen av
 * rutene som fikk skogdata) og `bestScore` (den beste ruta, også når den ikke
 * når opp). Ut fra dem:
 *
 *  - Lite skogdata (jorde, by, sjø): utvid som før. Det er dette utvidelsen
 *    ble laget for.
 *  - Skog, og den beste ruta langt under grensen: stopp med en gang, og si at
 *    det er forholdene. Ett kall.
 *  - Skog, og den beste ruta nær grensen: hopp rett til den største radiusen.
 *    I skuldersesongen (oktober, mai) skiller vær og høyde seg over 35 km —
 *    kyst mot innland, lavland mot fjell — så der kan det finnes noe. Høyst
 *    to kall.
 *  - Serveren HAR lovende ruter, men ingen innenfor radiusen (rutenettet
 *    dekker boksen, så hjørnene ligger utenfor sirkelen): utvid som før.
 *
 * Avgjørelsen tas på serverens rå liste, ikke på det som er igjen etter at
 * hjørnene er kuttet bort.
 *
 * Mangler tallene (et eldre svar, eller skogoppslag som ble avbrutt så
 * dekningen ser lav ut), faller alt tilbake til å utvide — den trygge retningen.
 *
 * Ren funksjon, så reglene kan leses i testen.
 */

import { CONDITION_THRESHOLDS } from '@/lib/utils/prediction';

/**
 * Radiusene søket går gjennom, i km. 35 km holder seg innenfor rutenett-rutas
 * tak på boksen (2·35/111 ≈ 0,63° i bredde, ≤ 1,76° i lengde selv på 69°N).
 */
export const LOVENDE_RADIER_KM = [5, 10, 20, 35] as const;

/** Minst så stor andel av rutene må ha skogdata før vi sier «det er skog her». */
export const MIN_SKOGDEKNING = 0.25;

/**
 * Så nær bunngrensen må den beste ruta ligge for at det er verdt å se lenger
 * unna. Et skjønn, ikke et målt tall: regnet med appens egne formler ligger en
 * granskog på 28 i januar, 34 i mars og 21 i en tørr juni (se rutenett-ruta) —
 * alle mer enn ti poeng under grensen på 50, og der hjelper ingen radius. Det
 * som ligger i 40-årene, er skuldersesong, der 35 km kan gjøre forskjellen.
 */
export const NAER_GRENSEN_POENG = 10;

export type LovendeSteg =
  /** Prøv neste radius. */
  | 'utvid'
  /** Gå rett til den største radiusen. */
  | 'hopp_til_siste'
  /** Stopp: det er skog her, men forholdene er for svake til å love noe. */
  | 'stopp_forhold'
  /** Stopp: vi fant ikke skog å vurdere innen rekkevidde. */
  | 'stopp_ingen_skog';

export interface LovendeSvar {
  /** Var serverens egen liste (`cells`) tom — før hjørnene utenfor radiusen ble kuttet? */
  serverCellsEmpty: boolean;
  /** Andelen av rutene som fikk skogdata (0–1). Null når svaret ikke har den. */
  coverage: number | null | undefined;
  /** Scoren til den beste ruta med skogdata. Null når ingen hadde det, eller svaret ikke har den. */
  bestScore: number | null | undefined;
  /** Hvilken av LOVENDE_RADIER_KM dette svaret gjelder. */
  radiusIndex: number;
  /**
   * Har et TIDLIGERE svar i samme søk vist skog? Etter et hopp til 35 km kan
   * den store boksen ha lav dekning (halve er fjord) selv om skogen rundt
   * brukeren er målt. Da er det fortsatt forholdene, ikke skogen, som mangler.
   */
  skogSettFor?: boolean;
  /** Bunngrensen for «lovende». Standard er den serveren bruker. */
  grense?: number;
}

function tall(verdi: number | null | undefined): number | null {
  return typeof verdi === 'number' && Number.isFinite(verdi) ? verdi : null;
}

/** Viser svaret at det er skog å vurdere her? */
export function harSkogdekning(coverage: number | null | undefined): boolean {
  const dekning = tall(coverage);
  return dekning !== null && dekning >= MIN_SKOGDEKNING;
}

/** Hva gjør søket etter et svar uten lovende områder innenfor radiusen? */
export function nesteSteg({
  serverCellsEmpty,
  coverage,
  bestScore,
  radiusIndex,
  skogSettFor = false,
  grense = CONDITION_THRESHOLDS.moderate
}: LovendeSvar): LovendeSteg {
  const siste = radiusIndex >= LOVENDE_RADIER_KM.length - 1;
  const skogHer = harSkogdekning(coverage);

  if (siste) {
    // Ingen flere radier. Si hva som mangler: har vi sett skog i dette søket,
    // er det forholdene; ellers fant vi ikke skog å vurdere.
    return skogHer || skogSettFor ? 'stopp_forhold' : 'stopp_ingen_skog';
  }

  // Serveren har lovende ruter, de ligger bare utenfor sirkelen. Neste radius
  // tar dem med.
  if (!serverCellsEmpty) return 'utvid';

  // Lite skogdata: jorde, by eller sjø — det utvidelsen er til for.
  if (!skogHer) return 'utvid';

  const beste = tall(bestScore);
  // Uten tallet vet vi ikke hvor langt unna grensen vi er. Som før.
  if (beste === null) return 'utvid';

  return beste < grense - NAER_GRENSEN_POENG ? 'stopp_forhold' : 'hopp_til_siste';
}

/** Radiusindeksen søket fortsetter på etter et steg, eller null når det stopper. */
export function nesteRadiusIndex(steg: LovendeSteg, radiusIndex: number): number | null {
  if (steg === 'utvid') return radiusIndex + 1 < LOVENDE_RADIER_KM.length ? radiusIndex + 1 : null;
  if (steg === 'hopp_til_siste') return LOVENDE_RADIER_KM.length - 1;
  return null;
}
