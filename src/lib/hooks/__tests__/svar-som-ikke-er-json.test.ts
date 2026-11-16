import { afterEach, describe, expect, it, vi } from 'vitest';
import { BETALINGSSTATUS_FEILKODE, BETALINGSSTATUS_FEILTEKST, hentBetalingsstatus } from '../useBilling';
import { PREDIKSJON_FEILKODE, PREDIKSJON_FEILTEKST, hentPrediksjon } from '../usePrediction';

/**
 * En feil på plattformnivå (Vercels 504 når en rute bruker for lang tid, 502
 * fra kanten) svarer med en HTML-side — ikke med rutas `{ error }`. Begge
 * krokene tolket svaret ubetinget som JSON, så feilen ble nettleserens egen
 * SyntaxError («Unexpected token '<' …») i stedet for den norske teksten.
 * useIdentify hadde samme felle og fikk vakten først.
 */

const HTML_504 = '<!DOCTYPE html><html><body><h1>504: GATEWAY_TIMEOUT</h1></body></html>';

/** En oppskrift, ikke et ferdig svar: kroppen i en Response kan bare leses én gang. */
function svarMed(kropp: string, status: number, type = 'application/json'): () => Response {
  return () => new Response(kropp, { status, headers: { 'Content-Type': type } });
}

function stubbHent(lagSvar: () => Response) {
  const hent = vi.fn(async () => lagSvar());
  vi.stubGlobal('fetch', hent);
  return hent;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const PUNKT = { lat: 59.91, lon: 10.75, radiusKm: 15 };

describe('hentPrediksjon', () => {
  it('gir svaret videre når alt er i orden', async () => {
    const hent = stubbHent(svarMed(JSON.stringify({ score: 72, tiles: [] }), 200));
    await expect(hentPrediksjon(PUNKT)).resolves.toEqual({ score: 72, tiles: [] });
    expect(hent).toHaveBeenCalledWith('/api/prediction?lat=59.91&lon=10.75&radiusKm=15');
  });

  it('tar med arten bare når den er valgt', async () => {
    const hent = stubbHent(svarMed('{}', 200));
    await hentPrediksjon({ ...PUNKT, speciesId: 7 });
    expect(hent).toHaveBeenCalledWith('/api/prediction?lat=59.91&lon=10.75&radiusKm=15&speciesId=7');
    await hentPrediksjon({ ...PUNKT, speciesId: null });
    expect(hent).toHaveBeenLastCalledWith('/api/prediction?lat=59.91&lon=10.75&radiusKm=15');
  });

  it('bruker rutas egen feilmelding når den finnes', async () => {
    stubbHent(svarMed(JSON.stringify({ error: 'Ingen værleverandør svarte for området' }), 502));
    await expect(hentPrediksjon(PUNKT)).rejects.toThrow('Ingen værleverandør svarte for området');
  });

  it('en HTML-feilside fra plattformen gir den norske teksten — ikke en SyntaxError', async () => {
    stubbHent(svarMed(HTML_504, 504, 'text/html'));
    const feil = await hentPrediksjon(PUNKT).catch((e: unknown) => e);
    expect(feil).toBeInstanceOf(Error);
    expect(feil).not.toBeInstanceOf(SyntaxError);
    expect((feil as Error).message).toBe(PREDIKSJON_FEILTEKST);
    expect((feil as { code?: string }).code).toBe(PREDIKSJON_FEILKODE);
  });

  it('rutas egen kode følger med når svaret har en', async () => {
    stubbHent(svarMed(JSON.stringify({ error: 'For mange forespørsler', code: 'rate_limited' }), 429));
    const feil = await hentPrediksjon(PUNKT).catch((e: unknown) => e);
    expect((feil as { code?: string }).code).toBe('rate_limited');
  });

  it('et 200-svar som ikke er JSON er også en feil, ikke et tomt resultat', async () => {
    stubbHent(svarMed(HTML_504, 200, 'text/html'));
    await expect(hentPrediksjon(PUNKT)).rejects.toThrow(PREDIKSJON_FEILTEKST);
  });
});

describe('hentBetalingsstatus', () => {
  const STATUS = {
    capabilities: { tier: 'season_pass', status: 'active', paid: true, aiDailyLimit: null },
    subscription: null,
    kanFaaProve: false
  };

  it('gir statusen videre, og ber om et ferskt svar', async () => {
    const hent = stubbHent(svarMed(JSON.stringify(STATUS), 200));
    await expect(hentBetalingsstatus()).resolves.toEqual(STATUS);
    expect(hent).toHaveBeenCalledWith('/api/billing/status', { cache: 'no-store' });
  });

  it('401 er «ikke logget inn» — null, ikke en feil', async () => {
    stubbHent(svarMed(JSON.stringify({ error: 'Du må være logget inn' }), 401));
    await expect(hentBetalingsstatus()).resolves.toBeNull();
  });

  it('bruker rutas egen feilmelding når den finnes', async () => {
    stubbHent(svarMed(JSON.stringify({ error: 'For mange forespørsler' }), 429));
    await expect(hentBetalingsstatus()).rejects.toThrow('For mange forespørsler');
  });

  it('en HTML-feilside fra plattformen gir den norske teksten — ikke en SyntaxError', async () => {
    stubbHent(svarMed(HTML_504, 504, 'text/html'));
    const feil = await hentBetalingsstatus().catch((e: unknown) => e);
    expect(feil).toBeInstanceOf(Error);
    expect(feil).not.toBeInstanceOf(SyntaxError);
    expect((feil as Error).message).toBe(BETALINGSSTATUS_FEILTEKST);
    expect((feil as { code?: string }).code).toBe(BETALINGSSTATUS_FEILKODE);
  });

  it('rutas egen kode følger med når svaret har en', async () => {
    stubbHent(svarMed(JSON.stringify({ error: 'For mange forespørsler', code: 'rate_limited' }), 429));
    const feil = await hentBetalingsstatus().catch((e: unknown) => e);
    expect((feil as { code?: string }).code).toBe('rate_limited');
  });

  it('et 200-svar som ikke er JSON blir aldri lest som «gratis»', async () => {
    // Uten vakten ville en ødelagt kropp kastet SyntaxError; med en naiv vakt
    // kunne den blitt til `null` — som betyr «ikke logget inn» for kallerne.
    stubbHent(svarMed(HTML_504, 200, 'text/html'));
    await expect(hentBetalingsstatus()).rejects.toThrow(BETALINGSSTATUS_FEILTEKST);
  });
});
