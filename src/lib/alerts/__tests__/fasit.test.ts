import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  beregnFasit,
  erFasitModen,
  fasitVinduer,
  osloMidnattIso,
  FASIT_MODEN_DAGER,
  FASIT_MODEN_ETTER_VARSEL_DAGER,
  FASIT_VINDU_DAGER
} from '../fasit';

describe('erFasitModen', () => {
  it('modenhet teller fra slutten av etter-uken, ikke fra varseldagen', () => {
    expect(FASIT_MODEN_ETTER_VARSEL_DAGER).toBe(FASIT_MODEN_DAGER + FASIT_VINDU_DAGER);
  });

  it('14 dager etter varselet er IKKE modent — etter-uken er bare sju dager gammel', () => {
    expect(erFasitModen('2026-08-21', new Date('2026-09-04T12:00:00Z'))).toBe(false);
  });

  it('21 dager etter varselet er modent', () => {
    expect(erFasitModen('2026-08-14', new Date('2026-09-04T12:00:00Z'))).toBe(true);
    expect(erFasitModen('2026-08-15', new Date('2026-09-05T00:00:00Z'))).toBe(true);
  });

  it('dagen før grensen er umodent', () => {
    expect(erFasitModen('2026-08-15', new Date('2026-09-04T23:00:00Z'))).toBe(false);
  });
});

describe('fasitVinduer', () => {
  it('to like lange, disjunkte sjudagersvinduer med varseldagen i «etter»', () => {
    const v = fasitVinduer('2026-08-14');
    expect(v.etter).toEqual({ fra: '2026-08-14', tilInkl: '2026-08-20', tilEksk: '2026-08-21' });
    expect(v.for).toEqual({ fra: '2026-08-07', tilInkl: '2026-08-13', tilEksk: '2026-08-14' });
  });
});

describe('osloMidnattIso', () => {
  it('sommertid: lokal midnatt er 22:00Z dagen før', () => {
    expect(osloMidnattIso('2026-08-14')).toBe('2026-08-13T22:00:00.000Z');
  });
  it('vintertid: lokal midnatt er 23:00Z dagen før', () => {
    expect(osloMidnattIso('2026-01-14')).toBe('2026-01-13T23:00:00.000Z');
  });
});

/** Kjedbar fake som noterer hvert filter, og svarer med `svar` når kjeden awaites. */
function fakeDb(svar: () => { count: number | null; error: { message: string } | null }, filtre: Array<[string, string, unknown]>) {
  const b: Record<string, unknown> = {};
  for (const op of ['select', 'gte', 'lte', 'lt', 'eq', 'is']) {
    b[op] = (k: string, v: unknown) => {
      if (op !== 'select') filtre.push([op, k, v]);
      return b;
    };
  }
  b.then = (r: (v: unknown) => unknown) => Promise.resolve(svar()).then(r);
  return { from: () => b };
}

describe('beregnFasit — vinduene og filtrene som faktisk sendes til kildene', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('GBIF: inklusive sjudagersvinduer, kun PRESENT fra observasjoner/belegg; egne funn: halvåpne i Oslo-tid, uten negative', async () => {
    const gbifUrler: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      gbifUrler.push(url);
      return { ok: true, json: async () => ({ count: url.includes('2026-08-14,2026-08-20') ? 58 : 51 }) };
    });
    const filtre: Array<[string, string, unknown]> = [];
    const db = fakeDb(() => ({ count: 1, error: null }), filtre);

    const fasit = await beregnFasit(db, 'Trondheim', '2026-08-14', new Date('2026-09-05T12:00:00Z'));
    expect(fasit).toMatchObject({
      gbifEtter: 58,
      gbifFor: 51,
      egneEtter: 1,
      egneFor: 1,
      ukenEtter: 59,
      ukenFor: 52,
      moden: true,
      gbifOk: true,
      egneOk: true
    });
    for (const u of gbifUrler) {
      expect(u).toContain('occurrenceStatus=PRESENT');
      expect(u).toContain('basisOfRecord=HUMAN_OBSERVATION');
    }
    expect(gbifUrler.some((u) => u.includes('eventDate=2026-08-14,2026-08-20'))).toBe(true);
    expect(gbifUrler.some((u) => u.includes('eventDate=2026-08-07,2026-08-13'))).toBe(true);
    expect(gbifUrler.some((u) => u.includes('2026-08-14,2026-08-21') || u.includes('2026-08-07,2026-08-14'))).toBe(false);
    expect(filtre).toContainEqual(['gte', 'found_at', '2026-08-13T22:00:00.000Z']);
    expect(filtre).toContainEqual(['lt', 'found_at', '2026-08-20T22:00:00.000Z']);
    expect(filtre).toContainEqual(['gte', 'found_at', '2026-08-06T22:00:00.000Z']);
    expect(filtre).toContainEqual(['lt', 'found_at', '2026-08-13T22:00:00.000Z']);
    // «Fant ingen sopp» er ikke et funn.
    expect(filtre.filter(([op, k, v]) => op === 'eq' && k === 'is_negative_observation' && v === false)).toHaveLength(2);
  });

  it('uten GBIF-svar: gbifOk=false og aldri moden', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: false }));
    const db = fakeDb(() => ({ count: 0, error: null }), []);
    const fasit = await beregnFasit(db, 'Trondheim', '2026-08-01', new Date('2026-09-05T12:00:00Z'));
    expect(fasit).toMatchObject({ gbifOk: false, moden: false });
  });

  it('feiler tellingen av egne funn: egneOk=false og aldri moden — ingen stille null', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: true, json: async () => ({ count: 10 }) }));
    const db = fakeDb(() => ({ count: null, error: { message: 'nede' } }), []);
    const fasit = await beregnFasit(db, 'Trondheim', '2026-08-01', new Date('2026-09-05T12:00:00Z'));
    expect(fasit).toMatchObject({ gbifOk: true, egneOk: false, moden: false, egneEtter: 0 });
  });
});
