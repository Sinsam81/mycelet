import { describe, expect, it } from 'vitest';
import { PostgrestClient } from '@supabase/postgrest-js';
import { sonerute042, sonerute075 } from '../sonerute';
import { sikreSonefunn, sonevaktGjelder, type SonevaktKlient } from '../sonevakt';

/**
 * Sonevakta: et sone-funn med et røpende punkt blir privat eller slettes —
 * aldri stående offentlig. Klienten er en mock; ingenting skrives noe sted.
 */

type Feilsvar = { code?: string; message?: string; details?: string; hint?: string } | null;

interface Oppsett {
  /** 'kaster' kaster en TypeError; en Error kastes som den er. */
  privat?: { data: Record<string, unknown> | null; error: Feilsvar } | 'kaster' | Error;
  slett?: { data: unknown[] | null; error: Feilsvar } | 'kaster' | Error;
}

/**
 * Slik svarer supabase-js når et kall feiler underveis (brudd, tidsavbrudd):
 * den kaster ikke, men gir en feil med tom kode. Formen er den postgrest-js
 * 2.105 lager — testene nederst lar den ekte klienten lage den selv.
 */
const FEILET_UNDERVEIS = {
  message: 'TypeError: fetch failed',
  details: 'TypeError: fetch failed\n\nCaused by: Error: read ECONNRESET (ECONNRESET)',
  hint: '',
  code: ''
};

function lagKlient(oppsett: Oppsett = {}) {
  const kall: { type: string; verdier?: unknown; filtre: [string, string][] }[] = [];
  const klient = {
    from: (tabell: string) => {
      expect(tabell).toBe('findings');
      return {
        update: (verdier: unknown) => {
          const k = { type: 'update', verdier, filtre: [] as [string, string][] };
          kall.push(k);
          const kjede = {
            eq: (kol: string, v: string) => {
              k.filtre.push([kol, v]);
              return kjede;
            },
            select: () => ({
              maybeSingle: async () => {
                if (oppsett.privat === 'kaster') throw new TypeError('fetch failed');
                if (oppsett.privat instanceof Error) throw oppsett.privat;
                return (
                  oppsett.privat ?? {
                    data: { visibility: 'private', display_latitude: null, display_longitude: null },
                    error: null
                  }
                );
              }
            })
          };
          return kjede;
        },
        delete: () => {
          const k = { type: 'delete', filtre: [] as [string, string][] };
          kall.push(k);
          const kjede = {
            eq: (kol: string, v: string) => {
              k.filtre.push([kol, v]);
              return kjede;
            },
            select: async () => {
              if (oppsett.slett === 'kaster') throw new TypeError('fetch failed');
              if (oppsett.slett instanceof Error) throw oppsett.slett;
              return oppsett.slett ?? { data: [{ id: 'funn-1' }], error: null };
            }
          };
          return kjede;
        }
      };
    }
  };
  return { klient: klient as unknown as SonevaktKlient, kall };
}

const LAT = 59.98765;
const LNG = 10.71234;
const KM = 5;

function radMed(vist: { lat: number; lng: number } | null) {
  return {
    latitude: LAT,
    longitude: LNG,
    zone_precision_km: KM,
    display_latitude: vist?.lat ?? null,
    display_longitude: vist?.lng ?? null
  };
}

const args = (rad: ReturnType<typeof radMed> | null) => ({ id: 'funn-1', userId: 'bruker-1', rad });

describe('sonevaktGjelder', () => {
  it('gjelder bare sone-funn som ikke er private', () => {
    expect(sonevaktGjelder({ isZoneFinding: true, visibility: 'approximate' })).toBe(true);
    expect(sonevaktGjelder({ isZoneFinding: true, visibility: 'private' })).toBe(false);
    expect(sonevaktGjelder({ isZoneFinding: false, visibility: 'approximate' })).toBe(false);
    expect(sonevaktGjelder({ isZoneFinding: false, visibility: 'public' })).toBe(false);
  });
});

describe('sikreSonefunn', () => {
  it('gjør ingenting når punktet er 075 sitt', async () => {
    const { klient, kall } = lagKlient();
    expect(await sikreSonefunn(klient, args(radMed(sonerute075(LAT, LNG, KM))))).toEqual({ utfall: 'stemmer' });
    expect(kall).toEqual([]);
  });

  it('gjør funnet privat når den gamle triggeren stemplet det — bare eierens egen rad', async () => {
    const { klient, kall } = lagKlient();
    const utfall = await sikreSonefunn(klient, args(radMed(sonerute042(LAT, LNG, KM))));
    expect(utfall).toEqual({ utfall: 'gjort_privat', grunn: 'gammelt_stempel' });
    expect(kall).toHaveLength(1);
    expect(kall[0]).toMatchObject({
      type: 'update',
      verdier: { visibility: 'private' },
      filtre: [
        ['id', 'funn-1'],
        ['user_id', 'bruker-1']
      ]
    });
  });

  it('behandler en rad uten punkt som utrygg — vi står ikke inne for det vi ikke har sett', async () => {
    const { klient } = lagKlient();
    expect(await sikreSonefunn(klient, args(radMed(null)))).toEqual({ utfall: 'gjort_privat', grunn: 'uleselig' });
    expect(await sikreSonefunn(klient, args(null))).toEqual({ utfall: 'gjort_privat', grunn: 'uleselig' });
  });

  it('sletter raden når privat feiler', async () => {
    const { klient, kall } = lagKlient({ privat: { data: null, error: { code: '42501' } } });
    const utfall = await sikreSonefunn(klient, args(radMed(sonerute042(LAT, LNG, KM))));
    expect(utfall).toEqual({ utfall: 'slettet', grunn: 'gammelt_stempel', privatFeil: '42501' });
    expect(kall.map((k) => k.type)).toEqual(['update', 'delete']);
    expect(kall[1].filtre).toEqual([
      ['id', 'funn-1'],
      ['user_id', 'bruker-1']
    ]);
  });

  it('godtar ikke privat før raden kom tilbake privat OG uten punkt', async () => {
    for (const data of [
      null,
      { visibility: 'approximate', display_latitude: null, display_longitude: null },
      { visibility: 'private', display_latitude: 60.0, display_longitude: null }
    ]) {
      const { klient, kall } = lagKlient({ privat: { data, error: null } });
      const utfall = await sikreSonefunn(klient, args(radMed(sonerute042(LAT, LNG, KM))));
      expect(utfall.utfall).toBe('slettet');
      expect(kall.map((k) => k.type)).toEqual(['update', 'delete']);
    }
  });

  it('sletter også når privat-kallet kaster', async () => {
    // supabase-js kaster ikke ved et brudd underveis — den svarer med en feil
    // med tom kode (testene under). Dette dekker en klient som kaster likevel.
    const { klient } = lagKlient({ privat: 'kaster' });
    const utfall = await sikreSonefunn(klient, args(radMed(sonerute042(LAT, LNG, KM))));
    expect(utfall).toMatchObject({ utfall: 'slettet', privatFeil: 'TypeError' });
  });

  it('sletter når privat-kallet feilet underveis — feilen har tom kode, og det er fortsatt en feil', async () => {
    const { klient, kall } = lagKlient({ privat: { data: null, error: FEILET_UNDERVEIS } });
    const utfall = await sikreSonefunn(klient, args(radMed(sonerute042(LAT, LNG, KM))));
    expect(utfall).toEqual({ utfall: 'slettet', grunn: 'gammelt_stempel', privatFeil: 'TypeError: fetch failed' });
    expect(kall.map((k) => k.type)).toEqual(['update', 'delete']);
  });

  it('sletter når privat-kallet fikk et feilsvar uten kropp ({ message: "" })', async () => {
    const { klient, kall } = lagKlient({ privat: { data: null, error: { message: '' } } });
    const utfall = await sikreSonefunn(klient, args(radMed(sonerute042(LAT, LNG, KM))));
    expect(utfall).toEqual({ utfall: 'slettet', grunn: 'gammelt_stempel', privatFeil: 'ukjent' });
    expect(kall.map((k) => k.type)).toEqual(['update', 'delete']);
  });

  it('melder at raden sto igjen når slettingen feilet underveis — aldri «slettet»', async () => {
    const { klient } = lagKlient({ privat: { data: null, error: null }, slett: { data: null, error: FEILET_UNDERVEIS } });
    expect(await sikreSonefunn(klient, args(radMed(sonerute042(LAT, LNG, KM))))).toEqual({
      utfall: 'sto_igjen',
      grunn: 'gammelt_stempel',
      privatFeil: 'ingen_rad',
      slettFeil: 'TypeError: fetch failed'
    });
  });

  it('teller også en kastet feil uten navn som en feil', async () => {
    const navnlos = new Error('uten navn');
    navnlos.name = '';
    const { klient } = lagKlient({ privat: navnlos, slett: navnlos });
    expect(await sikreSonefunn(klient, args(radMed(sonerute042(LAT, LNG, KM))))).toEqual({
      utfall: 'sto_igjen',
      grunn: 'gammelt_stempel',
      privatFeil: 'kastet',
      slettFeil: 'kastet'
    });
  });

  it('melder at raden sto igjen når både privat og sletting feiler', async () => {
    const { klient } = lagKlient({ privat: { data: null, error: { code: '500' } }, slett: { data: null, error: { code: '500' } } });
    expect(await sikreSonefunn(klient, args(radMed(sonerute042(LAT, LNG, KM))))).toEqual({
      utfall: 'sto_igjen',
      grunn: 'gammelt_stempel',
      privatFeil: '500',
      slettFeil: '500'
    });
  });

  it('teller ikke en sletting som traff null rader som slettet', async () => {
    const { klient } = lagKlient({ privat: { data: null, error: null }, slett: { data: [], error: null } });
    expect(await sikreSonefunn(klient, args(radMed(sonerute042(LAT, LNG, KM))))).toMatchObject({
      utfall: 'sto_igjen',
      slettFeil: 'ingen_rad'
    });
  });

  it('melder at raden sto igjen når slettingen kaster', async () => {
    const { klient } = lagKlient({ privat: 'kaster', slett: 'kaster' });
    expect(await sikreSonefunn(klient, args(radMed(sonerute042(LAT, LNG, KM))))).toMatchObject({ utfall: 'sto_igjen' });
  });
});

describe('sikreSonefunn med den ekte postgrest-klienten', () => {
  // Mocken over sier hva vi tror klienten svarer. Her lager klienten svarene
  // selv, så en ny versjon som endrer formen, felles her. Ingen nettverk:
  // fetch er byttet ut, og adressen går ingen steder.
  type Svar = () => Promise<Response>;

  function ekteKlient(svar: { PATCH: Svar; DELETE: Svar }) {
    const metoder: string[] = [];
    const fetch = async (_url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const metode = init?.method ?? 'GET';
      metoder.push(metode);
      if (metode !== 'PATCH' && metode !== 'DELETE') throw new Error(`uventet ${metode}`);
      return svar[metode]();
    };
    const klient = new PostgrestClient('http://postgrest.invalid', { fetch }) as unknown as SonevaktKlient;
    return { klient, metoder };
  }

  const brudd: Svar = async () => {
    throw new TypeError('fetch failed', { cause: Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }) });
  };
  const json =
    (kropp: unknown, status = 200): Svar =>
    async () =>
      new Response(JSON.stringify(kropp), { status, headers: { 'Content-Type': 'application/json' } });
  const tomtFeilsvar: Svar = async () => new Response('', { status: 502 });
  const privatRad = json([{ visibility: 'private', display_latitude: null, display_longitude: null }]);
  const slettetRad = json([{ id: 'funn-1' }]);
  const gammelt = () => args(radMed(sonerute042(LAT, LNG, KM)));

  it('gjør funnet privat når raden kommer tilbake privat — og sletter ingenting', async () => {
    const { klient, metoder } = ekteKlient({ PATCH: privatRad, DELETE: slettetRad });
    expect(await sikreSonefunn(klient, gammelt())).toEqual({ utfall: 'gjort_privat', grunn: 'gammelt_stempel' });
    expect(metoder).toEqual(['PATCH']);
  });

  it('sletter når privat-kallet feiler underveis eller får et tomt feilsvar — aldri «gjort privat»', async () => {
    for (const [PATCH, privatFeil] of [
      [brudd, 'TypeError: fetch failed'],
      [tomtFeilsvar, 'ukjent']
    ] as const) {
      const { klient, metoder } = ekteKlient({ PATCH, DELETE: slettetRad });
      expect(await sikreSonefunn(klient, gammelt())).toEqual({ utfall: 'slettet', grunn: 'gammelt_stempel', privatFeil });
      expect(metoder).toEqual(['PATCH', 'DELETE']);
    }
  });

  it('melder at raden sto igjen når også slettingen feiler underveis', async () => {
    const { klient, metoder } = ekteKlient({ PATCH: json([]), DELETE: brudd });
    expect(await sikreSonefunn(klient, gammelt())).toEqual({
      utfall: 'sto_igjen',
      grunn: 'gammelt_stempel',
      privatFeil: 'ingen_rad',
      slettFeil: 'TypeError: fetch failed'
    });
    expect(metoder).toEqual(['PATCH', 'DELETE']);
  });
});
