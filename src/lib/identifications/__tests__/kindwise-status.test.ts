import { describe, expect, it } from 'vitest';
import { erAiNokkelSatt, hentKindwiseStatus, tolkUsageInfo } from '../kindwise-status';

/** Ordrett svaret Kindwise ga 29. sep 2026, før første vellykkede kall. */
const SVAR = {
  active: true,
  credit_limits: { day: null, week: null, month: null, total: 2050 },
  used: { day: 0.0, week: 0.0, month: 0.0, total: 0.0 },
  can_use_credits: { value: true, reason: null },
  remaining: { day: null, week: null, month: null, total: 2050.0 }
};

describe('tolkUsageInfo', () => {
  it('leser aktiv, kan bruke, igjen og brukt fra Kindwise sitt svar', () => {
    expect(tolkUsageInfo(SVAR)).toEqual({
      aktiv: true,
      kanBruke: true,
      grunn: null,
      igjen: 2050,
      bruktUke: 0,
      bruktMaaned: 0,
      bruktTotalt: 0
    });
  });

  it('tom kvote: kanBruke false med grunn, igjen 0', () => {
    const s = tolkUsageInfo({ ...SVAR, can_use_credits: { value: false, reason: 'no credits' }, remaining: { total: 0 } });
    expect(s.kanBruke).toBe(false);
    expect(s.grunn).toBe('no credits');
    expect(s.igjen).toBe(0);
  });

  it('tåler et svar uten feltene — null, aldri NaN eller et kast', () => {
    const s = tolkUsageInfo({});
    expect(s).toEqual({ aktiv: false, kanBruke: false, grunn: null, igjen: null, bruktUke: null, bruktMaaned: null, bruktTotalt: null });
    expect(tolkUsageInfo(null).igjen).toBeNull();
  });
});

describe('hentKindwiseStatus', () => {
  it('sender nøkkelen i Api-Key og tolker et 200', async () => {
    let sendtHeader: string | undefined;
    const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
      sendtHeader = (init?.headers as Record<string, string>)['Api-Key'];
      return new Response(JSON.stringify(SVAR), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await hentKindwiseStatus('nokkel-som-er-lang-nok-1234', fetchImpl);
    expect(sendtHeader).toBe('nokkel-som-er-lang-nok-1234');
    expect(r).toEqual({ ok: true, status: tolkUsageInfo(SVAR) });
  });

  it('ugyldig nøkkel → ok:false med Kindwise sin tekst og statuskode', async () => {
    const fetchImpl = (async () => new Response('The specified api key not found.', { status: 401 })) as unknown as typeof fetch;
    const r = await hentKindwiseStatus('x'.repeat(30), fetchImpl);
    expect(r).toEqual({ ok: false, httpStatus: 401, feil: 'The specified api key not found.' });
  });

  it('nettfeil kaster aldri — den blir {ok:false}', async () => {
    const fetchImpl = (async () => {
      throw new Error('fetch failed');
    }) as unknown as typeof fetch;
    const r = await hentKindwiseStatus('x'.repeat(30), fetchImpl);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.feil).toBe('fetch failed');
  });
});

describe('erAiNokkelSatt', () => {
  it('avviser tom, plassholder og for kort', () => {
    expect(erAiNokkelSatt(undefined)).toBe(false);
    expect(erAiNokkelSatt('your-api-key-here')).toBe(false);
    expect(erAiNokkelSatt('kort')).toBe(false);
    expect(erAiNokkelSatt('x'.repeat(20))).toBe(true);
  });
});
