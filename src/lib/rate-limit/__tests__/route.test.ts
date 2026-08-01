import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RateLimitResult } from '../index';

/**
 * Feilteksten ved rate-limit genereres på serveren, så next-intl dekker den
 * ikke — samme felle prediksjonstekstene gikk i. En svensk bruker som traff en
 * grense fikk norsk beskjed.
 *
 * Hjelperen kalles fra 18 rutehandlere. Derfor slår den opp språket selv i
 * stedet for å kreve en parameter hver enkelt rute kunne glemme; testene under
 * dekker begge veier.
 */

let mockLocale: 'nb' | 'sv' = 'nb';
let localeThrows = false;

vi.mock('@/i18n/locale', () => ({
  getUserLocale: async () => {
    if (localeThrows) throw new Error('utenfor request-kontekst');
    return mockLocale;
  }
}));

const { rateLimitResponse, getClientKey } = await import('../route');

const blocked: RateLimitResult = {
  allowed: false,
  remaining: 0,
  resetAt: 1_700_000_000_000,
  retryAfterSeconds: 42
};

beforeEach(() => {
  mockLocale = 'nb';
  localeThrows = false;
});

describe('språket følger leseren', () => {
  it('norsk bruker får norsk', async () => {
    const body = await (await rateLimitResponse(blocked)).json();
    expect(body.error).toBe('For mange forespørsler — prøv igjen om litt');
  });

  it('svensk bruker får svensk', async () => {
    mockLocale = 'sv';
    const body = await (await rateLimitResponse(blocked)).json();
    expect(body.error).toBe('För många förfrågningar — försök igen om en stund');
  });

  it('teksten er faktisk ulik — ikke bare norsk med annen tegnsetting', async () => {
    const nb = (await (await rateLimitResponse(blocked)).json()).error;
    mockLocale = 'sv';
    const sv = (await (await rateLimitResponse(blocked)).json()).error;
    expect(nb).not.toBe(sv);
    expect(sv).toContain('förfrågningar');
  });

  it('en rute som allerede kjenner språket kan sende det inn', async () => {
    mockLocale = 'nb'; // ville gitt norsk hvis parameteren ble ignorert
    const body = await (await rateLimitResponse(blocked, 'sv')).json();
    expect(body.error).toContain('försök igen');
  });
});

describe('en 429 skal aldri bli en 500', () => {
  it('faller tilbake på norsk hvis språkoppslaget kaster', async () => {
    localeThrows = true;
    const res = await rateLimitResponse(blocked);
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe('For mange forespørsler — prøv igjen om litt');
  });
});

describe('svaret for øvrig', () => {
  it('har status 429', async () => {
    expect((await rateLimitResponse(blocked)).status).toBe(429);
  });

  it('setter Retry-After når vi vet hvor lenge', async () => {
    const res = await rateLimitResponse(blocked);
    expect(res.headers.get('Retry-After')).toBe('42');
  });

  it('utelater Retry-After når vi ikke vet', async () => {
    const res = await rateLimitResponse({ ...blocked, retryAfterSeconds: null });
    expect(res.headers.get('Retry-After')).toBeNull();
  });

  it('oppgir gjenstående og nullstillingstidspunkt', async () => {
    const res = await rateLimitResponse(blocked);
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('0');
    // resetAt er i millisekunder, headeren i sekunder.
    expect(res.headers.get('X-RateLimit-Reset')).toBe('1700000000');
  });

  it('tar med retryAfterSeconds i kroppen, så klienten kan telle ned', async () => {
    expect((await (await rateLimitResponse(blocked)).json()).retryAfterSeconds).toBe(42);
  });
});

describe('getClientKey', () => {
  const req = (headers: Record<string, string>) =>
    ({ headers: { get: (k: string) => headers[k.toLowerCase()] ?? null } }) as never;

  it('innlogget bruker nøkles på bruker-id, ikke IP', () => {
    // Stabilt på tvers av mobilnett og NAT.
    expect(getClientKey(req({ 'x-forwarded-for': '1.2.3.4' }), 'bruker-1')).toBe('user:bruker-1');
  });

  it('utlogget nøkles på første ledd i x-forwarded-for', () => {
    expect(getClientKey(req({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }), null)).toBe('ip:1.2.3.4');
  });

  it('faller tilbake på x-real-ip', () => {
    expect(getClientKey(req({ 'x-real-ip': '9.9.9.9' }), null)).toBe('ip:9.9.9.9');
  });

  it('ukjent trafikk deler én bøtte — den riktige feilmodusen', () => {
    // Alternativet ville vært at uidentifiserbar trafikk slapp unna grensen.
    expect(getClientKey(req({}), null)).toBe('ip:unknown');
  });
});
