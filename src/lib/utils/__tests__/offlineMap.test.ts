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
  it('converts coordinates to positive tile coordinates', () => {
    const tile = latLngToTile(59.91, 10.75, 12);
    expect(tile.x).toBeGreaterThanOrEqual(0);
    expect(tile.y).toBeGreaterThanOrEqual(0);
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
