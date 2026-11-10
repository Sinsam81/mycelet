import { describe, expect, it } from 'vitest';
import { REGION_CONDITION_THRESHOLDS } from '@/lib/prediction/region-score';
import {
  datoTekst,
  erStille,
  innledningsRegion,
  innledningsTilstand,
  lokalDato,
  omradeTilstand,
  regionerPerLand,
  visArtslinje,
  type SoppforholdRegion
} from '../hent-regioner';

const TERSKEL = REGION_CONDITION_THRESHOLDS.moderate;

describe('erStille / visArtslinje', () => {
  it('følger regionstigens laveste bånd, ikke et eget tall', () => {
    expect(erStille({ score: TERSKEL - 1 })).toBe(true);
    expect(erStille({ score: TERSKEL })).toBe(false);
  });

  it('skriver «i sesong» bare over laveste bånd og innenfor artens sesong', () => {
    const god = { ...region('Bergen', 'NO', TERSKEL + 10), leadingSpecies: 'Kantarell' };
    expect(visArtslinje({ ...god, leadingInSeason: true })).toBe(true);
    // Cachet svar fra før feltet kom, og arter uten sesong i basen: ukjent, ikke «utenfor».
    expect(visArtslinje(god)).toBe(true);
    expect(visArtslinje({ ...god, leadingInSeason: null })).toBe(true);
    expect(visArtslinje({ ...god, leadingInSeason: false })).toBe(false);
    expect(visArtslinje({ ...god, score: TERSKEL - 1, leadingInSeason: true })).toBe(false);
    expect(visArtslinje({ ...god, leadingSpecies: null })).toBe(false);
  });
});

describe('innledningsTilstand', () => {
  const vinter = [region('Bergen', 'NO', 4), region('Göteborg', 'SE', 3), region('Oslo', 'NO', 2)];

  it('er vanlig når beste område i leserens land er over laveste bånd', () => {
    const r = [region('Bergen', 'NO', TERSKEL), region('Göteborg', 'SE', 10)];
    expect(innledningsTilstand(r, 'nb', true).tilstand).toBe('vanlig');
    // Kalenderen alene gjør ingenting: en god dag i mai er fortsatt en god dag.
    expect(innledningsTilstand(r, 'nb', false).tilstand).toBe('vanlig');
  });

  it('er stille når også det beste i leserens land er i laveste bånd', () => {
    const r = [region('Göteborg', 'SE', 80), region('Bergen', 'NO', TERSKEL - 1)];
    const svar = innledningsTilstand(r, 'nb', true);
    expect(svar.tilstand).toBe('stille');
    expect(svar.region?.name).toBe('Bergen');
    // Det andre landet har gode tall, så «alle» ville vært usant.
    expect(svar.alleStille).toBe(false);
    expect(innledningsTilstand(r, 'sv', true).tilstand).toBe('vanlig');
  });

  it('en tørr uke i sesongen er stille, ikke utenom sesongen', () => {
    expect(innledningsTilstand(vinter, 'nb', true)).toMatchObject({ tilstand: 'stille', alleStille: true });
  });

  it('er utenom sesongen først når ALLE er stille og kalenderen sier desember–mai', () => {
    expect(innledningsTilstand(vinter, 'nb', false).tilstand).toBe('utenomSesong');
    expect(innledningsTilstand(vinter, 'sv', false).tilstand).toBe('utenomSesong');
    // Eget land stille, det andre ikke: fortsatt bare «stille».
    const blandet = [region('Göteborg', 'SE', 70), region('Bergen', 'NO', 4)];
    expect(innledningsTilstand(blandet, 'nb', false).tilstand).toBe('stille');
  });

  it('beholder «mangler»-flagget og tåler tom liste', () => {
    expect(innledningsTilstand([region('Bergen', 'NO', 4)], 'sv', false).egetLandMangler).toBe(true);
    expect(innledningsTilstand([], 'nb', false)).toEqual({
      region: null,
      egetLandMangler: false,
      tilstand: 'vanlig',
      alleStille: false
    });
  });
});

describe('omradeTilstand', () => {
  const oslo = region('Oslo', 'NO', 3);

  it('regner innenfor områdets eget land', () => {
    const r = [region('Göteborg', 'SE', 90), region('Bergen', 'NO', 5), oslo];
    expect(omradeTilstand(oslo, r, false)).toEqual({ landStille: true, utenomSesong: true });
    expect(omradeTilstand(oslo, r, true)).toEqual({ landStille: true, utenomSesong: false });
  });

  it('beholder rangeringen så lenge ett område i landet er over laveste bånd', () => {
    const r = [region('Bergen', 'NO', TERSKEL), oslo];
    expect(omradeTilstand(oslo, r, false)).toEqual({ landStille: false, utenomSesong: false });
  });
});

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
