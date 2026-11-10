import { describe, expect, it } from 'vitest';
import { erManglendeTabell, tellRader, tolkTelling } from '../tabell-finnes';

describe('erManglendeTabell', () => {
  it('kjenner igjen både PostgREST og Postgres sin kode', () => {
    expect(erManglendeTabell({ code: 'PGRST205', message: 'Could not find the table' })).toBe(true);
    expect(erManglendeTabell({ code: '42P01', message: 'relation does not exist' })).toBe(true);
  });

  it('forveksler ikke manglende kolonne, RLS-avslag eller ingen feil med manglende tabell', () => {
    expect(erManglendeTabell({ code: 'PGRST204', message: 'column not found' })).toBe(false);
    expect(erManglendeTabell({ code: '42501', message: 'permission denied' })).toBe(false);
    expect(erManglendeTabell({ message: '' })).toBe(false);
    expect(erManglendeTabell(null)).toBe(false);
    expect(erManglendeTabell(undefined)).toBe(false);
  });
});

describe('tolkTelling', () => {
  it('HEAD mot en tabell som ikke finnes: klienten svelger 404, ingen feil og ikke noe tall', () => {
    // Nøyaktig det postgrest-js gir: 404 med tom kropp blir status 204.
    expect(tolkTelling({ error: null, count: null, status: 204 })).toEqual({ mangler: true });
  });

  it('null rader er et ekte svar, ikke «mangler»', () => {
    expect(tolkTelling({ error: null, count: 0, status: 200 })).toEqual({ antall: 0 });
    expect(tolkTelling({ error: null, count: 17, status: 206 })).toEqual({ antall: 17 });
  });

  it('feilkoden for manglende tabell gir «mangler» også når den kommer med', () => {
    expect(tolkTelling({ error: { code: 'PGRST205', message: 'x' }, count: null })).toEqual({ mangler: true });
    expect(tolkTelling({ error: { code: '42P01', message: 'x' }, count: null })).toEqual({ mangler: true });
  });

  it('andre feil er feil — og en tom HEAD-melding erstattes av statusen', () => {
    expect(tolkTelling({ error: { message: '' }, count: null, status: 503 })).toEqual({ feil: 'HTTP 503' });
    expect(tolkTelling({ error: { code: '42501', message: 'permission denied' }, count: null })).toEqual({
      feil: 'permission denied'
    });
  });
});

describe('tellRader', () => {
  it('venter på spørringen og tolker svaret', async () => {
    await expect(tellRader(Promise.resolve({ error: null, count: 3 }))).resolves.toEqual({ antall: 3 });
    await expect(tellRader(Promise.resolve({ error: null, count: null }))).resolves.toEqual({ mangler: true });
  });
});
