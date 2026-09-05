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

describe('beregnFasit — vinduene som faktisk sendes til kildene', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('GBIF får inklusive sjudagersvinduer, egne funn halvåpne i Oslo-tid', async () => {
    const gbifUrler: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      gbifUrler.push(url);
      return { ok: true, json: async () => ({ count: url.includes('2026-08-14,2026-08-20') ? 58 : 51 }) };
    });

    const funnFiltre: Array<[string, string, string]> = [];
    const db = {
      from: () => {
        const b: Record<string, unknown> = {
          select: () => b,
          gte: (k: string, v: string) => (k === 'found_at' && funnFiltre.push(['gte', k, v]), b),
          lte: () => b,
          lt: (k: string, v: string) => (k === 'found_at' && funnFiltre.push(['lt', k, v]), b),
          is: () => Promise.resolve({ count: 1, error: null })
        };
        return b;
      }
    };

    const fasit = await beregnFasit(db, 'Trondheim', '2026-08-14', new Date('2026-09-05T12:00:00Z'));
    expect(fasit).toMatchObject({ ukenEtter: 58 + 1, ukenFor: 51 + 1, moden: true, gbifOk: true });
    expect(gbifUrler.some((u) => u.includes('eventDate=2026-08-14,2026-08-20'))).toBe(true);
    expect(gbifUrler.some((u) => u.includes('eventDate=2026-08-07,2026-08-13'))).toBe(true);
    // Aldri det gamle åttedagersvinduet med varseldagen i begge.
    expect(gbifUrler.some((u) => u.includes('2026-08-14,2026-08-21') || u.includes('2026-08-07,2026-08-14'))).toBe(false);
    expect(funnFiltre).toContainEqual(['gte', 'found_at', '2026-08-13T22:00:00.000Z']);
    expect(funnFiltre).toContainEqual(['lt', 'found_at', '2026-08-20T22:00:00.000Z']);
    expect(funnFiltre).toContainEqual(['gte', 'found_at', '2026-08-06T22:00:00.000Z']);
    expect(funnFiltre).toContainEqual(['lt', 'found_at', '2026-08-13T22:00:00.000Z']);
  });

  it('uten GBIF-svar: gbifOk=false og aldri moden', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: false }));
    const db = { from: () => ({ select: () => ({ gte: () => ({ lte: () => ({ gte: () => ({ lte: () => ({ gte: () => ({ lt: () => ({ is: async () => ({ count: 0, error: null }) }) }) }) }) }) }) }) }) };
    const fasit = await beregnFasit(db, 'Trondheim', '2026-08-01', new Date('2026-09-05T12:00:00Z'));
    expect(fasit).toMatchObject({ gbifOk: false, moden: false });
  });
});
