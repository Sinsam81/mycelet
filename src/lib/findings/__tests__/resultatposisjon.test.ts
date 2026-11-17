import { describe, expect, it } from 'vitest';
import {
  erFerskIdentifisering,
  FERSK_IDENTIFISERING_MS,
  erOmtrentligMaaletid,
  maaltTidspunkt,
  posisjonsalder,
  velgResultatposisjon
} from '../resultatposisjon';

/** Fast klokke: testene avhenger ikke av dagens dato. */
const NAA = Date.parse('2026-09-12T14:00:00.000Z');
const MIN = 60_000;

const id = (alderMs: number | null) => ({
  lat: 60.1,
  lng: 10.7,
  maaltMs: alderMs == null ? null : NAA - alderMs
});
const her = { lat: 59.9, lng: 10.75, accuracy: 12 };

describe('erFerskIdentifisering', () => {
  it('er fersk opptil grensen, ikke etter', () => {
    expect(erFerskIdentifisering(NAA, NAA)).toBe(true);
    expect(erFerskIdentifisering(NAA - FERSK_IDENTIFISERING_MS, NAA)).toBe(true);
    expect(erFerskIdentifisering(NAA - FERSK_IDENTIFISERING_MS - 1, NAA)).toBe(false);
  });

  it('godtar litt klokkeslingring framover, men ikke en tid langt fram', () => {
    expect(erFerskIdentifisering(NAA + 2 * MIN, NAA)).toBe(true);
    expect(erFerskIdentifisering(NAA + 60 * MIN, NAA)).toBe(false);
  });

  it('er aldri fersk når tidspunktet er ukjent', () => {
    expect(erFerskIdentifisering(null, NAA)).toBe(false);
    expect(erFerskIdentifisering(Number.NaN, NAA)).toBe(false);
  });
});

describe('velgResultatposisjon', () => {
  const grunn = { naa: null, maalerNaa: false, valg: null, naaMs: NAA };

  it('bruker en fersk posisjon fra identifiseringen uten å spørre — vanlig tilfelle', () => {
    expect(velgResultatposisjon({ ...grunn, identifisering: id(2 * MIN) })).toEqual({
      status: 'klar',
      punkt: { lat: 60.1, lng: 10.7 },
      kilde: 'identifisering'
    });
  });

  it('spør når posisjonen er gammel eller av ukjent alder', () => {
    expect(velgResultatposisjon({ ...grunn, identifisering: id(11 * MIN) })).toEqual({ status: 'maa_velge' });
    expect(velgResultatposisjon({ ...grunn, identifisering: id(3 * 24 * 60 * MIN) })).toEqual({ status: 'maa_velge' });
    expect(velgResultatposisjon({ ...grunn, identifisering: id(null) })).toEqual({ status: 'maa_velge' });
  });

  it('lar et uttrykkelig valg av den gamle posisjonen stå', () => {
    expect(velgResultatposisjon({ ...grunn, valg: 'identifisering', identifisering: id(5 * 60 * MIN) })).toMatchObject({
      status: 'klar',
      kilde: 'identifisering'
    });
  });

  it('venter på målingen når «der jeg står nå» er valgt, og bruker den når den kommer', () => {
    expect(velgResultatposisjon({ ...grunn, valg: 'naa', maalerNaa: true, identifisering: id(2 * MIN) })).toEqual({
      status: 'maaler'
    });
    expect(velgResultatposisjon({ ...grunn, valg: 'naa', naa: her, identifisering: id(2 * MIN) })).toEqual({
      status: 'klar',
      punkt: { lat: 59.9, lng: 10.75 },
      kilde: 'naa'
    });
  });

  it('faller ikke stille tilbake på den gamle når målingen feilet', () => {
    expect(velgResultatposisjon({ ...grunn, valg: 'naa', identifisering: id(30 * MIN) })).toEqual({ status: 'maa_velge' });
    // Også for en fersk: brukeren valgte bort den, så den skal velges på nytt.
    expect(velgResultatposisjon({ ...grunn, valg: 'naa', identifisering: id(1 * MIN) })).toEqual({ status: 'maa_velge' });
  });

  it('mangler posisjon når identifiseringen ikke hadde noen og ingen måling finnes', () => {
    expect(velgResultatposisjon({ ...grunn, identifisering: null })).toEqual({ status: 'mangler' });
    expect(velgResultatposisjon({ ...grunn, valg: 'naa', identifisering: null })).toEqual({ status: 'mangler' });
    expect(velgResultatposisjon({ ...grunn, valg: 'naa', naa: her, identifisering: null })).toMatchObject({
      status: 'klar',
      kilde: 'naa'
    });
  });
});

describe('posisjonsalder', () => {
  it('runder ned i enheten siden skriver', () => {
    expect(posisjonsalder(NAA - 30_000, NAA)).toEqual({ enhet: 'naa' });
    expect(posisjonsalder(NAA - 1 * MIN, NAA)).toEqual({ enhet: 'minutter', antall: 1 });
    expect(posisjonsalder(NAA - 59 * MIN, NAA)).toEqual({ enhet: 'minutter', antall: 59 });
    expect(posisjonsalder(NAA - 60 * MIN, NAA)).toEqual({ enhet: 'timer', antall: 1 });
    expect(posisjonsalder(NAA - 47 * 60 * MIN, NAA)).toEqual({ enhet: 'timer', antall: 47 });
    expect(posisjonsalder(NAA - 48 * 60 * MIN, NAA)).toEqual({ enhet: 'dager', antall: 2 });
  });

  it('sier «nå» om en tid litt fram i tid, og ukjent om en som mangler', () => {
    expect(posisjonsalder(NAA + 2 * MIN, NAA)).toEqual({ enhet: 'naa' });
    expect(posisjonsalder(null, NAA)).toBeNull();
  });
});

describe('maaltTidspunkt', () => {
  it('foretrekker tiden resultatsiden satte, så historikkradens created_at', () => {
    expect(maaltTidspunkt({ posisjonSettMs: NAA, createdAt: '2026-01-01T00:00:00Z' })).toBe(NAA);
    expect(maaltTidspunkt({ createdAt: '2026-09-12T14:00:00.000Z' })).toBe(NAA);
  });

  it('er ukjent når ingen av dem finnes eller lar seg lese', () => {
    expect(maaltTidspunkt({})).toBeNull();
    expect(maaltTidspunkt({ createdAt: 'i går' })).toBeNull();
    expect(maaltTidspunkt({ posisjonSettMs: 'nå' })).toBeNull();
  });
});

describe('maaltTidspunkt med fixets egen tid', () => {
  it('foretrekker location.timestamp framfor tiden resultatsiden satte', () => {
    const enTimeFoer = NAA - 60 * MIN;
    expect(
      maaltTidspunkt({ location: { latitude: 60, longitude: 10, timestamp: enTimeFoer }, posisjonSettMs: NAA })
    ).toBe(enTimeFoer);
  });

  it('en gammel lagret fix gjør posisjonen gammel selv om siden nettopp så den', () => {
    const maalt = maaltTidspunkt({ location: { timestamp: NAA - 60 * MIN }, posisjonSettMs: NAA });
    expect(erFerskIdentifisering(maalt, NAA)).toBe(false);
  });

  it('overser en ugyldig timestamp', () => {
    expect(maaltTidspunkt({ location: { timestamp: 'nå' }, posisjonSettMs: NAA })).toBe(NAA);
    expect(maaltTidspunkt({ location: { timestamp: 0 }, posisjonSettMs: NAA })).toBe(NAA);
    expect(maaltTidspunkt({ location: null, posisjonSettMs: NAA })).toBe(NAA);
  });
});

describe('erOmtrentligMaaletid', () => {
  it('er presis bare når fixet bærer sin egen tid', () => {
    expect(erOmtrentligMaaletid({ location: { timestamp: NAA } })).toBe(false);
    expect(erOmtrentligMaaletid({ location: { latitude: 60, longitude: 10 }, posisjonSettMs: NAA })).toBe(true);
    expect(erOmtrentligMaaletid({ createdAt: '2026-09-12T14:00:00.000Z' })).toBe(true);
    expect(erOmtrentligMaaletid({})).toBe(true);
  });
});
