import { describe, expect, it } from 'vitest';
import { CONDITION_COLORS, colorForScore, fillOpacityForScore } from '../condition-colors';
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
 * Dekkevnen var flat 0,13 for alle fire bøttene. Det var forsvarlig så lenge
 * tersklene var ukalibrerte og 71 % av rasteret havnet i samme bøtte — da fantes
 * det knapt fire farger å skille mellom. Etter kalibreringen 2026-08-02 er
 * fordelingen reell (47/42/7/4 % i Oslofjord-utsnittet), og da er fire farger på
 * samme svake dekkevne fortsatt fire nesten usynlige farger: målt på prøvekartet
 * var «før» og «etter» ikke til å skille med øyet.
 */
describe('gradert dekkevne', () => {
  it('stiger monotont med hvor bra det er', () => {
    const stige = [
      fillOpacityForScore(45),
      fillOpacityForScore(55),
      fillOpacityForScore(65),
      fillOpacityForScore(80)
    ];
    for (let i = 1; i < stige.length; i++) {
      expect(stige[i], `trinn ${i} må være sterkere enn trinnet under`).toBeGreaterThan(stige[i - 1]);
    }
  });

  it('lar de gode skille seg klart ut fra de svake', () => {
    // Poenget med laget: vise hvor det er verdt å lete. Er forskjellen for liten
    // ser kartet flatt ut uansett hvor riktig klassifiseringen er.
    expect(fillOpacityForScore(80) / fillOpacityForScore(45)).toBeGreaterThanOrEqual(5);
  });

  it('tegner fortsatt de svake, så de kan trykkes på', () => {
    // Å utelate dem ville gjort dem uleselige for brukeren som lurer på
    // «hva med her?» — de mister tooltip og popup sammen med fargen.
    expect(fillOpacityForScore(45)).toBeGreaterThan(0);
  });

  it('dekker hele det målte spennet uten hull', () => {
    const maltSpenn = Array.from({ length: 85 - 43 + 1 }, (_, i) => 43 + i);
    for (const score of maltSpenn) {
      expect(Number.isFinite(fillOpacityForScore(score)), `score ${score}`).toBe(true);
    }
    expect(new Set(maltSpenn.map(fillOpacityForScore)).size).toBe(4);
  });
});
