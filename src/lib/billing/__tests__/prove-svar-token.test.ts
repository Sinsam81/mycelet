import { afterEach, describe, expect, it } from 'vitest';
import { erProveSvarValg, lagProveSvarToken, lesProveSvarToken, proveSvarHemmelighet, proveSvarUrl } from '../prove-svar-token';

/**
 * Lenka i e-posten skal kunne trykkes uten innlogging, uten at noen kan
 * svare for andre: bruker og prøveslutt står i klartekst, HMAC-en binder
 * dem til serverens hemmelighet. Endres én byte, avvises tokenet.
 */
const BRUKER = '11111111-2222-4333-8444-555555555555';
const HEMMELIG = 'test-tjenestenokkel-som-ikke-er-ekte';

describe('prove-svar-token', () => {
  it('rundtur: det som lages, leses tilbake', () => {
    const token = lagProveSvarToken(BRUKER, '2026-09-27', HEMMELIG);
    expect(lesProveSvarToken(token, HEMMELIG)).toEqual({ userId: BRUKER, proveSlutt: '2026-09-27' });
    // Deterministisk: samme inn gir samme token (idempotent lenke i e-posten).
    expect(lagProveSvarToken(BRUKER, '2026-09-27', HEMMELIG)).toBe(token);
    // Ren ASCII uten tegn som trenger URL-koding.
    expect(token).toMatch(/^[0-9a-f-]{36}\.\d{4}-\d{2}-\d{2}\.[0-9a-f]{64}$/);
  });

  it('bruker-ID leses uavhengig av store/små bokstaver, og returneres små', () => {
    const token = lagProveSvarToken(BRUKER.toUpperCase(), '2026-09-27', HEMMELIG);
    expect(lesProveSvarToken(token, HEMMELIG)).toEqual({ userId: BRUKER, proveSlutt: '2026-09-27' });
  });

  it('tukling avvises: annen bruker, annen dato, endret signatur, annen hemmelighet', () => {
    const token = lagProveSvarToken(BRUKER, '2026-09-27', HEMMELIG);
    const [, dato, sig] = token.split('.');
    expect(lesProveSvarToken(`22222222-2222-4333-8444-555555555555.${dato}.${sig}`, HEMMELIG)).toBeNull();
    expect(lesProveSvarToken(`${BRUKER}.2026-09-28.${sig}`, HEMMELIG)).toBeNull();
    const vippet = (sig[0] === '0' ? '1' : '0') + sig.slice(1);
    expect(lesProveSvarToken(`${BRUKER}.${dato}.${vippet}`, HEMMELIG)).toBeNull();
    expect(lesProveSvarToken(token, 'en-annen-hemmelighet')).toBeNull();
  });

  it('ugyldig form avvises før noen signatur regnes', () => {
    expect(lesProveSvarToken(null, HEMMELIG)).toBeNull();
    expect(lesProveSvarToken('', HEMMELIG)).toBeNull();
    expect(lesProveSvarToken('a.b', HEMMELIG)).toBeNull();
    expect(lesProveSvarToken(`ikke-uuid.2026-09-27.${'a'.repeat(64)}`, HEMMELIG)).toBeNull();
    expect(lesProveSvarToken(`${BRUKER}.27.09.2026.${'a'.repeat(64)}`, HEMMELIG)).toBeNull();
    expect(lesProveSvarToken(`${BRUKER}.2026-09-27.forkort`, HEMMELIG)).toBeNull();
    expect(lesProveSvarToken(`${BRUKER}.2026-13-45.${'a'.repeat(64)}`, HEMMELIG)).toBeNull();
    expect(lesProveSvarToken('x'.repeat(500), HEMMELIG)).toBeNull();
  });

  it('nekter å lage token av noe som ikke er en bruker-ID og en dato', () => {
    expect(() => lagProveSvarToken('meg', '2026-09-27', HEMMELIG)).toThrow();
    expect(() => lagProveSvarToken(BRUKER, '27.9.2026', HEMMELIG)).toThrow();
  });

  it('valgene er nøyaktig de tre i e-posten', () => {
    expect(erProveSvarValg('omrader')).toBe(true);
    expect(erProveSvarValg('offline')).toBe(true);
    expect(erProveSvarValg('ai')).toBe(true);
    expect(erProveSvarValg('annet')).toBe(false);
    expect(erProveSvarValg(null)).toBe(false);
  });

  it('lenka bærer token, valg og språk — aldri en adresse', () => {
    const token = lagProveSvarToken(BRUKER, '2026-09-27', HEMMELIG);
    const url = proveSvarUrl('https://www.mycelet.com', token, 'offline', 'sv');
    expect(url).toBe(`https://www.mycelet.com/api/prove/svar?t=${token}&valg=offline&sprak=sv`);
    expect(url).not.toMatch(/@/);
  });
});

describe('proveSvarHemmelighet', () => {
  const opprinnelig = process.env.SUPABASE_SERVICE_ROLE_KEY;
  afterEach(() => {
    if (opprinnelig === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = opprinnelig;
  });

  it('avledes av tjenestenøkkelen; uten den finnes ingen hemmelighet', () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'nokkel';
    expect(proveSvarHemmelighet()).toBe('nokkel');
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(proveSvarHemmelighet()).toBeNull();
    process.env.SUPABASE_SERVICE_ROLE_KEY = '';
    expect(proveSvarHemmelighet()).toBeNull();
  });

  it('tokenet røper ikke hemmeligheten', () => {
    const token = lagProveSvarToken(BRUKER, '2026-09-27', HEMMELIG);
    expect(token).not.toContain(HEMMELIG);
  });
});
