import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { sonerute042, sonerute075 } from '@/lib/findings/sonerute';

/**
 * Sonevakta i POST /api/findings. Står den gamle triggeren (075 ikke limt
 * inn), røper sone-punktet funnets eksakte breddegrad. Da skal funnet gjøres
 * privat med en gang, brukeren få beskjed — og om det ikke går, skal raden
 * slettes. Alt mot en mock: ingenting skrives til noen database.
 */

const { s } = vi.hoisted(() => ({
  s: {
    /** Hvordan «triggeren» stempler: 075, den gamle, eller ingen punkt tilbake. */
    trigger: '075' as '075' | '042' | 'uten_punkt',
    privatFeiler: false,
    /** Hvordan privat-kallet feiler: nektet (42501), eller brudd underveis — supabase-js gir da code ''. */
    privatFeilform: 'nektet' as 'nektet' | 'underveis',
    slettFeiler: false,
    sprak: 'nb' as 'nb' | 'sv',
    kall: [] as { type: string; verdier?: unknown; filtre: [string, unknown][] }[],
    insertSelect: '' as string,
    advarsler: [] as [string, Record<string, unknown> | undefined][],
    feil: [] as [string, Record<string, unknown> | undefined][]
  }
}));

vi.mock('@/i18n/locale', () => ({ getUserLocale: async () => s.sprak }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'bruker-1' } } }) },
    from: () => ({
      insert: (v: Record<string, unknown>) => {
        s.kall.push({ type: 'insert', verdier: v, filtre: [] });
        return {
          select: (kolonner: string) => {
            s.insertSelect = kolonner;
            return {
              single: async () => {
                const lat = v.latitude as number;
                const lng = v.longitude as number;
                const km = v.zone_precision_km as number;
                let vist: { lat: number | null; lng: number | null };
                if (v.visibility === 'private') vist = { lat: null, lng: null };
                else if (!v.is_zone_finding) vist = { lat, lng };
                else if (s.trigger === 'uten_punkt') vist = { lat: null, lng: null };
                else vist = s.trigger === '075' ? sonerute075(lat, lng, km) : sonerute042(lat, lng, km);
                return {
                  data: {
                    id: 'funn-1',
                    latitude: lat,
                    longitude: lng,
                    visibility: v.visibility,
                    is_zone_finding: v.is_zone_finding,
                    zone_precision_km: km,
                    display_latitude: vist.lat,
                    display_longitude: vist.lng
                  },
                  error: null
                };
              }
            };
          }
        };
      },
      update: (verdier: unknown) => {
        const k = { type: 'update', verdier, filtre: [] as [string, unknown][] };
        s.kall.push(k);
        const kjede = {
          eq: (kol: string, val: unknown) => {
            k.filtre.push([kol, val]);
            return kjede;
          },
          select: () => ({
            maybeSingle: async () =>
              s.privatFeiler
                ? {
                    data: null,
                    error:
                      s.privatFeilform === 'underveis'
                        ? { code: '', message: 'TypeError: fetch failed', details: '', hint: '' }
                        : { code: '42501', message: 'nektet' }
                  }
                : { data: { visibility: 'private', display_latitude: null, display_longitude: null }, error: null }
          })
        };
        return kjede;
      },
      delete: () => {
        const k = { type: 'delete', filtre: [] as [string, unknown][] };
        s.kall.push(k);
        const kjede = {
          eq: (kol: string, val: unknown) => {
            k.filtre.push([kol, val]);
            return kjede;
          },
          select: async () =>
            s.slettFeiler ? { data: null, error: { code: '500', message: 'nede' } } : { data: [{ id: 'funn-1' }], error: null }
        };
        return kjede;
      }
    })
  })
}));

vi.mock('@/lib/weather', () => ({ fetchWeatherSummary: async () => null }));
vi.mock('@/lib/forest', () => ({ getForestProperties: async () => null }));
vi.mock('@/lib/log/request', () => ({
  createRequestLogger: () => ({
    info: vi.fn(),
    warn: (navn: string, data?: Record<string, unknown>) => s.advarsler.push([navn, data]),
    error: (navn: string, data?: Record<string, unknown>) => s.feil.push([navn, data]),
    debug: vi.fn(),
    trace: vi.fn()
  })
}));

import { POST } from '../route';

const LAT = 59.98765;
const LNG = 10.71234;

function lagre(ekstra: Record<string, unknown>) {
  return POST(
    new NextRequest('http://localhost/api/findings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ latitude: LAT, longitude: LNG, ...ekstra })
    })
  );
}

const SONE = { visibility: 'approximate', isZoneFinding: true, zoneLabel: 'Skogen', zonePrecisionKm: 5 };

beforeEach(() => {
  s.trigger = '075';
  s.privatFeiler = false;
  s.privatFeilform = 'nektet';
  s.slettFeiler = false;
  s.sprak = 'nb';
  s.kall = [];
  s.insertSelect = '';
  s.advarsler = [];
  s.feil = [];
});

/** Ingen logglinje får bære koordinatene vakta skjuler. */
function ingenKoordinaterILoggen() {
  const tekst = JSON.stringify([...s.advarsler, ...s.feil]);
  expect(tekst).not.toContain(String(LAT));
  expect(tekst).not.toContain(String(LNG));
  expect(tekst).not.toMatch(/display_l|latitude|longitude/);
}

describe('POST /api/findings — sonevakta', () => {
  it('leser punktet tilbake i samme kall som innsettingen', async () => {
    await lagre(SONE);
    expect(s.insertSelect).toContain('display_latitude');
    expect(s.insertSelect).toContain('display_longitude');
  });

  it('gjør ingenting når punktet er 075 sitt', async () => {
    const res = await lagre(SONE);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, id: 'funn-1' });
    expect(body.notice).toBeUndefined();
    expect(s.kall.map((k) => k.type)).toEqual(['insert']);
    expect(s.advarsler).toEqual([]);
  });

  it('gjør sone-funnet privat og sier fra, når den gamle triggeren stemplet det', async () => {
    s.trigger = '042';
    const res = await lagre(SONE);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.id).toBe('funn-1');
    expect(body.notice.code).toBe('zone_saved_private');
    expect(body.notice.message).toContain('privat');
    expect(body.notice.message).toContain('Mine steder');

    expect(s.kall.map((k) => k.type)).toEqual(['insert', 'update']);
    expect(s.kall[1]).toMatchObject({
      verdier: { visibility: 'private' },
      filtre: [
        ['id', 'funn-1'],
        ['user_id', 'bruker-1']
      ]
    });
    expect(s.advarsler.map(([navn]) => navn)).toEqual(['findings.zone_stamp_unsafe']);
    ingenKoordinaterILoggen();
  });

  it('skriver beskjeden på svensk for en svensk leser', async () => {
    s.trigger = '042';
    s.sprak = 'sv';
    const body = await (await lagre(SONE)).json();
    expect(body.notice.code).toBe('zone_saved_private');
    expect(body.notice.message).toContain('Mina platser');
  });

  it('behandler en rad uten punkt tilbake som utrygg', async () => {
    s.trigger = 'uten_punkt';
    const body = await (await lagre(SONE)).json();
    expect(body.notice?.code).toBe('zone_saved_private');
    expect(s.kall.map((k) => k.type)).toEqual(['insert', 'update']);
  });

  it('sletter raden og svarer med feil når privat ikke går', async () => {
    s.trigger = '042';
    s.privatFeiler = true;
    const res = await lagre(SONE);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe('zone_not_saved');
    expect(body.error).toContain('IKKE lagret');
    expect(s.kall.map((k) => k.type)).toEqual(['insert', 'update', 'delete']);
    expect(s.kall[2].filtre).toEqual([
      ['id', 'funn-1'],
      ['user_id', 'bruker-1']
    ]);
    expect(s.feil).toContainEqual([
      'findings.zone_private_failed',
      { findingId: 'funn-1', privatFeil: '42501', slettet: true }
    ]);
    ingenKoordinaterILoggen();
  });

  it('svarer aldri «lagret som privat» når privat-kallet feilet underveis (feil med tom kode)', async () => {
    s.trigger = '042';
    s.privatFeiler = true;
    s.privatFeilform = 'underveis';
    const res = await lagre(SONE);
    expect(res.status).toBe(500);
    expect((await res.json()).code).toBe('zone_not_saved');
    expect(s.kall.map((k) => k.type)).toEqual(['insert', 'update', 'delete']);
    expect(s.feil).toContainEqual([
      'findings.zone_private_failed',
      { findingId: 'funn-1', privatFeil: 'TypeError: fetch failed', slettet: true }
    ]);
  });

  it('svarer med feil — aldri suksess — når også slettingen feiler', async () => {
    s.trigger = '042';
    s.privatFeiler = true;
    s.slettFeiler = true;
    const res = await lagre(SONE);
    expect(res.status).toBe(500);
    expect((await res.json()).ok).toBeUndefined();
    expect(s.feil.map(([navn]) => navn)).toContain('findings.zone_private_failed');
    ingenKoordinaterILoggen();
  });

  it('kjører aldri for vanlige funn, uansett triggeren', async () => {
    s.trigger = '042';
    for (const visibility of ['public', 'approximate', 'private']) {
      s.kall = [];
      const body = await (await lagre({ visibility })).json();
      expect(body.notice).toBeUndefined();
      expect(s.kall.map((k) => k.type)).toEqual(['insert']);
    }
    expect(s.advarsler).toEqual([]);
  });
});
