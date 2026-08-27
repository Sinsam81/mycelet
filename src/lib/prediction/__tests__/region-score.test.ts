import { describe, expect, it } from 'vitest';
import { DEGENERERER_UNDER_ANTALL_RUTER, erMaksimumIPraksis, regionScore } from '../region-score';

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
