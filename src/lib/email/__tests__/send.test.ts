import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Utsendingen mot Resend, uten nett: fetch er erstattet, så ingen e-post kan
 * gå ut herfra.
 *
 * Det testene vokter mest, er at funksjonen ALDRI henger og ALDRI kaster.
 * Kallet hadde ingen frist — et kall som hang, holdt en hel cron-kjøring (og
 * dermed alle som sto bak i lista) til plattformen drepte den.
 */

const logg = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock('@/lib/log', () => ({ logger: logg }));

import { RESEND_FRIST_MS, manglendeEpostKonfig, sendEpost } from '../send';

interface Kall {
  url: string;
  init: RequestInit & { headers: Record<string, string> };
  kropp: Record<string, unknown>;
}
let kall: Kall[] = [];
let svar: () => Promise<Response> = async () => new Response(JSON.stringify({ id: 'resend-1' }), { status: 200 });

const BREV = { til: 'mottaker@example.com', emne: 'Emne', html: '<p>Hei</p>', tekst: 'Hei' };

beforeEach(() => {
  kall = [];
  svar = async () => new Response(JSON.stringify({ id: 'resend-1' }), { status: 200 });
  vi.stubEnv('RESEND_API_KEY', 'ikke-en-ekte-verdi');
  vi.stubEnv('RESEND_FROM', 'varsel@send.example.com');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: Kall['init']) => {
      kall.push({ url, init, kropp: JSON.parse(String(init.body)) as Record<string, unknown> });
      return svar();
    })
  );
  logg.info.mockClear();
  logg.warn.mockClear();
  logg.error.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('sendEpost', () => {
  it('sender én melding til Resend, fra avsenderen på det verifiserte domenet', async () => {
    const res = await sendEpost(BREV);
    expect(res).toEqual({ ok: true, detalj: 'resend-1' });
    expect(kall).toHaveLength(1);
    expect(kall[0].url).toBe('https://api.resend.com/emails');
    expect(kall[0].init.method).toBe('POST');
    expect(kall[0].kropp).toMatchObject({
      from: 'Mycelet <varsel@send.example.com>',
      to: ['mottaker@example.com'],
      subject: 'Emne',
      html: '<p>Hei</p>',
      text: 'Hei'
    });
    // Uten avmeldingslenke og idempotensnøkkel sendes ingen av hodene.
    expect(kall[0].kropp.headers).toBeUndefined();
    expect(kall[0].init.headers['Idempotency-Key']).toBeUndefined();
  });

  it('uten nøkkel eller avsender: inert — ingenting sendes, og svaret sier hvorfor', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    expect(await sendEpost(BREV)).toEqual({ ok: false, detalj: 'RESEND_API_KEY eller RESEND_FROM mangler' });
    expect(manglendeEpostKonfig()).toEqual(['RESEND_API_KEY']);
    vi.stubEnv('RESEND_API_KEY', 'ikke-en-ekte-verdi');
    vi.stubEnv('RESEND_FROM', '');
    expect((await sendEpost(BREV)).ok).toBe(false);
    expect(manglendeEpostKonfig()).toEqual(['RESEND_FROM']);
    expect(kall).toEqual([]);
  });

  it('avmeldingslenka går ut som List-Unsubscribe med one-click (RFC 8058)', async () => {
    await sendEpost({ ...BREV, avmeldingsUrl: 'https://www.mycelet.com/api/soppvarsel/av?t=abc' });
    expect(kall[0].kropp.headers).toEqual({
      'List-Unsubscribe': '<https://www.mycelet.com/api/soppvarsel/av?t=abc>',
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
    });
  });

  it('idempotensnøkkelen sendes med, og 409 på den betyr «allerede sendt» — ikke en feil', async () => {
    svar = async () => new Response('idempotency key reused with a different payload', { status: 409 });
    const res = await sendEpost({ ...BREV, idempotensNokkel: 'soppvarsel/ab-1/2026-09-15' });
    expect(kall[0].init.headers['Idempotency-Key']).toBe('soppvarsel/ab-1/2026-09-15');
    expect(res.ok).toBe(true);
    // Uten nøkkel er 409 en vanlig avvisning.
    expect((await sendEpost(BREV)).ok).toBe(false);
  });

  it('en avvisning fra Resend gir ok: false med statuskoden — aldri et kast', async () => {
    svar = async () => new Response('{"message":"invalid"}', { status: 422 });
    expect(await sendEpost(BREV)).toEqual({ ok: false, detalj: 'Resend 422' });
  });
});

describe('sendEpost — kallet har en frist', () => {
  it('ber om avbrudd etter RESEND_FRIST_MS', async () => {
    const tidsavbrudd = vi.spyOn(AbortSignal, 'timeout');
    await sendEpost(BREV);
    expect(tidsavbrudd).toHaveBeenCalledWith(RESEND_FRIST_MS);
    expect(kall[0].init.signal).toBeInstanceOf(AbortSignal);
    // Romslig med vilje: en treg, men vellykket utsending skal ikke regnes som
    // feilet (da henter soppvarselet den inn igjen dagen etter — to e-poster).
    expect(RESEND_FRIST_MS).toBeGreaterThanOrEqual(10_000);
    expect(RESEND_FRIST_MS).toBeLessThanOrEqual(30_000);
  });

  it('et kall som henger avbrytes av fristen og svarer ok: false — funksjonen henger ikke og kaster ikke', async () => {
    // Fristen utløses med én gang her, i stedet for å vente femten sekunder.
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => {
      const styring = new AbortController();
      queueMicrotask(() => styring.abort(new DOMException('The operation timed out.', 'TimeoutError')));
      return styring.signal;
    });
    // Et svar som aldri kommer: løftet avgjøres bare når signalet avbryter.
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((_ok, avvis) => {
            init.signal?.addEventListener('abort', () => avvis(init.signal?.reason));
          })
      )
    );
    const res = await sendEpost(BREV);
    expect(res).toEqual({ ok: false, detalj: `Resend svarte ikke innen ${RESEND_FRIST_MS / 1000} s` });
    // Feilen selv er andre argument (Logger.error), konteksten tredje.
    expect(logg.error).toHaveBeenCalledWith('epost.feilet', expect.any(Error), { tidsavbrudd: true });
  });

  it('en nettverksfeil gir ok: false med årsaken — heller ikke den kaster', async () => {
    svar = async () => {
      throw new TypeError('fetch failed');
    };
    expect(await sendEpost(BREV)).toEqual({ ok: false, detalj: 'fetch failed' });
    expect(logg.error).toHaveBeenCalledWith('epost.feilet', expect.any(TypeError), { tidsavbrudd: false });
  });

  it('mottakeradressen logges aldri, heller ikke når det går galt', async () => {
    svar = async () => new Response('rejected', { status: 500 });
    await sendEpost(BREV);
    svar = async () => {
      throw new TypeError('fetch failed');
    };
    await sendEpost(BREV);
    const alt = JSON.stringify([logg.info.mock.calls, logg.warn.mock.calls, logg.error.mock.calls]);
    expect(alt).not.toContain('mottaker@example.com');
  });
});
