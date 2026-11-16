import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  OfflineArea,
  OSM_TILE_TEMPLATE,
  SATELLITE_TILE_TEMPLATE,
  TERRAIN_TILE_TEMPLATE,
  getTileUrlsForBounds,
  latLngToTile,
  offlineAreaTileUrls,
  removeOfflineAreaTiles
} from '../offlineMap';

const OSLO_BOUNDS = { south: 59.85, west: 10.6, north: 59.96, east: 10.9 };
const GOTHENBURG_BOUNDS = { south: 57.6, west: 11.8, north: 57.8, east: 12.1 };

describe('offline map helpers', () => {
  // Den gamle testen her sjekket bare `tile.y >= 0`. Det er sant for enhver
  // breddegrad, også en gal — og den var grønn hele tiden mens funksjonen
  // regnet ut fliser fra Nordishavet. Testene under kan faktisk feile.
  it('treffer den flisa Leaflet faktisk viser', () => {
    // Fasit regnet ut med standard Web Mercator (OSM slippy map tilenames).
    // Kontrollert mot Kartverket: 12/1191/2170 er 111 250 bytes med Oslo i seg,
    // mens den gamle formelens 12/335/2170 er 854 bytes tomt hav.
    expect(latLngToTile(59.91, 10.75, 12)).toEqual({ x: 2170, y: 1191 });
    expect(latLngToTile(57.7089, 11.9746, 12)).toEqual({ x: 2184, y: 1239 }); // Göteborg
    expect(latLngToTile(0, 0, 1)).toEqual({ x: 1, y: 1 }); // ekvator/Greenwich
  });

  it('holder nordiske breddegrader unna Arktis', () => {
    // Feilen ga 80-86°N for alt fra Göteborg til Tromsø. En flis midt i
    // Norge skal ligge i den nedre halvdelen av rutenettet, ikke helt oppe.
    for (const [navn, lat] of [['Oslo', 59.91], ['Trondheim', 63.43], ['Tromsø', 69.65]] as const) {
      const { y } = latLngToTile(lat, 10.75, 12);
      const n = 2 ** 12;
      // Tilbake til breddegrad — flisa vi valgte må dekke punktet vi ba om.
      const topLat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
      const bottomLat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 1)) / n))) * 180) / Math.PI;
      expect(lat, `${navn} må ligge inne i flisa si`).toBeLessThanOrEqual(topLat);
      expect(lat, `${navn} må ligge inne i flisa si`).toBeGreaterThanOrEqual(bottomLat);
    }
  });

  it('gir stigende y sørover', () => {
    const nord = latLngToTile(69.65, 18.96, 10).y;
    const midt = latLngToTile(59.91, 10.75, 10).y;
    const sor = latLngToTile(57.71, 11.97, 10).y;
    expect(nord).toBeLessThan(midt);
    expect(midt).toBeLessThan(sor);
  });

  it('defaults to the Kartverket (Terreng) template', () => {
    const urls = getTileUrlsForBounds(OSLO_BOUNDS, 11);

    expect(urls.length).toBeGreaterThan(0);
    expect(urls[0]).toContain('cache.kartverket.no');
    expect(urls[0]).toContain('/11/');
  });

  it('caches OSM tiles (for Sweden) with a resolved {s} subdomain', () => {
    const urls = getTileUrlsForBounds(GOTHENBURG_BOUNDS, 11, OSM_TILE_TEMPLATE);

    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      // No literal placeholder left — Leaflet requests a/b/c.tile..., and the
      // cache key must match exactly or the offline map goes blank.
      expect(url).not.toContain('{s}');
      expect(url).toMatch(/^https:\/\/[abc]\.tile\.openstreetmap\.org\/11\/\d+\/\d+\.png$/);
    }
  });

  it('caches Esri satellite tiles when that layer is active', () => {
    const urls = getTileUrlsForBounds(OSLO_BOUNDS, 11, SATELLITE_TILE_TEMPLATE);

    expect(urls.length).toBeGreaterThan(0);
    expect(urls[0]).toContain('server.arcgisonline.com');
    expect(urls[0]).toContain('/World_Imagery/MapServer/tile/11/');
  });
});

/**
 * «Slett» på et lagret område frigjorde NULL lagring: removeOfflineAreaById rørte
 * bare localStorage, så området forsvant fra lista mens flisene ble liggende i
 * CacheStorage for alltid. En Kartverket-topoflis er rundt 74 kB og hver lagring
 * tar inntil 550 av dem — åtte områder er flere hundre megabyte brukeren verken
 * kunne se eller rydde.
 */
const AREA: OfflineArea = {
  id: 'omraade-1',
  name: 'Nordmarka',
  centerLat: 59.91,
  centerLng: 10.75,
  zoom: 11,
  bounds: OSLO_BOUNDS,
  cachedTiles: 40,
  failedTiles: 0,
  createdAt: '2026-08-01T10:00:00Z',
  tileTemplate: TERRAIN_TILE_TEMPLATE,
  zoomLevels: [10, 11, 12]
};

describe('offlineAreaTileUrls', () => {
  it('regner ut nøyaktig de flisene området lagret', () => {
    const urls = offlineAreaTileUrls(AREA);
    const forventet = new Set(
      [10, 11, 12].flatMap((z) => getTileUrlsForBounds(OSLO_BOUNDS, z, TERRAIN_TILE_TEMPLATE))
    );
    expect(new Set(urls)).toEqual(forventet);
    for (const url of urls) expect(url).toContain('cache.kartverket.no');
  });

  it('rydder gamle områder uten lagret mal med alle tre bakgrunnskartene', () => {
    // Områder lagret før malen ble skrevet ned kan ha brukt hvilken som helst av
    // dem. Å slette en URL som ikke ligger i cachen er en no-op.
    const legacy = { ...AREA, tileTemplate: undefined, zoomLevels: undefined };
    const urls = offlineAreaTileUrls(legacy);
    expect(urls.some((u) => u.includes('cache.kartverket.no'))).toBe(true);
    expect(urls.some((u) => u.includes('tile.openstreetmap.org'))).toBe(true);
    expect(urls.some((u) => u.includes('server.arcgisonline.com'))).toBe(true);
  });
});

describe('removeOfflineAreaTiles', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sletter flisene fra CacheStorage, ikke bare linja i lista', async () => {
    const deleted: string[] = [];
    const cache = {
      delete: vi.fn(async (url: string) => {
        deleted.push(url);
        return true;
      })
    };
    vi.stubGlobal('caches', { open: vi.fn(async () => cache) });
    vi.stubGlobal('window', { caches: {} });

    const count = await removeOfflineAreaTiles(AREA);
    expect(count).toBe(offlineAreaTileUrls(AREA).length);
    expect(count).toBeGreaterThan(0);
    expect(new Set(deleted)).toEqual(new Set(offlineAreaTileUrls(AREA)));
  });

  it('kaster ikke når CacheStorage ikke finnes', async () => {
    vi.stubGlobal('window', {});
    await expect(removeOfflineAreaTiles(AREA)).resolves.toBe(0);
  });
});

/**
 * To lagrede områder som overlapper, DELER fliser: samme sted, zoom og
 * bakgrunnskart gir samme URL. Slettingen av det ene tok derfor med seg kartet
 * til det andre — det sto igjen i lista med «550 fliser» og var blankt uten
 * dekning. Verst ved lagring med full liste: dekket det eldste området (som da
 * kastes ut) samme sted som det nye, ble flisene til området som nettopp var
 * lagret, slettet i samme øyeblikk.
 */
describe('removeOfflineAreaTiles — fliser andre lagrede områder deler, blir liggende', () => {
  afterEach(() => vi.unstubAllGlobals());

  /** En cache med akkurat disse flisene i; `delete` fjerner dem som en ekte Cache. */
  function settOppCache(urler: string[]) {
    const lagret = new Set(urler);
    const cache = { delete: vi.fn(async (url: string) => lagret.delete(url)) };
    vi.stubGlobal('caches', { open: vi.fn(async () => cache) });
    vi.stubGlobal('window', { caches: {} });
    return lagret;
  }

  /** Samme skog lagret en gang til, forskjøvet litt østover — overlapper AREA. */
  const NABO: OfflineArea = {
    ...AREA,
    id: 'omraade-2',
    name: 'Nordmarka øst',
    bounds: { ...OSLO_BOUNDS, west: OSLO_BOUNDS.west + 0.15, east: OSLO_BOUNDS.east + 0.15 }
  };

  it('testområdene overlapper faktisk, og har også fliser hver for seg', () => {
    const a = new Set(offlineAreaTileUrls(AREA));
    const b = new Set(offlineAreaTileUrls(NABO));
    const felles = [...a].filter((url) => b.has(url));
    expect(felles.length).toBeGreaterThan(0);
    expect(felles.length).toBeLessThan(a.size);
    expect(felles.length).toBeLessThan(b.size);
  });

  it('«Slett» på det ene området lar det andres kart stå helt', async () => {
    const lagret = settOppCache([...offlineAreaTileUrls(AREA), ...offlineAreaTileUrls(NABO)]);
    const naboFor = offlineAreaTileUrls(NABO);

    const fjernet = await removeOfflineAreaTiles(AREA, [AREA, NABO]);

    // Hver eneste flis naboen trenger, ligger der fortsatt.
    for (const url of naboFor) expect(lagret.has(url), url).toBe(true);
    // Og det som bare AREA eide, er borte — slettingen frigjør fortsatt lagring.
    const bareArea = offlineAreaTileUrls(AREA).filter((url) => !naboFor.includes(url));
    expect(bareArea.length).toBeGreaterThan(0);
    for (const url of bareArea) expect(lagret.has(url), url).toBe(false);
    expect(fjernet).toBe(bareArea.length);
  });

  it('lagring med full liste: området som kastes ut tar ikke med seg flisene til det som nettopp ble lagret', async () => {
    // Samme sted lagret på nytt: det nye området og det eldste har nøyaktig
    // de samme flisene.
    const nytt: OfflineArea = { ...AREA, id: 'omraade-nytt', createdAt: '2026-09-20T07:00:00Z' };
    const lagret = settOppCache(offlineAreaTileUrls(nytt));

    const fjernet = await removeOfflineAreaTiles(AREA, [nytt, NABO]);

    expect(fjernet).toBe(0);
    expect(lagret.size).toBe(offlineAreaTileUrls(nytt).length);
  });

  it('området selv i lista over dem som skal beholdes verner ingenting — ellers ble aldri noe slettet', async () => {
    const lagret = settOppCache(offlineAreaTileUrls(AREA));
    const fjernet = await removeOfflineAreaTiles(AREA, [AREA]);
    expect(fjernet).toBe(offlineAreaTileUrls(AREA).length);
    expect(lagret.size).toBe(0);
  });

  it('et annet bakgrunnskart over samme sted er andre fliser, og verner ikke', async () => {
    const sammeStedOsm: OfflineArea = { ...AREA, id: 'omraade-osm', tileTemplate: OSM_TILE_TEMPLATE };
    const lagret = settOppCache([...offlineAreaTileUrls(AREA), ...offlineAreaTileUrls(sammeStedOsm)]);

    await removeOfflineAreaTiles(AREA, [sammeStedOsm]);

    for (const url of offlineAreaTileUrls(AREA)) expect(lagret.has(url)).toBe(false);
    for (const url of offlineAreaTileUrls(sammeStedOsm)) expect(lagret.has(url)).toBe(true);
  });

  it('uten andre områder slettes alt området eier, som før', async () => {
    const lagret = settOppCache(offlineAreaTileUrls(AREA));
    expect(await removeOfflineAreaTiles(AREA)).toBe(offlineAreaTileUrls(AREA).length);
    expect(lagret.size).toBe(0);
  });
});
