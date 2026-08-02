import { describe, expect, it } from 'vitest';
import { averageTiles, type AverageableTile } from '../tile-average';

/**
 * Den GAMLE formelen fra src/app/api/prediction/route.ts, kopiert ordrett.
 * Den står her for å bevise at fjerningen av vektingen ikke flyttet et eneste
 * tall for dataene som faktisk ligger i basen — der confidence var 70 overalt.
 */
function legacyWeightedAverage(cells: Array<AverageableTile & { confidence: number | null }>) {
  const totals = cells.reduce(
    (acc, tile) => {
      const confidenceWeight = Math.max(0.2, (tile.confidence ?? 50) / 100);
      acc.weightSum += confidenceWeight;
      acc.scoreSum += tile.score * confidenceWeight;
      acc.vegetationSum += Number(tile.components?.vegetation ?? 0) * confidenceWeight;
      acc.moistureSum += Number(tile.components?.moisture ?? 0) * confidenceWeight;
      acc.terrainSum += Number(tile.components?.terrain ?? 0) * confidenceWeight;
      acc.historySum += Number(tile.components?.history ?? 0) * confidenceWeight;
      return acc;
    },
    { scoreSum: 0, vegetationSum: 0, moistureSum: 0, terrainSum: 0, historySum: 0, weightSum: 0 }
  );
  const weightSum = totals.weightSum || 1;
  return {
    score: Math.round(totals.scoreSum / weightSum),
    vegetation: Math.round(totals.vegetationSum / weightSum),
    moisture: Math.round(totals.moistureSum / weightSum),
    terrain: Math.round(totals.terrainSum / weightSum),
    history: Math.round(totals.historySum / weightSum)
  };
}

const CELLS: Array<AverageableTile & { confidence: number | null }> = [
  { score: 60, confidence: 70, components: { vegetation: 71, moisture: 44, terrain: 38, history: 12 } },
  { score: 34, confidence: 70, components: { vegetation: 52, moisture: 61, terrain: 20, history: 3 } },
  { score: 77, confidence: 70, components: { vegetation: 80, moisture: 55, terrain: 41, history: 29 } },
  { score: 12, confidence: 70, components: { vegetation: 19, moisture: 33, terrain: 9 } },
  { score: 55, confidence: 70, components: null }
];

describe('averageTiles', () => {
  it('gir NØYAKTIG samme tall som den gamle vektede formelen på dagens fliser', () => {
    // Alle fliser i produksjon hadde confidence = 70. Vekten var altså en
    // konstant, og «konfidensvektet snitt» var et vanlig snitt.
    expect(averageTiles(CELLS)).toEqual(legacyWeightedAverage(CELLS));
  });

  it('lar IKKE datadekning flytte det romlige snittet', () => {
    // Etter at confidence fikk ekte innhold ville den gamle formelen begynt å
    // vekte cellene ulikt — en ny, uvalidert påstand om HVOR soppen står.
    const varied = CELLS.map((cell, i) => ({ ...cell, confidence: [100, 65, 85, 60, 100][i] }));
    expect(averageTiles(varied)).toEqual(averageTiles(CELLS));
    expect(legacyWeightedAverage(varied)).not.toEqual(legacyWeightedAverage(CELLS));
  });

  it('regner et rent snitt over rutene', () => {
    const result = averageTiles([
      { score: 10, components: { vegetation: 20, moisture: 30, terrain: 40, history: 50 } },
      { score: 30, components: { vegetation: 40, moisture: 50, terrain: 60, history: 70 } }
    ]);
    expect(result).toEqual({ score: 20, vegetation: 30, moisture: 40, terrain: 50, history: 60 });
  });

  it('behandler manglende komponenter som 0, ikke som utelatt', () => {
    const result = averageTiles([
      { score: 40, components: { vegetation: 80 } },
      { score: 40, components: null }
    ]);
    expect(result.vegetation).toBe(40);
    expect(result.history).toBe(0);
  });

  it('gir nuller for tom liste i stedet for NaN', () => {
    expect(averageTiles([])).toEqual({ score: 0, vegetation: 0, moisture: 0, terrain: 0, history: 0 });
  });
});
