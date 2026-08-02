import { describe, expect, it } from 'vitest';
import {
  OSM_TILE_TEMPLATE,
  SATELLITE_TILE_TEMPLATE,
  getTileUrlsForBounds,
  latLngToTile
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
