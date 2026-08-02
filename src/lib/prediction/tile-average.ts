/**
 * Snittet over rutene i et kartutsnitt.
 *
 * Dette VAR et «konfidensvektet snitt». Vekten kom fra `prediction_tiles
 * .confidence`, som var hardkodet til 70 i hver eneste rad — altså en konstant,
 * altså et helt vanlig snitt med ekstra trinn. Regnestykket gjorde ikke noe av
 * det navnet lovet.
 *
 * Da confidence-kolonnen fikk ekte innhold (datadekning, se
 * tile-data-coverage.ts) måtte vektingen bort, ikke bli ekte: å la en celle med
 * god datadekning trekke det romlige snittet mer ville vært en ny, uvalidert
 * påstand om HVOR soppen står. Den ærlige romlige AUC-en er ~0,52. Datadekning
 * er et driftstall, ikke en modellvekt.
 *
 * Resultatet er derfor bit-for-bit det brukeren fikk før — bevist i testen ved
 * å kjøre den gamle formelen ved siden av.
 */

export interface AverageableTile {
  score: number;
  components: {
    vegetation?: number;
    moisture?: number;
    terrain?: number;
    history?: number;
  } | null;
}

export interface AveragedTiles {
  score: number;
  vegetation: number;
  moisture: number;
  terrain: number;
  history: number;
}

/**
 * Snitt over ruter (én rad per rute — kall bestTilePerCell først, ellers
 * midler du på tvers av arter). Tom liste gir nuller.
 */
export function averageTiles(cells: AverageableTile[]): AveragedTiles {
  if (cells.length === 0) {
    return { score: 0, vegetation: 0, moisture: 0, terrain: 0, history: 0 };
  }

  const totals = cells.reduce(
    (acc, tile) => {
      acc.score += tile.score;
      acc.vegetation += Number(tile.components?.vegetation ?? 0);
      acc.moisture += Number(tile.components?.moisture ?? 0);
      acc.terrain += Number(tile.components?.terrain ?? 0);
      acc.history += Number(tile.components?.history ?? 0);
      return acc;
    },
    { score: 0, vegetation: 0, moisture: 0, terrain: 0, history: 0 }
  );

  const n = cells.length;
  return {
    score: Math.round(totals.score / n),
    vegetation: Math.round(totals.vegetation / n),
    moisture: Math.round(totals.moisture / n),
    terrain: Math.round(totals.terrain / n),
    history: Math.round(totals.history / n)
  };
}
