import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * «Fant du sopp her?» — feilsvarene.
 *
 * Ruta svarte hardkodet norsk, og loggen fikk ikke databasefeilen: kommentaren
 * i ruta lovet at koden ble logget, men `log.error(hendelse, { code, message })`
 * tar objektet som `err`-argument og skriver det som «[object Object]». En
 * manglende tabell (migrasjon 021) ville vært en 500 uten spor.
 */

const s = vi.hoisted(() => ({
  sprak: 'nb' as 'nb' | 'sv',
  bruker: { id: 'bruker-1' } as { id: string } | null,
  innsettingsfeil: null as { code: string; message: string } | null,
  rader: [] as Array<Record<string, unknown>>,
  logg: [] as Array<{ hendelse: string; err: unknown; ctx: unknown }>
}));

vi.mock('@/i18n/locale', () => ({ getUserLocale: async () => s.sprak }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: () => ({ allowed: true }) }));
vi.mock('@/lib/rate-limit/route', () => ({
  getClientKey: () => 'test',
  rateLimitResponse: () => new Response(null, { status: 429 })
}));
vi.mock('@/lib/weather', () => ({ fetchWeatherSummary: async () => null }));
vi.mock('@/lib/forest', () => ({ getForestProperties: async () => null }));
vi.mock('@/lib/log/request', () => {
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    error: (hendelse: string, err: unknown, ctx: unknown) => s.logg.push({ hendelse, err, ctx }),
    child: () => logger
  };
  return { createRequestLogger: () => logger };
});
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: s.bruker } }) },
    from: () => ({
      insert: async (rad: Record<string, unknown>) => {
        if (!s.innsettingsfeil) s.rader.push(rad);
        return { error: s.innsettingsfeil };
      }
    })
  })
}));

const { POST } = await import('../route');

const NAA = '2026-09-15T10:00:00Z';
const send = (body: unknown) =>
  POST(
    new NextRequest('https://mycelet.com/api/spot-feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    })
  );
const GYLDIG = { lat: 59.791234, lng: 10.659876, found: true, visitedAt: NAA };

beforeAll(() => {
  // Ruta avviser besøk mer enn 90 døgn tilbake eller ett døgn fram.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NAA));
});

afterAll(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  s.sprak = 'nb';
  s.bruker = { id: 'bruker-1' };
  s.innsettingsfeil = null;
  s.rader = [];
  s.logg = [];
});

describe('POST /api/spot-feedback', () => {
  it('lagrer en gyldig tilbakemelding', async () => {
    const res = await send(GYLDIG);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(s.rader[0]).toMatchObject({ user_id: 'bruker-1', found: true, latitude: 59.79123, longitude: 10.65988 });
  });

  it('uten innlogging: 401 med kode — kartet forgrener på statusen', async () => {
    s.bruker = null;
    const res = await send(GYLDIG);
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe('unauthenticated');
  });

  it('en ugyldig tilbakemelding: 400 med kode, på leserens språk', async () => {
    s.sprak = 'sv';
    const res = await send({ ...GYLDIG, found: 'ja' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Ogiltig feedback.', code: 'feedback_invalid' });
    expect(s.rader).toEqual([]);
  });

  it('et besøk for langt tilbake avvises som ugyldig', async () => {
    const res = await send({ ...GYLDIG, visitedAt: '2026-01-01T10:00:00Z' });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('feedback_invalid');
  });

  it('databasen sier nei: oversatt feil med kode, og den rå feilen i loggen med kode og melding', async () => {
    s.innsettingsfeil = {
      code: 'PGRST205',
      message: "Could not find the table 'public.spot_feedback' in the schema cache"
    };
    s.sprak = 'sv';
    const res = await send(GYLDIG);
    expect(res.status).toBe(500);
    const tekst = await res.text();
    expect(JSON.parse(tekst)).toEqual({ error: 'Kunde inte spara din feedback.', code: 'feedback_save_failed' });
    expect(tekst).not.toContain('schema cache');
    // Var «[object Object]»: objektet ble sendt som err-argumentet.
    expect(s.logg).toEqual([
      {
        hendelse: 'spot_feedback.insert_failed',
        err: undefined,
        ctx: { code: 'PGRST205', message: "Could not find the table 'public.spot_feedback' in the schema cache" }
      }
    ]);
  });
});
