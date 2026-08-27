import { describe, expect, it } from 'vitest';
import {
  DEGENERERER_UNDER_ANTALL_RUTER,
  REGION_CONDITION_THRESHOLDS,
  erMaksimumIPraksis,
  regionBand,
  regionScore,
  regionScoreToCondition
} from '../region-score';
import { CONDITION_THRESHOLDS } from '@/lib/utils/prediction';

/**
 * Regionens dagstall styrer to ting samtidig: hva /soppforhold viser, og når
 * soppvarselet sender e-post. Funksjonen lå tidligere som to ordrette kopier
 * med kommentaren «hold dem i takt» som eneste vern — disse testene er vernet
 * nå.
 */
describe('regionScore', () => {
  it('plukker den nest beste ruta når regionen er stor nok til en ekte persentil', () => {
    // 11 ruter er den første størrelsen der klammen ikke binder.
    const ruter = [10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 100];
    expect(ruter).toHaveLength(11);
    expect(regionScore(ruter)).toBe(95);
  });

  it('ER maksimum for regioner med ti ruter eller færre — dokumentert, ikke tilfeldig', () => {
    // Bodø hadde 9 ruter 2026-08-27 og publiserte 100, som er beste rute.
    const bodo = [89, 89, 90, 90, 90, 94, 94, 97, 100];
    expect(bodo).toHaveLength(9);
    expect(regionScore(bodo)).toBe(100);
    expect(regionScore(bodo)).toBe(Math.max(...bodo));

    // Grensa går ved 10/11, og den er verdt å låse: flytter den seg, endrer
    // fem regioners publiserte tall seg uten at noen har bestemt det.
    for (let n = 1; n <= DEGENERERER_UNDER_ANTALL_RUTER; n++) {
      const ruter = Array.from({ length: n }, (_, i) => i + 1);
      expect(regionScore(ruter), `n=${n}`).toBe(n);
    }
    const elleve = Array.from({ length: 11 }, (_, i) => i + 1);
    expect(regionScore(elleve)).toBe(10); // ikke 11 — første ekte persentil
  });

  it('faller mot lavere rang jo større regionen er', () => {
    // Oslo hadde 51 ruter: floor(51*0.9) = 45, altså sjette beste.
    const oslo = Array.from({ length: 51 }, (_, i) => i + 1);
    expect(regionScore(oslo)).toBe(46);
    expect(oslo.length - regionScore(oslo)).toBe(5); // fem ruter er bedre
  });

  it('gir 0 for en region uten ruter i stedet for undefined', () => {
    // Skogoppslaget kan komme tomt tilbake for en hel region en natt. NaN
    // eller undefined herfra ville forplantet seg helt ut i varsel-e-posten.
    expect(regionScore([])).toBe(0);
  });

  it('takler at alle rutene er like', () => {
    expect(regionScore([61, 61, 61, 61, 61])).toBe(61);
  });
});

describe('erMaksimumIPraksis', () => {
  it('sier fra om regioner der «90-persentilen» egentlig er beste rute', () => {
    expect(erMaksimumIPraksis(5)).toBe(true); // Stavanger
    expect(erMaksimumIPraksis(9)).toBe(true); // Bodø
    expect(erMaksimumIPraksis(10)).toBe(true);
    expect(erMaksimumIPraksis(11)).toBe(false);
    expect(erMaksimumIPraksis(51)).toBe(false); // Oslo
  });

  it('regner en tom region som ikke-degenerert — der finnes ingen maks å forveksle den med', () => {
    expect(erMaksimumIPraksis(0)).toBe(false);
  });
});

/**
 * Regionstallet er 90-persentilen OVER ruter og ligger derfor systematisk
 * høyere enn en enkelt rute. Da regionsendepunktet lånte rutenes stige, fikk
 * 22,5 % av regiondøgnene en dom som lovet «topp 10 %».
 */
describe('regionstigen', () => {
  it('ligger over rutestigen på alle tre trinn', () => {
    // Selve poenget. Ryker denne, er de to stigene i ferd med å smelte sammen
    // igjen — og da er feilen tilbake.
    expect(REGION_CONDITION_THRESHOLDS.excellent).toBeGreaterThan(CONDITION_THRESHOLDS.excellent);
    expect(REGION_CONDITION_THRESHOLDS.good).toBeGreaterThan(CONDITION_THRESHOLDS.good);
    expect(REGION_CONDITION_THRESHOLDS.moderate).toBeGreaterThan(CONDITION_THRESHOLDS.moderate);
  });

  it('gir topp-dommen til omtrent én av ti regiondøgn', () => {
    // De faktiske 374 regiondøgnene lest 2026-08-27, som tersklene er målt på.
    // Ville den gamle rutestigen (72) vært brukt her, ville 22,5 % passert.
    const fordeling = { p90: 81, p75: 70, median: 61 };
    expect(regionScoreToCondition(fordeling.p90)).toBe('excellent');
    expect(regionScoreToCondition(fordeling.p90 - 1)).toBe('good');
    expect(regionScoreToCondition(fordeling.p75)).toBe('good');
    expect(regionScoreToCondition(fordeling.median)).toBe('moderate');
    expect(regionScoreToCondition(fordeling.median - 1)).toBe('poor');
  });

  it('skiller de fire områdene som før delte samme dom', () => {
    // 27.08 fikk 100, 87, 79, 78, 76 og 74 alle «Nå er det piggsopp 🍄».
    // Et spenn på 26 poeng så identisk ut for leseren.
    expect(regionScoreToCondition(100)).toBe('excellent');
    expect(regionScoreToCondition(87)).toBe('excellent');
    expect(regionScoreToCondition(79)).toBe('good');
    expect(regionScoreToCondition(74)).toBe('good');
  });

  it('lar fargen følge dommen, aldri en egen stige', () => {
    // Feilen var at teksten kom fra rutestigen og fargen fra punkt-dagstigen:
    // samme tall kunne få topp-dommen og gul prikk samtidig.
    for (const score of [0, 25, 45, 60, 61, 69, 70, 80, 81, 87, 100]) {
      const condition = regionScoreToCondition(score);
      const band = regionBand(score);
      if (condition === 'excellent') expect(band, `score ${score}`).toBe('green');
      else if (condition === 'poor') expect(band, `score ${score}`).toBe('grey');
      else expect(band, `score ${score}`).toBe('amber');
    }
  });

  it('holder varselterskelen strengere enn topp-dommen', () => {
    // VARSEL_MIN_SCORE = 85 traff 6,1 % av regiondøgnene, topp-dommen 10 %.
    // Rekkefølgen må bestå: en e-post skal være sjeldnere enn en grønn prikk,
    // ellers er varselet støy.
    expect(85).toBeGreaterThan(REGION_CONDITION_THRESHOLDS.excellent);
  });
});
