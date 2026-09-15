import { describe, expect, it } from 'vitest';
import {
  datoTekst,
  innledningsRegion,
  lokalDato,
  regionerPerLand,
  type SoppforholdRegion
} from '../hent-regioner';

function region(name: string, country: 'NO' | 'SE', score: number): SoppforholdRegion {
  return { name, country, score, cells: 10, leadingSpecies: null, verdict: null };
}

describe('lokalDato', () => {
  it('skriver norsk som standard', () => {
    expect(lokalDato('2026-09-15')).toBe('15. september 2026');
    expect(lokalDato('2026-08-12', 'nb')).toBe('12. august 2026');
  });

  it('skriver svensk med svenske månedsnavn', () => {
    expect(lokalDato('2026-08-12', 'sv')).toBe('12 augusti 2026');
    expect(lokalDato('2026-09-15', 'sv')).toBe('15 september 2026');
  });

  it('gir tom streng uten dato', () => {
    expect(lokalDato(null)).toBe('');
    expect(lokalDato(null, 'sv')).toBe('');
  });

  it('bruker skandinavisk tid, ikke maskinens sone', () => {
    // 23:30 UTC er allerede neste dag i Oslo og Stockholm.
    expect(lokalDato('2026-09-14T23:30:00Z', 'nb')).toBe('15. september 2026');
    expect(lokalDato('2026-09-14T23:30:00Z', 'sv')).toBe('15 september 2026');
  });
});

describe('datoTekst', () => {
  it('lar språket følge landet på områdesidene', () => {
    expect(datoTekst('2026-08-12', 'SE')).toBe(lokalDato('2026-08-12', 'sv'));
    expect(datoTekst('2026-08-12', 'NO')).toBe(lokalDato('2026-08-12', 'nb'));
  });
});

describe('regionerPerLand', () => {
  // API-ets rekkefølge: høyest score først, landene blandet.
  const regioner = [
    region('Trondheim', 'NO', 100),
    region('Linköping', 'SE', 96),
    region('Oslo', 'NO', 98),
    region('Göteborg', 'SE', 84)
  ];

  it('viser Norge først for norske lesere', () => {
    const seksjoner = regionerPerLand(regioner, 'nb');
    expect(seksjoner.map((s) => s.land)).toEqual(['NO', 'SE']);
    expect(seksjoner[0].regions.map((r) => r.name)).toEqual(['Trondheim', 'Oslo']);
  });

  it('viser Sverige først for svenske lesere', () => {
    const seksjoner = regionerPerLand(regioner, 'sv');
    expect(seksjoner.map((s) => s.land)).toEqual(['SE', 'NO']);
    expect(seksjoner[0].regions.map((r) => r.name)).toEqual(['Linköping', 'Göteborg']);
  });

  it('beholder API-ets rekkefølge inne i hvert land', () => {
    const [, norge] = regionerPerLand(regioner, 'sv');
    expect(norge.regions.map((r) => r.score)).toEqual([100, 98]);
  });

  it('dropper et land uten regioner i stedet for å vise en tom seksjon', () => {
    const bareSverige = regioner.filter((r) => r.country === 'SE');
    expect(regionerPerLand(bareSverige, 'nb').map((s) => s.land)).toEqual(['SE']);
    expect(regionerPerLand([], 'sv')).toEqual([]);
  });
});

describe('innledningsRegion', () => {
  const regioner = [
    region('Trondheim', 'NO', 100),
    region('Linköping', 'SE', 96),
    region('Oslo', 'NO', 98)
  ];

  it('peker på beste område i leserens eget land', () => {
    expect(innledningsRegion(regioner, 'nb')).toEqual({ region: regioner[0], egetLandMangler: false });
    expect(innledningsRegion(regioner, 'sv')).toEqual({ region: regioner[1], egetLandMangler: false });
  });

  it('faller tilbake til beste område totalt når leserens land mangler (NO er skrevet, SE ikke ennå)', () => {
    // Mellom NO-cronen (01:15 UTC) og SE-cronen (01:45 UTC) har nyeste
    // rasterdato bare norske rader. Da skal svenske lesere IKKE få «ikke klar».
    const bareNorge = regioner.filter((r) => r.country === 'NO');
    expect(innledningsRegion(bareNorge, 'sv')).toEqual({ region: bareNorge[0], egetLandMangler: true });
    expect(innledningsRegion(bareNorge, 'nb')).toEqual({ region: bareNorge[0], egetLandMangler: false });
  });

  it('er symmetrisk når bare Sverige finnes', () => {
    const bareSverige = regioner.filter((r) => r.country === 'SE');
    expect(innledningsRegion(bareSverige, 'nb')).toEqual({ region: bareSverige[0], egetLandMangler: true });
  });

  it('gir ingen region, og ingen «mangler»-linje, når det ikke finnes tall overhodet', () => {
    expect(innledningsRegion([], 'sv')).toEqual({ region: null, egetLandMangler: false });
    expect(innledningsRegion([], 'nb')).toEqual({ region: null, egetLandMangler: false });
  });
});
