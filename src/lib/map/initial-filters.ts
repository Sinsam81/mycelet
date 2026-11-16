/**
 * Kartets filtre: hva de starter på, og hva som skjer når «Kun mine funn» slås
 * av og på.
 *
 * HVORFOR
 * Kartet startet alltid på perioden «denne måneden» — også når det ble åpnet
 * for å vise brukerens EGNE funn. /mine-steder lenker hit med `mine=1` og
 * lover «egne funn synlige», lagringsflytene gjør det samme rett etter «Funn
 * lagret!», og avkrysningen «Kun mine funn» finnes i filterarket. I alle tre
 * tilfellene ble funnene filtrert på inneværende kalendermåned: 10. november
 * åpnet hvert sted i «Mine steder» til et kart uten en eneste egen markør,
 * selv om kortet nettopp sa «12 funn». Det leses som at funnene er borte, i
 * den ene visningen som skal være brukerens eget hvelv.
 *
 * REGELEN
 * Egne funn er få og brukerens egne — de vises uansett alder. Fellesskapslaget
 * starter fortsatt på «denne måneden»: der er måneden også et serverfilter
 * (`month_filter` i get_findings_in_bounds), og alle andre perioder henter alt
 * i utsnittet. Den standarden røres ikke her.
 *
 * Perioden følger avkrysningen bare i det den slås av eller på. Etterpå er det
 * brukerens valg: den som vil se bare denne månedens egne funn, velger det.
 */

export type MapPeriod = 'month' | '3months' | 'year' | 'all';

export interface MapFilterState {
  speciesId: number | null;
  period: MapPeriod;
  onlyMine: boolean;
}

/** Perioden fellesskapslaget starter på. */
export const DEFAULT_PERIOD: MapPeriod = 'month';
/** Perioden egne funn vises med: alle. */
export const OWN_FINDINGS_PERIOD: MapPeriod = 'all';

/** Perioden som er «ingenting valgt» i den modusen kartet står i. */
export function defaultPeriodFor(onlyMine: boolean): MapPeriod {
  return onlyMine ? OWN_FINDINGS_PERIOD : DEFAULT_PERIOD;
}

export function initialMapFilters({
  startWithOnlyMine,
  speciesId
}: {
  startWithOnlyMine: boolean;
  speciesId: number | null;
}): MapFilterState {
  return { speciesId, period: defaultPeriodFor(startWithOnlyMine), onlyMine: startWithOnlyMine };
}

/**
 * Neste filtertilstand, med perioden rettet når «Kun mine funn» nettopp ble
 * slått på eller av.
 *
 *  - PÅ: perioden blir «alle», uansett hva den sto på. Poenget med
 *    avkrysningen er å se funnene sine; et backdatert privat funn som nettopp
 *    er lagret, skal ikke forsvinne bak «denne måneden».
 *  - AV: sto perioden fortsatt på «alle», går den tilbake til fellesskapets
 *    standard, så av/på ender der brukeren startet. Har brukeren selv valgt
 *    noe smalere i mellomtiden, står det.
 *
 * Alle endringer av filtrene går gjennom denne (se setFilters i MushroomMap),
 * så ingen kallsted kan glemme regelen.
 */
export function nextMapFilters(previous: MapFilterState, next: MapFilterState): MapFilterState {
  if (next.onlyMine && !previous.onlyMine) return { ...next, period: OWN_FINDINGS_PERIOD };
  if (!next.onlyMine && previous.onlyMine && next.period === OWN_FINDINGS_PERIOD) {
    return { ...next, period: DEFAULT_PERIOD };
  }
  return next;
}

/**
 * Tallet på filterknappen. Perioden teller bare når den avviker fra standarden
 * for modusen: før sto det «1» på et kart ingen hadde rørt, fordi
 * standardperioden selv ble regnet som et aktivt filter.
 */
export function activeFilterCount(filters: MapFilterState): number {
  return (
    Number(Boolean(filters.speciesId)) +
    Number(filters.period !== defaultPeriodFor(filters.onlyMine)) +
    Number(filters.onlyMine)
  );
}
