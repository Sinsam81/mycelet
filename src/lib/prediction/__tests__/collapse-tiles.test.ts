import { describe, it, expect } from 'vitest';
import { bestTilePerCell } from '../collapse-tiles';

/**
 * Radene under er hentet ut av produksjonsdatabasen 1. august 2026, for boksen
 * som dekker Nesodden. De er ikke oppdiktet: dette er nøyaktig det RPC-en ga
 * kartet den dagen, i den rekkefølgen den ga dem (score DESC).
 *
 * Legg merke til at det bare finnes TO geografiske ruter i hele området, og at
 * begge har sju arter liggende på nøyaktig samme koordinat.
 */
const NESODDEN = [
  { center_lat: 59.78, center_lng: 10.65, score: 60, species_id: 1 }, // Kantarell
  { center_lat: 59.84, center_lng: 10.65, score: 54, species_id: 1 }, // Kantarell
  { center_lat: 59.78, center_lng: 10.65, score: 34, species_id: 7 }, // Piggsopp
  { center_lat: 59.78, center_lng: 10.65, score: 33, species_id: 2 }, // Steinsopp
  { center_lat: 59.84, center_lng: 10.65, score: 18, species_id: 2 }, // Steinsopp
  { center_lat: 59.84, center_lng: 10.65, score: 18, species_id: 7 }, // Piggsopp
  { center_lat: 59.78, center_lng: 10.65, score: 12, species_id: 3 }, // Traktkantarell
  { center_lat: 59.78, center_lng: 10.65, score: 8, species_id: 4 }, // Svart trompetsopp
  { center_lat: 59.84, center_lng: 10.65, score: 7, species_id: 4 }, // Svart trompetsopp
  { center_lat: 59.84, center_lng: 10.65, score: 7, species_id: 3 }, // Traktkantarell
  { center_lat: 59.78, center_lng: 10.65, score: 3, species_id: 20 }, // Spiss morkel
  { center_lat: 59.84, center_lng: 10.65, score: 2, species_id: 20 }, // Spiss morkel
  { center_lat: 59.84, center_lng: 10.65, score: 2, species_id: 19 }, // Vanlig morkel
  { center_lat: 59.78, center_lng: 10.65, score: 2, species_id: 19 } // Vanlig morkel
];

describe('feilen dette ble skrevet for', () => {
  it('fjorten rader er i virkeligheten to steder', () => {
    expect(NESODDEN).toHaveLength(14);
    expect(bestTilePerCell(NESODDEN)).toHaveLength(2);
  });

  it('brukeren så morkelen, ikke kantarellen', () => {
    // Leaflet tegner i den rekkefølgen den får lagene. Med score DESC inn blir
    // den SISTE — altså den laveste — tegnet øverst, og det er den som fanger
    // pekeren. Dette er tallet som faktisk sto på skjermen 1. august.
    const sistTegnetPaSorRuta = [...NESODDEN].filter((t) => t.center_lat === 59.78).at(-1);
    expect(sistTegnetPaSorRuta?.score).toBe(2); // vanlig morkel, i august

    const naa = bestTilePerCell(NESODDEN).find((t) => t.center_lat === 59.78);
    expect(naa?.score).toBe(60); // kantarell
    expect(naa?.species_id).toBe(1);
  });

  it('snittet på tvers av arter var 19 — beste art per rute er 57', () => {
    const snittAlle = NESODDEN.reduce((sum, t) => sum + t.score, 0) / NESODDEN.length;
    expect(Math.round(snittAlle)).toBe(19); // «svake forhold», i kantarellsesongen

    const beste = bestTilePerCell(NESODDEN);
    const snittBeste = beste.reduce((sum, t) => sum + t.score, 0) / beste.length;
    expect(Math.round(snittBeste)).toBe(57);
  });
});

describe('bestTilePerCell', () => {
  it('holder rutene fra hverandre', () => {
    const ut = bestTilePerCell(NESODDEN);
    expect(ut.map((t) => t.center_lat).sort()).toEqual([59.78, 59.84]);
  });

  it('bevarer rekkefølgen inn, så en sortert liste kommer sortert ut', () => {
    const ut = bestTilePerCell(NESODDEN);
    expect(ut.map((t) => t.score)).toEqual([60, 54]);
  });

  it('bryter uavgjort på lavest species_id, ikke på rekkefølge', () => {
    // 18/18 på nordruta i ekte data. Uten en deterministisk regel ville kartet
    // kunne bytte mellom steinsopp og piggsopp for hver panorering.
    const a = bestTilePerCell([
      { center_lat: 59.84, center_lng: 10.65, score: 18, species_id: 7 },
      { center_lat: 59.84, center_lng: 10.65, score: 18, species_id: 2 }
    ]);
    const b = bestTilePerCell([
      { center_lat: 59.84, center_lng: 10.65, score: 18, species_id: 2 },
      { center_lat: 59.84, center_lng: 10.65, score: 18, species_id: 7 }
    ]);
    expect(a[0].species_id).toBe(2);
    expect(b[0].species_id).toBe(2);
  });

  it('er en no-op når det allerede er filtrert på art', () => {
    // Med ?speciesId=N filtrerer RPC-en selv, så det er én rad per rute.
    const enArt = NESODDEN.filter((t) => t.species_id === 1);
    expect(bestTilePerCell(enArt)).toEqual(enArt);
  });

  it('takler tom liste', () => {
    expect(bestTilePerCell([])).toEqual([]);
  });

  it('skiller ruter som bare avviker på femte desimal', () => {
    const ut = bestTilePerCell([
      { center_lat: 59.7, center_lng: 10.6, score: 10, species_id: 1 },
      { center_lat: 59.70001, center_lng: 10.6, score: 20, species_id: 1 }
    ]);
    expect(ut).toHaveLength(2);
  });

  it('slår sammen ruter som bare avviker på flyttallsstøv', () => {
    // 59.78 kan komme tilbake som 59.780000000000001 fra en annen kodesti.
    const ut = bestTilePerCell([
      { center_lat: 59.78, center_lng: 10.65, score: 10, species_id: 19 },
      { center_lat: 59.78 + Number.EPSILON, center_lng: 10.65, score: 60, species_id: 1 }
    ]);
    expect(ut).toHaveLength(1);
    expect(ut[0].score).toBe(60);
  });

  it('behandler manglende species_id som lavest prioritet ved uavgjort', () => {
    const ut = bestTilePerCell([
      { center_lat: 60, center_lng: 10, score: 40, species_id: null },
      { center_lat: 60, center_lng: 10, score: 40, species_id: 5 }
    ]);
    expect(ut[0].species_id).toBe(5);
  });
});
