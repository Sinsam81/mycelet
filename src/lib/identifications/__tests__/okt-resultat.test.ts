import { describe, expect, it } from 'vitest';
import { merkOktresultatSomLagret, OKT_RESULTAT_NOKKEL } from '../okt-resultat';

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
