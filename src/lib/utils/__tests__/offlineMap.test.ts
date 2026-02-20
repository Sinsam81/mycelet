import { describe, expect, it } from 'vitest';
import { getTileUrlsForBounds, latLngToTile } from '../offlineMap';

describe('offline map helpers', () => {
  it('converts coordinates to positive tile coordinates', () => {
    const tile = latLngToTile(59.91, 10.75, 12);
    expect(tile.x).toBeGreaterThanOrEqual(0);
    expect(tile.y).toBeGreaterThanOrEqual(0);
  });

  it('builds tile urls for a bounding box', () => {
    const urls = getTileUrlsForBounds(
      {
        south: 59.85,
        west: 10.6,
        north: 59.96,
        east: 10.9
      },
      11
    );

    expect(urls.length).toBeGreaterThan(0);
    expect(urls[0]).toContain('cache.kartverket.no');
    expect(urls[0]).toContain('/11/');
  });
});
