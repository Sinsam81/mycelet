/**
 * Avgjør om et GBIF-navneoppslag er godt nok til å importere forekomster fra.
 *
 * Skilt ut fra import-gbif-occurrences.mjs fordi dette er regelen som sviktet
 * én gang og forgiftet datagrunnlaget:
 *
 * Sjekken var `matchType !== 'NONE'`. 'Agaricus silvaticus' — en ortografisk
 * variant GBIF ikke fører på artsnivå — slo da gjennom med matchType=HIGHERRANK
 * til usageKey 186, altså HELE KLASSEN Agaricomycetes. Alle skivlingsopper i
 * Norden ble importert som skogsjampinjong: 8 230 rader, på nivå med kantarell
 * (8 399). Fenologikurven for arten ble bygd på de radene.
 *
 * Feilen var stille. Importen så vellykket ut og tallene så friske ut.
 *
 * Regelen nå: bare treff PÅ ARTSNIVÅ godtas. Å importere ingenting for en art
 * er langt bedre enn å importere et annet takson og tro det er arten.
 */

/** @typedef {{ usageKey?: number, matchType?: string, rank?: string, scientificName?: string }} GbifMatch */

/**
 * @param {GbifMatch | null | undefined} match GBIF sitt species/match-svar
 * @returns {{ accept: boolean, usageKey: number | null, reason: string }}
 */
export function evaluateGbifMatch(match) {
  if (!match || !match.usageKey) {
    return { accept: false, usageKey: null, reason: 'ingen usageKey i svaret' };
  }
  if (match.matchType === 'NONE') {
    return { accept: false, usageKey: null, reason: 'GBIF kjenner ikke navnet (matchType=NONE)' };
  }
  // HIGHERRANK betyr at GBIF ga opp på artsnivå og svarte med en slekt, familie
  // eller klasse i stedet. Det er nøyaktig feilen som ga oss 8 230 gale rader.
  if (match.matchType === 'HIGHERRANK') {
    return {
      accept: false,
      usageKey: null,
      reason: `traff kun på høyere rang: ${match.rank} (${match.scientificName})`
    };
  }
  // Belte og bukseseler: selv uten HIGHERRANK skal rangen være SPECIES. Et
  // treff på SUBSPECIES eller VARIETY er heller ikke det vi ba om.
  if (match.rank !== 'SPECIES') {
    return {
      accept: false,
      usageKey: null,
      reason: `rang er ${match.rank}, ikke SPECIES (${match.scientificName})`
    };
  }
  return { accept: true, usageKey: match.usageKey, reason: 'ok' };
}
