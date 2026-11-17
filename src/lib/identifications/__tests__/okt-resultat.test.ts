import { describe, expect, it } from 'vitest';
import {
  erFerskIdentifisering,
  erOmtrentligMaaletid,
  FERSK_IDENTIFISERING_MS,
  maaltTidspunkt
} from '@/lib/findings/resultatposisjon';
import { medPosisjonstid, merkOktresultatSomLagret, OKT_RESULTAT_NOKKEL, posisjonstid } from '../okt-resultat';

function lager(start?: unknown, opts: { fullt?: boolean; sperret?: boolean } = {}) {
  const data = new Map<string, string>();
  if (start !== undefined) {
    data.set(OKT_RESULTAT_NOKKEL, typeof start === 'string' ? start : JSON.stringify(start));
  }
  return {
    data,
    getItem: (k: string) => {
      if (opts.sperret) throw new Error('SecurityError');
      return data.get(k) ?? null;
    },
    setItem: (k: string, v: string) => {
      if (opts.fullt) throw new Error('QuotaExceededError');
      data.set(k, v);
    },
    removeItem: (k: string) => {
      data.delete(k);
    }
  };
}

const les = (l: ReturnType<typeof lager>) => {
  const raa = l.data.get(OKT_RESULTAT_NOKKEL);
  return raa == null ? null : JSON.parse(raa);
};

describe('merkOktresultatSomLagret', () => {
  it('fersk identifisering lagret: resultatet beholdes, men merkes som lagret', () => {
    // Uten merket tilbød resultatsiden «Lagre som funn» på nytt etter
    // tilbake-navigering — ett trykk fra et duplikatfunn.
    const l = lager({ identificationId: 'rad-1', suggestions: [{ name: 'Cantharellus cibarius' }] });
    merkOktresultatSomLagret(l, { identificationId: 'rad-1', findingId: 'funn-9', fraOkta: true });
    expect(les(l)).toEqual({
      identificationId: 'rad-1',
      suggestions: [{ name: 'Cantharellus cibarius' }],
      savedFindingId: 'funn-9'
    });
  });

  it('uten historikkrad merkes det likevel når visningen kom fra økta', () => {
    const l = lager({ identificationId: null, suggestions: [] });
    merkOktresultatSomLagret(l, { identificationId: null, findingId: 'funn-9', fraOkta: true });
    expect(les(l).savedFindingId).toBe('funn-9');
  });

  it('mangler funn-ID-en, fjernes resultatet — aldri en ny lagre-knapp', () => {
    const l = lager({ identificationId: 'rad-1' });
    merkOktresultatSomLagret(l, { identificationId: 'rad-1', findingId: null, fraOkta: true });
    expect(les(l)).toBeNull();
  });

  it('er lageret fullt, fjernes resultatet i stedet for å stå umerket', () => {
    const l = lager({ identificationId: 'rad-1' }, { fullt: true });
    merkOktresultatSomLagret(l, { identificationId: 'rad-1', findingId: 'funn-9', fraOkta: true });
    expect(les(l)).toBeNull();
  });

  it('lagring fra historikken av SAMME rad merker også øktresultatet', () => {
    const l = lager({ identificationId: 'rad-1' });
    merkOktresultatSomLagret(l, { identificationId: 'rad-1', findingId: 'funn-9', fraOkta: false });
    expect(les(l).savedFindingId).toBe('funn-9');
  });

  it('lagring fra historikken av en ANNEN rad rører ikke den ulagrede i økta', () => {
    const l = lager({ identificationId: 'rad-2' });
    merkOktresultatSomLagret(l, { identificationId: 'rad-1', findingId: 'funn-9', fraOkta: false });
    expect(les(l)).toEqual({ identificationId: 'rad-2' });
  });

  it('to rader uten ID regnes aldri som samme rad', () => {
    const l = lager({ identificationId: null });
    merkOktresultatSomLagret(l, { identificationId: null, findingId: 'funn-9', fraOkta: false });
    expect(les(l)).toEqual({ identificationId: null });
  });

  it('uleselig innhold ryddes bort', () => {
    const l = lager('{ikke json');
    merkOktresultatSomLagret(l, { identificationId: 'rad-1', findingId: 'funn-9', fraOkta: true });
    expect(l.data.has(OKT_RESULTAT_NOKKEL)).toBe(false);
  });

  it('tomt lager og sperret lager kaster aldri', () => {
    expect(() =>
      merkOktresultatSomLagret(lager(), { identificationId: 'rad-1', findingId: 'funn-9', fraOkta: true })
    ).not.toThrow();
    expect(() =>
      merkOktresultatSomLagret(lager({ identificationId: 'rad-1' }, { sperret: true }), {
        identificationId: 'rad-1',
        findingId: 'funn-9',
        fraOkta: true
      })
    ).not.toThrow();
  });
});

/** Enhetens klokke i det posisjonen kom fram til identify-siden. Fast, så testene ikke avhenger av dagens dato. */
const MOTTATT = Date.parse('2026-09-12T14:00:00.000Z');
const MIN = 60_000;

describe('posisjonstid — når posisjonen i resultatet ble målt', () => {
  it('bruker tiden fixet selv bærer', () => {
    expect(posisjonstid(MOTTATT - 3_000, MOTTATT)).toBe(MOTTATT - 3_000);
  });

  it('en lagret iOS-posisjon fra en time siden beholder sin egen tid', () => {
    // Pluginen ser bort fra maximumAge i skallet; CoreLocation svarer med sist kjente.
    expect(posisjonstid(MOTTATT - 60 * MIN, MOTTATT)).toBe(MOTTATT - 60 * MIN);
  });

  it('et tidsstempel foran enhetens klokke kappes til tiden posisjonen kom fram', () => {
    // Satellittenes tid mot en klokke som går for sakte: posisjonen skal aldri
    // bli yngre enn tiden siden appen fikk den.
    expect(posisjonstid(MOTTATT + 30 * MIN, MOTTATT)).toBe(MOTTATT);
  });

  it.each([undefined, null, Number.NaN, Number.POSITIVE_INFINITY, 0, -1, '1789000000000'])(
    'et ubrukelig tidsstempel (%s) gir ingen tid — aldri en gjetning',
    (tidsstempel) => {
      expect(posisjonstid(tidsstempel as number | null | undefined, MOTTATT)).toBeUndefined();
    }
  );

  it('en ubrukelig mottakstid gir heller ingen tid', () => {
    expect(posisjonstid(MOTTATT - 3_000, Number.NaN)).toBeUndefined();
  });
});

describe('medPosisjonstid — resultatet slik identify-siden legger det i økta', () => {
  const resultat = {
    identificationId: 'rad-1',
    location: { latitude: 59.9706, longitude: 10.7286 },
    suggestions: [{ name: 'Cantharellus cibarius' }]
  };

  it('legger måletiden i location.timestamp og rører ikke resten', () => {
    const iOkta = medPosisjonstid(resultat, { timestamp: MOTTATT - 3_000 }, MOTTATT);
    expect(iOkta).toEqual({ ...resultat, location: { latitude: 59.9706, longitude: 10.7286, timestamp: MOTTATT - 3_000 } });
    // Originalen er uendret — den brukes fortsatt til historikkbildet.
    expect(resultat.location).toEqual({ latitude: 59.9706, longitude: 10.7286 });
  });

  it('uten posisjon, uten tidsstempel eller uten koordinater i resultatet: uendret', () => {
    expect(medPosisjonstid(resultat, null, MOTTATT)).toBe(resultat);
    expect(medPosisjonstid(resultat, {}, MOTTATT)).toBe(resultat);
    const utenKoordinater = { ...resultat, location: { latitude: null, longitude: null } };
    expect(medPosisjonstid(utenKoordinater, { timestamp: MOTTATT - 3_000 }, MOTTATT)).toBe(utenKoordinater);
  });

  it('tiden overlever sessionStorage (JSON)', () => {
    const iOkta = JSON.parse(JSON.stringify(medPosisjonstid(resultat, { timestamp: MOTTATT - 60 * MIN }, MOTTATT)));
    expect(iOkta.location.timestamp).toBe(MOTTATT - 60 * MIN);
  });
});

describe('sammen med resultatsidens regel (src/lib/findings/resultatposisjon.ts)', () => {
  const resultat = { location: { latitude: 59.9706, longitude: 10.7286 } };
  /** Resultatsiden stempler posisjonSettMs første gang den leser resultatet. */
  const lestAvResultatsiden = (iOkta: object, naa: number) => ({ ...iOkta, posisjonSettMs: naa });

  it('en lagret iOS-posisjon fra en time siden gir spørsmålet, selv om siden leste resultatet nå', () => {
    const naa = MOTTATT + 20_000;
    const lest = lestAvResultatsiden(medPosisjonstid(resultat, { timestamp: MOTTATT - 60 * MIN }, MOTTATT), naa);
    expect(maaltTidspunkt(lest)).toBe(MOTTATT - 60 * MIN);
    expect(erFerskIdentifisering(maaltTidspunkt(lest), naa)).toBe(false);
    // Og siden kan si alderen presist — tiden er fixets egen.
    expect(erOmtrentligMaaletid(lest)).toBe(false);
  });

  it('en fersk posisjon brukes uten spørsmål, og blir gammel på samme klokke som før', () => {
    const lest = lestAvResultatsiden(medPosisjonstid(resultat, { timestamp: MOTTATT - 2_000 }, MOTTATT), MOTTATT + 20_000);
    expect(erFerskIdentifisering(maaltTidspunkt(lest), MOTTATT + 20_000)).toBe(true);
    expect(erFerskIdentifisering(maaltTidspunkt(lest), MOTTATT + FERSK_IDENTIFISERING_MS + MIN)).toBe(false);
  });

  it('et tidsstempel foran klokka gjør aldri posisjonen fersk lenger enn ti minutter etter at den kom', () => {
    // Enhetens klokke åtte minutter bak satellittenes. Uten taket ville
    // posisjonen sett tre minutter gammel ut elleve minutter etter at den kom.
    const lest = lestAvResultatsiden(medPosisjonstid(resultat, { timestamp: MOTTATT + 8 * MIN }, MOTTATT), MOTTATT);
    expect(erFerskIdentifisering(maaltTidspunkt(lest), MOTTATT + 5 * MIN)).toBe(true);
    expect(erFerskIdentifisering(maaltTidspunkt(lest), MOTTATT + FERSK_IDENTIFISERING_MS + MIN)).toBe(false);
  });

  it('uten tidsstempel fra plattformen: som før — omtrentlig alder fra resultatsiden', () => {
    const lest = lestAvResultatsiden(medPosisjonstid(resultat, null, MOTTATT), MOTTATT + 20_000);
    expect(maaltTidspunkt(lest)).toBe(MOTTATT + 20_000);
    expect(erOmtrentligMaaletid(lest)).toBe(true);
  });
});
