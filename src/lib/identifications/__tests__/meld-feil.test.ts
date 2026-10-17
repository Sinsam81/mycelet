import { beforeEach, describe, expect, it, vi } from 'vitest';

const captureMessage = vi.fn();
// Et vanlig flagg, ikke en kastende spion: Vitest markerer testen som feilet
// når en vi.fn() kaster, selv om koden under test fanger feilen.
let sentryKaster = false;
vi.mock('@sentry/nextjs', () => ({
  captureMessage: (...a: unknown[]) => {
    captureMessage(...a);
    if (sentryKaster) throw new Error('sentry nede');
  }
}));

const { feilnokkel, meldIdentifiseringsfeil } = await import('../meld-feil');

beforeEach(() => {
  captureMessage.mockReset();
  sentryKaster = false;
});

describe('meldIdentifiseringsfeil', () => {
  it('Vercels 413 (HTML, ingen kode) blir én hendelse gruppert på steg og status, med bildestørrelsene', () => {
    meldIdentifiseringsfeil({ steg: 'foresporsel', status: 413, json: false, bildetegn: [1_900_000, 1_800_000, 1_200_000] });
    expect(captureMessage).toHaveBeenCalledTimes(1);
    const [melding, kontekst] = captureMessage.mock.calls[0];
    expect(melding).toBe('Identifisering feilet: foresporsel (413)');
    expect(kontekst.level).toBe('warning');
    expect(kontekst.fingerprint).toEqual(['identifisering-feilet', 'foresporsel', '413']);
    expect(kontekst.tags).toEqual({ område: 'identifisering', steg: 'foresporsel', status: '413', json: 'false' });
    expect(kontekst.extra).toMatchObject({ antallBilder: 3, totaltTegn: 4_900_000 });
  });

  it('rutens kode vinner over statusen i grupperingen', () => {
    meldIdentifiseringsfeil({ steg: 'foresporsel', status: 401, kode: 'unauthenticated', json: true });
    expect(captureMessage.mock.calls[0][1].fingerprint).toEqual(['identifisering-feilet', 'foresporsel', 'unauthenticated']);
  });

  it('en kastet feil (kamera, nettverk) grupperes på feilnavnet og tar med en avkortet tekst', () => {
    const feil = new Error('User denied access to camera'.padEnd(500, '.'));
    feil.name = 'CameraError';
    meldIdentifiseringsfeil({ steg: 'kamera', feil });
    const kontekst = captureMessage.mock.calls[0][1];
    expect(kontekst.fingerprint).toEqual(['identifisering-feilet', 'kamera', 'CameraError']);
    expect(kontekst.extra.feiltekst).toHaveLength(200);
    expect(kontekst.extra.feilnavn).toBe('CameraError');
  });

  it('kvoteveggen og «AI ikke aktivert» er forventede tilstander, ikke feil', () => {
    meldIdentifiseringsfeil({ steg: 'foresporsel', status: 429, kode: 'daily_quota', json: true });
    meldIdentifiseringsfeil({ steg: 'foresporsel', status: 503, kode: 'ai_disabled', json: true });
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it('sender aldri bildene eller noe som ligner en posisjon', () => {
    meldIdentifiseringsfeil({ steg: 'foresporsel', status: 500, kode: 'unexpected', json: true, bildetegn: [10, 20] });
    const tekst = JSON.stringify(captureMessage.mock.calls[0]);
    expect(tekst).not.toMatch(/base64|latitude|longitude|data:image/i);
  });

  it('kaster aldri, selv om Sentry gjør det', () => {
    sentryKaster = true;
    expect(() => meldIdentifiseringsfeil({ steg: 'bilde', feil: new Error('x') })).not.toThrow();
    expect(captureMessage).toHaveBeenCalledTimes(1);
  });

  it('feilnokkel faller tilbake til «ukjent»', () => {
    expect(feilnokkel({ steg: 'bilde' })).toBe('ukjent');
  });
});
