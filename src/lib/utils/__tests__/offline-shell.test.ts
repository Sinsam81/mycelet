import { describe, expect, it } from 'vitest';
import {
  OSM_TILE_TEMPLATE,
  TERRAIN_TILE_TEMPLATE,
  getTileUrlsForBounds
} from '../offlineMap';
import {
  TILE_SIZE,
  buildTileGrid,
  latLngToTile,
  parseAreas,
  projectToGrid,
  readLocale,
  tileUrl
} from '../../../../public/offline/offline-map.js';

const OSLO_BOUNDS = { south: 59.85, west: 10.6, north: 59.96, east: 10.9 };

describe('offline-skallet (public/offline/offline-map.js)', () => {
  it('spør etter nøyaktig de flis-URL-ene lagringen la i cachen', () => {
    // Dette er hele poenget med skallet: det skal vise fliser som ALLEREDE
    // ligger i mycelet-map-tiles-v1. Bommer den ene URL-en på den andre med ett
    // tegn — {s}-subdomenet, rekkefølgen på {x}/{y} — blir kartet tomt i skogen
    // uten at noe feiler synlig.
    for (const template of [TERRAIN_TILE_TEMPLATE, OSM_TILE_TEMPLATE]) {
      const saved = new Set(getTileUrlsForBounds(OSLO_BOUNDS, 12, template));
      const grid = buildTileGrid(OSLO_BOUNDS, 12);

      expect(grid.tiles.length).toBeGreaterThan(0);
      for (const tile of grid.tiles) {
        expect(saved, `${template} → ${tile.x}/${tile.y}`).toContain(tileUrl(template, tile.x, tile.y, 12));
      }
    }
  });

  it('bruker samme flis-matematikk som lagringen', () => {
    // Samme fasit som offlineMap.test.ts: 12/2170/1191 er flisa med Oslo i seg.
    expect(latLngToTile(59.91, 10.75, 12)).toEqual({ x: 2170, y: 1191 });
    expect(latLngToTile(57.7089, 11.9746, 12)).toEqual({ x: 2184, y: 1239 });
  });

  it('dekker hele det lagrede området', () => {
    const grid = buildTileGrid(OSLO_BOUNDS, 12);

    for (const [lat, lng] of [
      [OSLO_BOUNDS.north, OSLO_BOUNDS.west],
      [OSLO_BOUNDS.south, OSLO_BOUNDS.east]
    ] as const) {
      const point = projectToGrid(grid, lat, lng);
      expect(point.inside, `${lat},${lng} må ligge i rutenettet`).toBe(true);
    }
  });

  it('setter posisjonsprikken der brukeren faktisk står', () => {
    const grid = buildTileGrid(OSLO_BOUNDS, 12);
    const west = projectToGrid(grid, 59.91, OSLO_BOUNDS.west + 0.01);
    const east = projectToGrid(grid, 59.91, OSLO_BOUNDS.east - 0.01);
    const north = projectToGrid(grid, OSLO_BOUNDS.north - 0.01, 10.75);
    const south = projectToGrid(grid, OSLO_BOUNDS.south + 0.01, 10.75);

    // Øst er til høyre, sør er nedover. Snur et fortegn seg, peker prikken feil
    // vei i terrenget — verre enn ingen prikk.
    expect(east.x).toBeGreaterThan(west.x);
    expect(south.y).toBeGreaterThan(north.y);

    // Prikken skal treffe innenfor flisa den hører hjemme i.
    const tile = latLngToTile(59.91, 10.75, 12);
    const point = projectToGrid(grid, 59.91, 10.75);
    expect(Math.floor(point.x / TILE_SIZE) + grid.minX).toBe(tile.x);
    expect(Math.floor(point.y / TILE_SIZE) + grid.minY).toBe(tile.y);
  });

  it('vet at brukeren står utenfor kartområdet', () => {
    const grid = buildTileGrid(OSLO_BOUNDS, 12);
    // Trondheim, langt utenfor et lagret Oslo-område.
    expect(projectToGrid(grid, 63.43, 10.4).inside).toBe(false);
  });

  it('klipper svære områder ned til et rutenett vi klarer å tegne', () => {
    const heleNorden = { south: 55, west: 4, north: 71, east: 31 };
    const grid = buildTileGrid(heleNorden, 12);

    expect(grid.columns).toBeLessThanOrEqual(12);
    expect(grid.rows).toBeLessThanOrEqual(12);
    expect(grid.tiles.length).toBe(grid.columns * grid.rows);
  });

  it('overlever tull i localStorage', () => {
    expect(parseAreas(null)).toEqual([]);
    expect(parseAreas('{ikke json')).toEqual([]);
    expect(parseAreas('{"nope":1}')).toEqual([]);
    expect(parseAreas('[{"name":"uten bounds","zoom":12}]')).toEqual([]);

    const gyldig = '[{"name":"Nordmarka","zoom":12,"bounds":{"north":60,"south":59.9,"east":11,"west":10.9}}]';
    expect(parseAreas(gyldig)).toHaveLength(1);
  });

  it('leser språket av samme cookie som resten av appen', () => {
    expect(readLocale('MYCELET_LOCALE=sv')).toBe('sv');
    expect(readLocale('foo=1; MYCELET_LOCALE=sv; bar=2')).toBe('sv');
    expect(readLocale('MYCELET_LOCALE=nb')).toBe('nb');
    expect(readLocale('')).toBe('nb');
    // Ikke la et annet cookienavn som slutter likt lure oss.
    expect(readLocale('ANNET_LOCALE=sv')).toBe('nb');
  });
});
