import { describe, expect, it } from 'vitest';
import { CONDITION_COLORS, colorForScore, fillOpacitiesForScores } from '../condition-colors';
import { scoreToCondition } from '../prediction';

describe('one colour scale, keyed to one condition ladder', () => {
  it('never paints a worse score greener than a better one', () => {
    // The old getHeatColor was a temperature ramp: dark red at 80+, lime below
    // 40. On a map where green pills mean "go here" that inverted the meaning.
    const rank = { poor: 0, moderate: 1, good: 2, excellent: 3 } as const;
    for (let score = 0; score <= 100; score += 1) {
      const here = rank[scoreToCondition(score)];
      const above = rank[scoreToCondition(Math.min(100, score + 1))];
      expect(above).toBeGreaterThanOrEqual(here);
    }
  });

  it('agrees with scoreToCondition at every boundary', () => {
    for (const score of [0, 34, 35, 54, 55, 74, 75, 100]) {
      expect(colorForScore(score)).toBe(CONDITION_COLORS[scoreToCondition(score)]);
    }
  });

  it('gives every band a readable foreground', () => {
    for (const band of Object.values(CONDITION_COLORS)) {
      expect(band.hex).toMatch(/^#[0-9A-F]{6}$/i);
      expect(band.ink).toMatch(/^#[0-9A-F]{6}$/i);
      expect(band.ink).not.toBe(band.hex);
    }
  });
});

/**
 * Dekkevnen har bommet to ganger, begge fordi den brukte en ABSOLUTT skala:
 *
 *  1. Flate 0,13 for alt — ingen kontrast i det hele tatt.
 *  2. Fast verdi per bøtte (0,05/0,15/0,38/0,52) — verre, fordi oppslaget gikk
 *     gjennom scoreToCondition, altså samme fire bøtter som fargen. Er fargen
 *     konstant er dekkevnen konstant. Og med 78 % av de tegnede rutene i «poor»
 *     @ 0,05 forsvant hele laget i 64 % av utsnittene.
 *
 * Målt mot ekte fliser 2026-08-02, med kollapsen kartet faktisk tegner: spennet
 * inne i ett utsnitt har median 7 poeng, mot 10 i den smaleste bøtta. En
 * absolutt skala KAN derfor ikke skille noe på én skjerm.
 *
 * Testene under vokter egenskapen som faktisk betyr noe: at det finnes kontrast
 * uansett hvor smalt spennet er, og at ingenting forsvinner.
 */
describe('fillOpacitiesForScores — relativ til utsnittet', () => {
  it('gir kontrast selv når hele utsnittet ligger i samme bøtte', () => {
    // Innlandet 2026-08-02: 30 av 30 ruter mellom 40 og 49 — alle «poor», så
    // enhver absolutt skala ga alle samme verdi.
    const innlandet = [40, 42, 43, 45, 46, 47, 49];
    const o = fillOpacitiesForScores(innlandet);
    expect(new Set(o).size, 'hver score må få sin egen dekkevne').toBe(innlandet.length);
    // Var > 0,3 da dekkevnen var rent relativ. Nå er inntil 0,15 satt av til
    // rangeringen og resten til å si hvor bra ruta er i seg selv — se
    // BUCKET_FLOOR. Kontrasten er mindre, men den betyr nå det samme uansett
    // hva annet som er på skjermen.
    expect(Math.max(...o) - Math.min(...o)).toBeGreaterThan(0.14);
  });

  it('lar ingen rute bli usynlig', () => {
    // 0,05 var i praksis ingenting over et detaljert topokart.
    for (const sett of [[40, 90], [50, 50, 50], [43], [60, 61, 62]]) {
      for (const o of fillOpacitiesForScores(sett)) {
        expect(o, `sett ${sett.join(',')}`).toBeGreaterThanOrEqual(0.12);
      }
    }
  });

  it('holder seg under full dekning, så bakgrunnskartet fortsatt leses', () => {
    for (const o of fillOpacitiesForScores([10, 50, 90])) expect(o).toBeLessThanOrEqual(0.55);
  });

  it('stiger med scoren', () => {
    const o = fillOpacitiesForScores([45, 52, 61, 78]);
    for (let i = 1; i < o.length; i++) expect(o[i]).toBeGreaterThan(o[i - 1]);
  });

  it('gir alle samme verdi når det ikke finnes noe å gradere', () => {
    const o = fillOpacitiesForScores([55, 55, 55]);
    expect(new Set(o).size).toBe(1);
    expect(o[0]).toBeGreaterThan(0.12);
  });

  it('takler tomt utsnitt', () => {
    expect(fillOpacitiesForScores([])).toEqual([]);
  });

  /**
   * Denne testen krevde tidligere det MOTSATTE: at et svakt utsnitt fikk
   * nøyaktig samme maksimale dekkevne som et sterkt. Begrunnelsen var at et
   * helgrått utsnitt skal «peke» — men følgen var at et middelmådig område
   * kunne se like lovende ut som et virkelig godt, så lenge man ikke hadde
   * begge på skjermen samtidig. Og de kommer aldri på skjermen samtidig.
   */
  it('lar et svakt utsnitt se svakere ut enn et sterkt', () => {
    const svakt = fillOpacitiesForScores([40, 44, 49]);
    const sterkt = fillOpacitiesForScores([70, 78, 85]);
    expect(Math.max(...svakt)).toBeLessThan(Math.max(...sterkt));
    // Men det svake utsnittet PEKER fortsatt: den minst svake er tydeligst.
    expect(Math.max(...svakt)).toBeGreaterThan(Math.min(...svakt));
  });

  it('endrer ikke en rutes utseende bare fordi brukeren panorerer', () => {
    // Kjernen i feilen: rutene lastes på nytt ved hver moveend, og dekkevnen ble
    // regnet mot min og maks blant dem som tilfeldigvis var på skjermen. Samme
    // rute, samme score, ulikt utseende.
    const utsnittA = [58, 57, 56, 55, 54, 52];
    const utsnittB = [58, 57, 56, 55, 54, 52, 45]; // brukeren drar litt sørover
    const a = fillOpacitiesForScores(utsnittA)[5]; // ruta på 52
    const b = fillOpacitiesForScores(utsnittB)[5]; // samme rute
    // Før: 0,12 mot 0,35 — nesten tre ganger så synlig etter en panorering.
    expect(Math.abs(a - b), 'panorering skal flytte en rute lite').toBeLessThanOrEqual(0.15);
  });
});
