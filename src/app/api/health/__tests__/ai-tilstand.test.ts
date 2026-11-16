import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import type { KindwiseStatusResultat } from '@/lib/identifications/kindwise-status';

/**
 * /api/health er offentlig. checks.ai skal si OM AI-en virker, med en grov
 * tilstand — aldri hvor mange Kindwise-kreditter som er igjen, og aldri
 * Kindwise sin egen svartekst. Tallene står i eierens dagsrapport.
 *
 * Kjører den ekte ruta; Supabase og Kindwise-kallet er erstattet.
 */

let kindwiseSvar: KindwiseStatusResultat;
const hent = vi.fn(async () => kindwiseSvar);

vi.mock('@/lib/identifications/kindwise-status', async (importOriginal) => {
  const ekte = await importOriginal<typeof import('@/lib/identifications/kindwise-status')>();
  return { ...ekte, hentKindwiseStatus: () => hent() };
});
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    from: () => {
      const b: Record<string, unknown> = {
        select: () => b,
        limit: () => Promise.resolve({ error: null, data: [] })
      };
      return b;
    }
  })
}));
const logger = vi.hoisted(() => {
  const l = { info: vi.fn(), debug: vi.fn(), trace: vi.fn(), error: vi.fn(), warn: vi.fn(), child: () => l };
  return l;
});
vi.mock('@/lib/log/request', () => ({ createRequestLogger: () => logger }));

function status(igjen: number | null, over: Partial<{ aktiv: boolean; kanBruke: boolean; grunn: string | null }> = {}): KindwiseStatusResultat {
  return {
    ok: true,
    status: { aktiv: true, kanBruke: true, grunn: null, igjen, bruktUke: 3, bruktMaaned: 9, bruktTotalt: 40, ...over }
  };
}

let teller = 0;
async function kall() {
  // Ny modul per kall: checkAi mellomlagrer i fem minutter på modulnivå.
  vi.resetModules();
  const { GET } = await import('../route');
  teller += 1;
  const res = await GET({
    headers: new Headers({ 'x-forwarded-for': `10.0.0.${teller}` }),
    url: 'http://x/api/health',
    nextUrl: new URL('http://x/api/health')
  } as unknown as NextRequest);
  return { res, tekst: await res.text() };
}

beforeEach(() => {
  vi.stubEnv('PLANTID_API_KEY', 'k'.repeat(40));
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://abc.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon');
  hent.mockClear();
  logger.warn.mockClear();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('helsesjekkens AI-svar er grovt', () => {
  it('nok kreditter: ok, uten tallet', async () => {
    kindwiseSvar = status(1873);
    const { tekst } = await kall();
    const ai = JSON.parse(tekst).checks.ai;
    expect(ai).toMatchObject({ ok: true, tilstand: 'ok' });
    expect(tekst).not.toContain('1873');
    expect(tekst).not.toMatch(/kreditter igjen/i);
  });

  it('få kreditter: fortsatt ok, tilstand lav, uten tallet', async () => {
    kindwiseSvar = status(57);
    const { tekst } = await kall();
    expect(JSON.parse(tekst).checks.ai).toMatchObject({ ok: true, tilstand: 'lav' });
    expect(tekst).not.toContain('57');
  });

  it('sperret nøkkel: ikke ok, uten grunn og tall i svaret — men i loggen', async () => {
    kindwiseSvar = status(0, { kanBruke: false, grunn: 'credit limit exceeded' });
    const { tekst } = await kall();
    expect(JSON.parse(tekst).checks.ai).toMatchObject({ ok: false, tilstand: 'sperret' });
    expect(tekst).not.toContain('credit limit exceeded');
    expect(logger.warn).toHaveBeenCalledWith('health.ai_detalj', expect.objectContaining({ grunn: 'credit limit exceeded', igjen: 0 }));
  });

  it('Kindwise svarer ikke: svarteksten deres står ikke i det offentlige svaret', async () => {
    kindwiseSvar = { ok: false, httpStatus: 500, feil: 'internal stack trace at worker-7' };
    const { tekst } = await kall();
    expect(JSON.parse(tekst).checks.ai).toMatchObject({ ok: false, tilstand: 'utilgjengelig' });
    expect(tekst).not.toContain('worker-7');
  });

  it('avvist nøkkel (401) er sperret', async () => {
    kindwiseSvar = { ok: false, httpStatus: 401, feil: 'Unauthorized' };
    const { tekst } = await kall();
    expect(JSON.parse(tekst).checks.ai).toMatchObject({ ok: false, tilstand: 'sperret' });
  });

  it('uten nøkkel: mangler-nokkel, og Kindwise spørres ikke', async () => {
    vi.stubEnv('PLANTID_API_KEY', '');
    const { tekst } = await kall();
    expect(JSON.parse(tekst).checks.ai).toMatchObject({ ok: false, tilstand: 'mangler-nokkel' });
    expect(hent).not.toHaveBeenCalled();
  });

  it('AI teller fortsatt ikke mot 503', async () => {
    kindwiseSvar = { ok: false, httpStatus: 401, feil: 'Unauthorized' };
    const { res } = await kall();
    expect(res.status).toBe(200);
  });
});
