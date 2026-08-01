import { describe, it, expect } from 'vitest';
import { evaluateGbifMatch } from '../gbif-match.mjs';

/**
 * Svarene under er ekte, hentet fra GBIF 2026-08-01 med kingdom=Fungi.
 * De er tatt med ordrett fordi det er selve poenget: regelen skal prøves mot
 * det API-et faktisk returnerer, ikke mot et forenklet bilde av det.
 */

const AGARICUS_SILVATICUS = {
  usageKey: 186,
  scientificName: 'Agaricomycetes',
  matchType: 'HIGHERRANK',
  rank: 'CLASS',
  status: 'ACCEPTED'
};

const AGARICUS_SYLVATICUS = {
  usageKey: 8108291,
  scientificName: 'Agaricus sylvaticus Schaeff.',
  matchType: 'EXACT',
  rank: 'SPECIES',
  status: 'ACCEPTED'
};

const AGARICUS_XANTHODERMA_FUZZY = {
  usageKey: 5243412,
  scientificName: 'Agaricus xanthodermus Genev.',
  matchType: 'FUZZY',
  rank: 'SPECIES',
  status: 'ACCEPTED'
};

const INOCYBE_ERUBESCENS_SYNONYM = {
  usageKey: 2527939,
  scientificName: 'Inocybe erubescens A.Blytt',
  matchType: 'EXACT',
  rank: 'SPECIES',
  status: 'SYNONYM'
};

describe('feilen som gjorde regelen nødvendig', () => {
  it('avviser klassetreffet som ga oss 8 230 gale rader', () => {
    const r = evaluateGbifMatch(AGARICUS_SILVATICUS);
    expect(r.accept).toBe(false);
    expect(r.usageKey).toBeNull();
    expect(r.reason).toContain('CLASS');
  });

  it('den gamle regelen ville sluppet det gjennom', () => {
    // Slik sjekken så ut før: alt som ikke var 'NONE'.
    const gammelRegel = (m) => Boolean(m && m.usageKey && m.matchType !== 'NONE');
    expect(gammelRegel(AGARICUS_SILVATICUS)).toBe(true);
    // Og dette er hva den ville importert: hele klassen Agaricomycetes.
    expect(AGARICUS_SILVATICUS.usageKey).toBe(186);
  });

  it('det korrekte navnet slipper gjennom', () => {
    const r = evaluateGbifMatch(AGARICUS_SYLVATICUS);
    expect(r.accept).toBe(true);
    expect(r.usageKey).toBe(8108291);
  });
});

describe('hva som godtas', () => {
  it('EXACT på artsnivå', () => {
    expect(evaluateGbifMatch(AGARICUS_SYLVATICUS).accept).toBe(true);
  });

  it('FUZZY på artsnivå — en skrivefeil skal ikke stoppe importen', () => {
    expect(evaluateGbifMatch(AGARICUS_XANTHODERMA_FUZZY).accept).toBe(true);
  });

  it('et synonym på artsnivå — GBIF sender oss til riktig takson', () => {
    // Vi bryr oss ikke om navnet er utdatert her; forekomstene er de samme.
    expect(evaluateGbifMatch(INOCYBE_ERUBESCENS_SYNONYM).accept).toBe(true);
  });
});

describe('hva som avvises', () => {
  it.each([
    ['HIGHERRANK til klasse', AGARICUS_SILVATICUS],
    ['HIGHERRANK til slekt', { usageKey: 999, matchType: 'HIGHERRANK', rank: 'GENUS', scientificName: 'Agaricus' }],
    ['HIGHERRANK til familie', { usageKey: 998, matchType: 'HIGHERRANK', rank: 'FAMILY', scientificName: 'Agaricaceae' }],
    ['ukjent navn', { usageKey: 0, matchType: 'NONE' }],
    ['underart', { usageKey: 997, matchType: 'EXACT', rank: 'SUBSPECIES', scientificName: 'X y subsp. z' }],
    ['varietet', { usageKey: 996, matchType: 'EXACT', rank: 'VARIETY', scientificName: 'X y var. z' }],
    ['tomt svar', null],
    ['undefined', undefined],
    ['svar uten usageKey', { matchType: 'EXACT', rank: 'SPECIES' }]
  ])('%s', (_navn, svar) => {
    const r = evaluateGbifMatch(svar);
    expect(r.accept).toBe(false);
    expect(r.usageKey).toBeNull();
  });

  it('sier alltid HVORFOR, så en stille import ikke kan gjenta seg', () => {
    for (const svar of [AGARICUS_SILVATICUS, { usageKey: 1, matchType: 'NONE' }, null]) {
      expect(evaluateGbifMatch(svar).reason.length).toBeGreaterThan(5);
    }
  });
});
