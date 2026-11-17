import { osloDag } from '@/lib/bruk/bruksdag';
import { sesongtilstand } from '@/lib/sesong/sesongtilstand';

/**
 * «Sesongen din 2026» — en liten oppsummering av brukerens EGNE registrerte
 * funn, vist på forsiden når sesongen er på hell eller over.
 *
 * ── HVORFOR DEN FINNES ──────────────────────────────────────────────────────
 *
 * Fra november til mars viste «Dine funn» på forsiden to livstidstall og
 * ingenting om sesongen som nettopp var. Det er månedene et årskort kjøpt i
 * september blir glemt. Dette er det minste som er sant og verdt å åpne appen
 * for om vinteren: det du selv la inn.
 *
 * ── REGLENE ─────────────────────────────────────────────────────────────────
 *
 *  · SESONGÅRET går fra april til mars. Januar–mars hører til året før — uten
 *    det ble kortet tomt 1. januar, midt i perioden det er laget for.
 *  · Datoer regnes i Oslo-tid (samme sone i Norge og Sverige), ikke UTC: et
 *    funn lagt inn 31. mars 23:30 UTC ligger i april i Oslo, altså i neste
 *    sesong.
 *  · `found_at` settes av databasen når funnet lagres (DEFAULT NOW()). Det er
 *    REGISTRERINGSDAGEN, ikke nødvendigvis dagen soppen ble plukket. Teksten
 *    rundt skal derfor si «registrert», aldri «funnet 14. august».
 *  · Arter: bare funn med art fra katalogen (species_id). Funn med egen
 *    artstekst teller som funn, ikke som art — som i livstidstallene.
 *  · «Oftest» krever at én art står alene øverst med minst to funn. Står to
 *    arter likt, eller har alle ett funn hver, finnes det ingen «oftest», og da
 *    sies ingenting.
 *  · En avkortet liste gir INGEN oppsummering. PostgREST kapper på 1000 rader
 *    uten å si fra; rekker ikke de nyeste 1000 tilbake til sesongens start, er
 *    «første funn» og antallet feil, og en feil oppsummering er verre enn
 *    ingen.
 *
 * Ingenting her sier noe om hva som finnes i skogen, og ingenting om
 * spiselighet. Det er brukerens egen logg, lest opp.
 *
 * Ren og uten skjulte klokker: tidspunktet sendes inn.
 */

export interface FunnForOppsummering {
  species_id: number | null;
  found_at: string | null;
}

export interface Sesongoppsummering {
  /** Året sesongen begynte: vinteren 2026–27 hører til 2026. */
  aar: number;
  /** Funn registrert i sesongåret. */
  funn: number;
  /** Ulike arter fra katalogen blant dem. */
  arter: number;
  /** Første og siste registreringsdag, Oslo-tid, «ÅÅÅÅ-MM-DD». */
  forste: string;
  siste: string;
  /** Arten som står alene øverst med minst to funn — ellers null. */
  oftest: { speciesId: number; antall: number } | null;
}

/** Sesongåret en Oslo-dato («ÅÅÅÅ-MM-DD») hører til. Januar–mars hører til året før. */
export function sesongaarForDato(osloDato: string): number {
  const aar = Number(osloDato.slice(0, 4));
  const maaned = Number(osloDato.slice(5, 7));
  return maaned <= 3 ? aar - 1 : aar;
}

/** Sesongåret vi er i nå. */
export function sesongaar(naa: Date): number {
  return sesongaarForDato(sesongtilstand(naa).osloDato);
}

/**
 * Vises oppsummeringen nå? November–mars: ettersesongen og vinteren i
 * sesongtilstand.ts. Fra april handler forsiden om vårsoppene og den nye
 * sesongen, og «Dine funn» viser livstidstallene igjen.
 */
export function erOppsummeringstid(naa: Date): boolean {
  const { fase } = sesongtilstand(naa);
  return fase === 'ettersesong' || fase === 'vinter';
}

/** Oslo-datoen for et lagret tidspunkt, eller null når det mangler eller ikke lar seg lese. */
function osloDatoFor(tidspunkt: string | null): string | null {
  if (!tidspunkt) return null;
  const dato = new Date(tidspunkt);
  return Number.isNaN(dato.getTime()) ? null : osloDag(dato);
}

/**
 * @param rader brukerens funn (ikke negative observasjoner, ikke slettede)
 * @param naa tidspunktet oppsummeringen lages for
 * @param valg.avkortet lista traff radtaket — den kan mangle de eldste funnene
 * @returns null når sesongåret ikke har ett eneste funn, eller når lista er
 *   avkortet inne i sesongen. Et «0 funn»-kort er verre enn ikke noe kort.
 */
export function sesongoppsummering(
  rader: readonly FunnForOppsummering[],
  naa: Date,
  valg: { avkortet?: boolean } = {}
): Sesongoppsummering | null {
  const aar = sesongaar(naa);

  const datoer: string[] = [];
  const perArt = new Map<number, number>();
  /** Den eldste raden vi fikk, uansett sesong — avgjør om et radtak kuttet inne i sesongen. */
  let eldste: string | null = null;

  for (const rad of rader) {
    const dato = osloDatoFor(rad.found_at);
    if (!dato) continue;
    if (eldste === null || dato < eldste) eldste = dato;
    if (sesongaarForDato(dato) !== aar) continue;
    datoer.push(dato);
    if (rad.species_id != null) perArt.set(rad.species_id, (perArt.get(rad.species_id) ?? 0) + 1);
  }

  if (datoer.length === 0) return null;
  // Radtaket ble truffet, og selv den eldste raden vi fikk ligger i denne
  // sesongen (eller senere): da kan det finnes eldre funn fra samme sesong vi
  // aldri så.
  if (valg.avkortet && eldste !== null && sesongaarForDato(eldste) >= aar) return null;

  // «ÅÅÅÅ-MM-DD» sorterer riktig som tekst.
  datoer.sort();

  let oftest: Sesongoppsummering['oftest'] = null;
  let delt = false;
  for (const [speciesId, antall] of perArt) {
    if (!oftest || antall > oftest.antall) {
      oftest = { speciesId, antall };
      delt = false;
    } else if (antall === oftest.antall) {
      delt = true;
    }
  }
  if (!oftest || delt || oftest.antall < 2) oftest = null;

  return {
    aar,
    funn: datoer.length,
    arter: perArt.size,
    forste: datoer[0],
    siste: datoer[datoer.length - 1],
    oftest
  };
}
