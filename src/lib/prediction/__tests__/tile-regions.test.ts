import { describe, expect, it } from 'vitest';
import { PREDICTION_TILE_REGIONS, predictionTileGridCells } from '../tile-regions';
import { getRegion } from '@/lib/utils/region';

/**
 * Denne lista ER hele dekningen til det forhåndsberegnede rasteret. Utenfor
 * rutene faller /api/prediction til `computed_fallback`, som svarer men
 * returnerer NULL søkeområder.
 *
 * Målt mot produksjon 2026-08-02: Oslo og Trondheim ga 3 områder hver, Göteborg
 * og Tromsø ga 0. Lista inneholdt bare fem norske byregioner, mens databasen har
 * 227 496 svenske funn og appen selger i Sverige. En svensk bruker fikk altså et
 * tomt kart — ikke fordi dataene manglet, men fordi lista ikke nevnte landet.
 */
describe('PREDICTION_TILE_REGIONS', () => {
  it('dekker begge landene appen selger i', () => {
    const land = new Set(
      PREDICTION_TILE_REGIONS.map((r) =>
        getRegion((r.minLat + r.maxLat) / 2, (r.minLng + r.maxLng) / 2)
      )
    );
    expect(land.has('NO'), 'Norge må være dekket').toBe(true);
    expect(land.has('SE'), 'Sverige må være dekket — 227 496 funn og betalende brukere').toBe(true);
  });

  it('gir hver region minst én rute', () => {
    for (const r of PREDICTION_TILE_REGIONS) {
      expect(predictionTileGridCells(r).length, r.name).toBeGreaterThan(0);
    }
  });

  it('har ruter som faktisk ligger inne i sin egen boks', () => {
    for (const r of PREDICTION_TILE_REGIONS) {
      for (const c of predictionTileGridCells(r)) {
        expect(c.lat, r.name).toBeGreaterThanOrEqual(r.minLat);
        expect(c.lat, r.name).toBeLessThanOrEqual(r.maxLat + r.step);
        expect(c.lng, r.name).toBeGreaterThanOrEqual(r.minLng);
        expect(c.lng, r.name).toBeLessThanOrEqual(r.maxLng + r.step);
      }
    }
  });

  it('har unike navn — navnet er filteret cron-en tar imot', () => {
    const navn = PREDICTION_TILE_REGIONS.map((r) => r.name);
    expect(new Set(navn).size).toBe(navn.length);
  });

  it('merker hver region med riktig land — landet styrer hvilken cron som tar den', () => {
    for (const r of PREDICTION_TILE_REGIONS) {
      const geografisk = getRegion((r.minLat + r.maxLat) / 2, (r.minLng + r.maxLng) / 2);
      expect(r.country, `${r.name} er merket ${r.country} men ligger i ${geografisk}`).toBe(geografisk);
    }
  });

  it('lar hvert land kjøres for seg innenfor maxDuration', () => {
    // Målt 2026-08-03 med 5 samtidige oppslag: CORINE (SE) 329 ms/rute,
    // SR16 (NO) 29 ms/rute. maxDuration er 300 s, og værkall + skriving kommer
    // i tillegg, så hvert lands skogoppslag alene må ligge godt under.
    const MS = { NO: 29, SE: 329 } as const;
    for (const land of ['NO', 'SE'] as const) {
      const ruter = PREDICTION_TILE_REGIONS.filter((r) => r.country === land)
        .reduce((n, r) => n + predictionTileGridCells(r).length, 0);
      const sekunder = (ruter * MS[land]) / 1000;
      expect(ruter, `${land} må ha regioner`).toBeGreaterThan(0);
      expect(sekunder, `${land}: ${ruter} ruter ≈ ${Math.round(sekunder)} s skogoppslag`).toBeLessThan(150);
    }
  });

  it('har regioner i begge land, så en sletting ikke går ubemerket', () => {
    // Det finnes bevisst INGEN grense på totalen. Landene kjøres hver for seg
    // (se vercel.json), så det som faktisk begrenser er kjøretiden PER LAND —
    // og den vokter testen over. En totalgrense ville bare hindret at billige
    // norske regioner ble lagt til, uten å beskytte mot noe.
    for (const land of ['NO', 'SE'] as const) {
      const n = PREDICTION_TILE_REGIONS.filter((r) => r.country === land).length;
      expect(n, `${land} må ha regioner`).toBeGreaterThanOrEqual(5);
    }
  });
});
