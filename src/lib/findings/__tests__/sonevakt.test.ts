import { describe, expect, it } from 'vitest';
import { sonerute042, sonerute075 } from '../sonerute';
import { sikreSonefunn, sonevaktGjelder, type SonevaktKlient } from '../sonevakt';

/**
 * Sonevakta: et sone-funn med et røpende punkt blir privat eller slettes —
 * aldri stående offentlig. Klienten er en mock; ingenting skrives noe sted.
 */

interface Oppsett {
  privat?: { data: Record<string, unknown> | null; error: { code?: string; message?: string } | null } | 'kaster';
  slett?: { data: unknown[] | null; error: { code?: string; message?: string } | null } | 'kaster';
}

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

  it('sletter også når privat-kallet kaster (nettverk)', async () => {
    const { klient } = lagKlient({ privat: 'kaster' });
    const utfall = await sikreSonefunn(klient, args(radMed(sonerute042(LAT, LNG, KM))));
    expect(utfall).toMatchObject({ utfall: 'slettet', privatFeil: 'TypeError' });
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
